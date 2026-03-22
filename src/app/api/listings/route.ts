import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";
import { logSystemEvent } from "@/lib/events";
import { deleteFacebookPost, deleteFacebookCampaign, updateFacebookPost } from "@/lib/integrations/facebook";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");
    const platform = searchParams.get("platform");
    const id = searchParams.get("id");

    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
    };
    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (platform) where.platform = platform;
    if (id) where.id = id;

    const listings = await prisma.listing.findMany({
      where,
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(listings);
  } catch (error) {
    console.error("Failed to fetch listings:", error);
    return NextResponse.json(
      { error: "Failed to fetch listings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const {
      propertyId, title, description, price, unitId, platform,
      photos, metadata, bedrooms, bathrooms, availableDate,
      adBudget, adDurationDays,
    } = body;

    if (!propertyId || !title || !description || price == null) {
      return NextResponse.json(
        { error: "propertyId, title, description, and price are required" },
        { status: 400 }
      );
    }

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    // If unitId provided, verify unit belongs to property
    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: unitId, propertyId },
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Unit not found for this property" },
          { status: 404 }
        );
      }
    }

    const listing = await prisma.listing.create({
      data: {
        propertyId,
        organizationId: ctx.organizationId,
        title,
        description,
        price,
        unitId: unitId ?? null,
        platform: platform ?? "FACEBOOK",
        photos: photos ?? null,
        metadata: metadata ?? null,
        bedrooms: bedrooms ?? null,
        bathrooms: bathrooms ?? null,
        availableDate: availableDate ? new Date(availableDate) : null,
        adBudget: adBudget ?? null,
        adDurationDays: adDurationDays ?? null,
        status: "DRAFT",
      },
    });

    await logSystemEvent(
      { action: "LISTING_CREATED", description: `Created listing: ${title}`, metadata: { listingId: listing.id } },
      { propertyId }
    );

    return NextResponse.json(listing, { status: 201 });
  } catch (error) {
    console.error("Failed to create listing:", error);
    return NextResponse.json(
      { error: "Failed to create listing" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Verify listing belongs to org
    const existing = await prisma.listing.findFirst({
      where: { id, ...orgScope.listing(ctx.organizationId) },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    // Validate status if provided
    const validStatuses = ["DRAFT", "POSTED", "FILLED", "EXPIRED", "REMOVED"];
    if ("status" in fields && !validStatuses.includes(fields.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const allowedFields = [
      "title", "description", "price", "status", "photos", "metadata",
      "unitId", "platform", "bedrooms", "bathrooms", "availableDate",
    ];
    const data: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in fields) {
        if (key === "availableDate" && fields[key]) {
          data[key] = new Date(fields[key]);
        } else {
          data[key] = fields[key];
        }
      }
    }

    const listing = await prisma.listing.update({
      where: { id },
      data,
      include: {
        property: { select: { city: true, state: true } },
      },
    });

    // Propagate text changes to Facebook if the listing is posted
    if (listing.facebookPostId && listing.status === "POSTED") {
      const textChanged = "title" in data || "description" in data || "price" in data;
      if (textChanged) {
        try {
          await updateFacebookPost({
            postId: listing.facebookPostId,
            title: listing.title,
            description: listing.description,
            price: listing.price,
            location: {
              city: listing.property.city,
              state: listing.property.state,
            },
          });
        } catch (err) {
          console.error("Failed to update Facebook post:", err);
          // Don't fail the request — DB update succeeded
        }
      }
    }

    await logSystemEvent(
      {
        action: "LISTING_UPDATED",
        description: `Updated listing: ${listing.title}${listing.facebookPostId && listing.status === "POSTED" ? " (FB post updated)" : ""}`,
        metadata: { listingId: id, fields: Object.keys(data) },
      },
      { propertyId: listing.propertyId }
    );

    return NextResponse.json(listing);
  } catch (error) {
    console.error("Failed to update listing:", error);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    // Verify listing belongs to org
    const existing = await prisma.listing.findFirst({
      where: { id, ...orgScope.listing(ctx.organizationId) },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    // Delete Facebook post if exists
    if (existing.facebookPostId) {
      try {
        await deleteFacebookPost(existing.facebookPostId);
      } catch (err) {
        console.error("Failed to delete Facebook post:", err);
      }
    }

    // Delete Facebook ad campaign if exists
    if (existing.adCampaignId) {
      try {
        await deleteFacebookCampaign(existing.adCampaignId);
      } catch (err) {
        console.error("Failed to delete Facebook campaign:", err);
      }
    }

    const listing = await prisma.listing.update({
      where: { id },
      data: { status: "REMOVED" },
    });

    await logSystemEvent(
      {
        action: "LISTING_REMOVED",
        description: `Removed listing: ${listing.title}${existing.facebookPostId ? " (FB post deleted)" : ""}${existing.adCampaignId ? " (ad campaign deleted)" : ""}`,
        metadata: { listingId: id, facebookPostId: existing.facebookPostId, adCampaignId: existing.adCampaignId },
      },
      { propertyId: listing.propertyId }
    );

    return NextResponse.json(listing);
  } catch (error) {
    console.error("Failed to remove listing:", error);
    return NextResponse.json(
      { error: "Failed to remove listing" },
      { status: 500 }
    );
  }
}
