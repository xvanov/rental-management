import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";
import { logSystemEvent } from "@/lib/events";
import { createListingPost, createListingAd, isAdsConfigured } from "@/lib/integrations/facebook";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id } = await params;
    const body = await request.json();
    const { platforms, adOptions } = body as {
      platforms: string[];
      adOptions?: { dailyBudget: number; days: number; startPaused?: boolean };
    };

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: "platforms array is required" },
        { status: 400 }
      );
    }

    // Fetch listing with property, verify org ownership
    const listing = await prisma.listing.findFirst({
      where: { id, ...orgScope.listing(ctx.organizationId) },
      include: { property: true },
    });
    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      );
    }

    const platformEntries: Array<Record<string, unknown>> = [];
    let facebookPostId: string | undefined;
    let adCampaignId: string | undefined;
    let adBudget: number | undefined;
    let adDurationDays: number | undefined;

    for (const platform of platforms) {
      if (platform === "FACEBOOK") {
        // Convert relative photo paths to absolute public URLs for Facebook
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3000";
        const photos = ((listing.photos as string[]) ?? []).map((p) =>
          p.startsWith("http") ? p : `${baseUrl}${p.startsWith("/") ? "" : "/"}${p}`
        );

        const result = await createListingPost({
          title: listing.title,
          description: listing.description,
          price: listing.price,
          photos: photos.length > 0 ? photos : undefined,
          propertyId: listing.propertyId,
          location: {
            city: listing.property.city,
            state: listing.property.state,
          },
        });

        facebookPostId = result.postId;

        if (adOptions && adOptions.dailyBudget > 0 && isAdsConfigured()) {
          const adResult = await createListingAd({
            postId: result.postId,
            listingTitle: listing.title,
            city: listing.property.city,
            state: listing.property.state,
            dailyBudgetDollars: adOptions.dailyBudget,
            durationDays: adOptions.days,
            startPaused: adOptions.startPaused ?? false,
          });
          adCampaignId = adResult.campaignId;
          adBudget = adOptions.dailyBudget;
          adDurationDays = adOptions.days;

          platformEntries.push({
            platform: "FACEBOOK",
            externalId: result.postId,
            postedAt: new Date().toISOString(),
            status: "POSTED",
            adCampaignId: adResult.campaignId,
            adStatus: adOptions.startPaused ? "PAUSED" : "ACTIVE",
            adBudget: adOptions.dailyBudget,
            adDays: adOptions.days,
          });
        } else {
          platformEntries.push({
            platform: "FACEBOOK",
            externalId: result.postId,
            postedAt: new Date().toISOString(),
            status: "POSTED",
          });
        }
      } else {
        platformEntries.push({
          platform,
          status: "MANUAL",
          postedAt: new Date().toISOString(),
        });
      }
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        platforms: platformEntries as unknown as import("@/generated/prisma/client").Prisma.InputJsonValue,
        ...(facebookPostId ? { facebookPostId } : {}),
        ...(adCampaignId ? { adCampaignId } : {}),
        ...(adBudget ? { adBudget } : {}),
        ...(adDurationDays ? { adDurationDays } : {}),
      },
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    await logSystemEvent(
      {
        action: "LISTING_PUBLISHED",
        description: `Published listing "${listing.title}" to ${platforms.join(", ")}${adCampaignId ? ` with $${adBudget}/day ad for ${adDurationDays} days` : ""}`,
        metadata: { listingId: id, platforms, facebookPostId, adCampaignId, adBudget, adDurationDays },
      },
      { propertyId: listing.propertyId }
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to publish listing:", error);
    return NextResponse.json(
      { error: "Failed to publish listing" },
      { status: 500 }
    );
  }
}
