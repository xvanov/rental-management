/**
 * Post a listing to Facebook from a directory.
 *
 * Usage: npx tsx scripts/post-listing.ts data/listings/durham-3br/ [--no-ad] [--budget=10] [--days=7]
 *
 * Directory structure:
 *   listing.json  — { propertyId, organizationId, title, description, price, location, metadata }
 *   *.jpg / *.png — photos to upload
 *
 * Set FACEBOOK_DRY_RUN=true to skip the actual Facebook API call.
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import * as fs from "fs";
import * as path from "path";

interface ListingJson {
  propertyId: string;
  organizationId: string;
  title: string;
  description: string;
  price: number;
  location?: { city?: string; state?: string };
  metadata?: Record<string, unknown>;
}

async function main() {
  // Dynamic imports so env vars are loaded before module-level constants execute
  const { prisma } = await import("../src/lib/db");
  const { createListingPost, createMessengerAd, isAdsConfigured } = await import("../src/lib/integrations/facebook");
  const { logSystemEvent } = await import("../src/lib/events");

  // Parse flags
  const skipAd = process.argv.includes("--no-ad");
  const adBudgetArg = process.argv.find((a) => a.startsWith("--budget="));
  const adBudget = adBudgetArg ? parseFloat(adBudgetArg.split("=")[1]) : 10;
  const adDaysArg = process.argv.find((a) => a.startsWith("--days="));
  const adDays = adDaysArg ? parseInt(adDaysArg.split("=")[1]) : 7;

  const dirArg = process.argv[2];
  if (!dirArg) {
    console.error("Usage: npx tsx scripts/post-listing.ts <listing-directory>");
    process.exit(1);
  }

  const listingDir = path.resolve(dirArg);
  const jsonPath = path.join(listingDir, "listing.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`listing.json not found in ${listingDir}`);
    process.exit(1);
  }

  const listing: ListingJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`Posting listing: ${listing.title} ($${listing.price}/mo)`);

  // Collect image files
  const imageExts = [".jpg", ".jpeg", ".png", ".webp"];
  const imageFiles = fs
    .readdirSync(listingDir)
    .filter((f) => imageExts.includes(path.extname(f).toLowerCase()))
    .sort()
    .map((f) => path.join(listingDir, f));

  console.log(`Found ${imageFiles.length} photo(s)`);

  // Verify property exists
  const property = await prisma.property.findUnique({
    where: { id: listing.propertyId },
  });
  if (!property) {
    console.error(`Property ${listing.propertyId} not found`);
    process.exit(1);
  }

  // For photos, we need publicly accessible URLs for Facebook.
  // In dry-run mode or when photos are local files, we store paths as-is.
  const isDryRun = process.env.FACEBOOK_DRY_RUN === "true";
  let photoUrls: string[] = [];
  if (!isDryRun && imageFiles.length > 0) {
    // TODO: Upload to a public URL service (S3, etc.) for real Facebook posting
    console.warn(
      "Warning: Local photos cannot be uploaded to Facebook directly. " +
      "Use publicly accessible URLs in listing.json photos field, or set FACEBOOK_DRY_RUN=true."
    );
  }

  // Post to Facebook (or dry-run)
  let facebookPostId: string | null = null;

  if (isDryRun) {
    facebookPostId = `dry_run_post_${Date.now()}`;
    console.log(`[DRY RUN] Would post to Facebook. Fake post ID: ${facebookPostId}`);
  } else {
    const result = await createListingPost({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      photos: photoUrls.length > 0 ? photoUrls : undefined,
      propertyId: listing.propertyId,
      location: listing.location,
    });
    facebookPostId = result.postId;
    console.log(`Posted to Facebook. Post ID: ${facebookPostId}`);
  }

  // Create Listing record in DB
  const dbListing = await prisma.listing.create({
    data: {
      propertyId: listing.propertyId,
      organizationId: listing.organizationId,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      photos: imageFiles.map((f) => path.relative(process.cwd(), f)),
      facebookPostId,
      status: "POSTED",
      metadata: listing.metadata ? JSON.parse(JSON.stringify(listing.metadata)) : undefined,
      postedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  console.log(`Created Listing record: ${dbListing.id}`);

  // Log system event
  await logSystemEvent(
    {
      action: "LISTING_POSTED",
      description: `Posted listing "${listing.title}" ($${listing.price}/mo)`,
      metadata: {
        listingId: dbListing.id,
        facebookPostId,
        propertyId: listing.propertyId,
        photoCount: imageFiles.length,
        isDryRun,
      },
    },
    { propertyId: listing.propertyId }
  );

  // Create a click-to-Messenger ad if configured and not skipped
  if (!skipAd && !isDryRun && facebookPostId && isAdsConfigured()) {
    const adCity = listing.location?.city ?? "Durham";
    const adState = listing.location?.state ?? "NC";
    console.log(`\nCreating Messenger ad ($${adBudget}/day for ${adDays} days, ${adCity} area)...`);
    try {
      const adResult = await createMessengerAd({
        listingId: dbListing.id,
        listingTitle: listing.title,
        city: adCity,
        state: adState,
        dailyBudgetDollars: adBudget,
        durationDays: adDays,
        startPaused: true,
        imageUrl: photoUrls[0],
      });
      console.log(`Ad created (PAUSED):`);
      console.log(`  Campaign: ${adResult.campaignId}`);
      console.log(`  Ad Set:   ${adResult.adSetId}`);
      console.log(`  Ad:       ${adResult.adId}`);
      console.log(`  Activate in Ads Manager when ready.`);
    } catch (err) {
      console.error("Failed to create ad (listing still posted):", err);
    }
  } else if (skipAd) {
    console.log("Skipped ad creation (--no-ad)");
  } else if (isDryRun) {
    console.log("[DRY RUN] Would create Messenger ad");
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to post listing:", err);
  process.exit(1);
});
