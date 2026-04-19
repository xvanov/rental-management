import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";
import { logSystemEvent } from "@/lib/events";
import {
  createListingPost,
  createMarketplaceLinkAd,
  createMessengerAd,
  isAdsConfigured,
  type AdType,
  type ListingAdResult,
} from "@/lib/integrations/facebook";

interface AdOptions {
  dailyBudget: number;
  days: number;
  startPaused?: boolean;
  adType?: AdType; // default MESSENGER (higher conversion)
  marketplaceUrl?: string; // required when adType === "MARKETPLACE_LINK"
}

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
      adOptions?: AdOptions;
    };

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json(
        { error: "platforms array is required" },
        { status: 400 }
      );
    }

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
    let adResult: ListingAdResult | undefined;
    let adBudget: number | undefined;
    let adDurationDays: number | undefined;
    let adType: AdType | undefined;
    let marketplaceUrl: string | undefined;

    for (const platform of platforms) {
      if (platform === "FACEBOOK") {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.AUTH_URL ||
          "http://localhost:3000";
        const photos = ((listing.photos as string[]) ?? []).map((p) =>
          p.startsWith("http") ? p : `${baseUrl}${p.startsWith("/") ? "" : "/"}${p}`
        );

        const postResult = await createListingPost({
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

        facebookPostId = postResult.postId;

        if (adOptions && adOptions.dailyBudget > 0 && isAdsConfigured()) {
          const resolvedAdType: AdType = adOptions.adType ?? "MESSENGER";
          const baseAdArgs = {
            listingTitle: listing.title,
            city: listing.property.city,
            state: listing.property.state,
            dailyBudgetDollars: adOptions.dailyBudget,
            durationDays: adOptions.days,
            startPaused: adOptions.startPaused ?? false,
            imageUrl: photos[0],
            adCopy: `${listing.title} — $${listing.price}/mo in ${listing.property.city}, ${listing.property.state}. ${listing.description.slice(0, 180)}`,
          };

          if (resolvedAdType === "MARKETPLACE_LINK") {
            if (!adOptions.marketplaceUrl) {
              return NextResponse.json(
                {
                  error:
                    "marketplaceUrl is required when adType is MARKETPLACE_LINK. Post to Facebook Marketplace manually from a personal profile first, then paste the item URL.",
                },
                { status: 400 }
              );
            }
            adResult = await createMarketplaceLinkAd({
              ...baseAdArgs,
              marketplaceUrl: adOptions.marketplaceUrl,
            });
            marketplaceUrl = adOptions.marketplaceUrl;
          } else {
            adResult = await createMessengerAd({
              ...baseAdArgs,
              listingId: listing.id,
            });
          }

          adType = resolvedAdType;
          adBudget = adOptions.dailyBudget;
          adDurationDays = adOptions.days;

          platformEntries.push({
            platform: "FACEBOOK",
            externalId: postResult.postId,
            postedAt: new Date().toISOString(),
            status: "POSTED",
            adType: resolvedAdType,
            adCampaignId: adResult.campaignId,
            adStatus: adOptions.startPaused ? "PAUSED" : "ACTIVE",
            adBudget: adOptions.dailyBudget,
            adDays: adOptions.days,
            marketplaceUrl: marketplaceUrl ?? null,
          });
        } else {
          platformEntries.push({
            platform: "FACEBOOK",
            externalId: postResult.postId,
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
        ...(adResult ? { adCampaignId: adResult.campaignId } : {}),
        ...(adBudget ? { adBudget } : {}),
        ...(adDurationDays ? { adDurationDays } : {}),
        ...(adType ? { adType } : {}),
        ...(marketplaceUrl ? { marketplaceUrl } : {}),
      },
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    await logSystemEvent(
      {
        action: "LISTING_PUBLISHED",
        description: `Published listing "${listing.title}" to ${platforms.join(", ")}${adResult ? ` with ${adType} ad ($${adBudget}/day for ${adDurationDays} days)` : ""}`,
        metadata: {
          listingId: id,
          platforms,
          facebookPostId,
          adCampaignId: adResult?.campaignId,
          adType,
          adBudget,
          adDurationDays,
          marketplaceUrl,
        },
      },
      { propertyId: listing.propertyId }
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to publish listing:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish listing" },
      { status: 500 }
    );
  }
}
