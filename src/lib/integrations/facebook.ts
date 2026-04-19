import { prisma } from "@/lib/db";
import { logMessageEvent, logSystemEvent } from "@/lib/events";
import type { Prisma } from "@/generated/prisma/client";

// ─── Meta Graph API Configuration ───────────────────────────────────────────

const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const pageId = process.env.FACEBOOK_PAGE_ID;
const appSecret = process.env.FACEBOOK_APP_SECRET;
const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
const graphApiVersion = "v19.0";
const graphApiBase = `https://graph.facebook.com/${graphApiVersion}`;

/**
 * Check if Facebook integration is configured.
 */
export function isFacebookConfigured(): boolean {
  return !!(pageAccessToken && pageId);
}

/**
 * Get configuration status for debugging.
 */
export function getFacebookConfigStatus() {
  return {
    hasPageAccessToken: !!pageAccessToken,
    hasPageId: !!pageId,
    hasAppSecret: !!appSecret,
    hasVerifyToken: !!verifyToken,
  };
}

// ─── Listing Post Function ──────────────────────────────────────────────────

export interface CreateListingOptions {
  title: string;
  description: string;
  price: number;
  photos?: string[]; // URLs of photos to include
  propertyId?: string;
  location?: {
    city?: string;
    state?: string;
  };
}

/**
 * Create a listing post on the Facebook Page.
 * Uses the Page Feed endpoint to post a formatted listing.
 * Note: Facebook Marketplace API has limited access; this posts to the Page feed
 * which can be shared to Marketplace manually if needed.
 */
export async function createListingPost({
  title,
  description,
  price,
  photos,
  propertyId,
  location,
}: CreateListingOptions) {
  if (!pageAccessToken || !pageId) {
    throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID are required");
  }

  // Format the listing message
  const locationStr = location
    ? `${location.city ?? ""}${location.city && location.state ? ", " : ""}${location.state ?? ""}`
    : "";
  const message = [
    `🏠 ${title}`,
    `💰 $${price}/month`,
    locationStr ? `📍 ${locationStr}` : null,
    "",
    description,
    "",
    "💬 Message us for more info or to schedule a showing!",
  ]
    .filter((line) => line !== null)
    .join("\n");

  let postId: string;

  if (photos && photos.length > 0) {
    // Upload photos first, then create a multi-photo post
    const photoIds: string[] = [];
    for (const photoUrl of photos) {
      const photoResponse = await fetch(
        `${graphApiBase}/${pageId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: photoUrl,
            published: false,
            access_token: pageAccessToken,
          }),
        }
      );

      if (photoResponse.ok) {
        const photoData = await photoResponse.json();
        photoIds.push(photoData.id);
      } else {
        const errorData = await photoResponse.json().catch(() => ({}));
        console.error(`Failed to upload photo ${photoUrl}:`, errorData.error?.message ?? photoResponse.statusText);
      }
    }

    // Create post with attached photos
    const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
    const postResponse = await fetch(
      `${graphApiBase}/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          attached_media: attachedMedia,
          access_token: pageAccessToken,
        }),
      }
    );

    if (!postResponse.ok) {
      const errorData = await postResponse.json();
      throw new Error(`Failed to create Facebook post: ${errorData.error?.message ?? postResponse.statusText}`);
    }

    const postData = await postResponse.json();
    postId = postData.id;
  } else {
    // Text-only post
    const postResponse = await fetch(
      `${graphApiBase}/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          access_token: pageAccessToken,
        }),
      }
    );

    if (!postResponse.ok) {
      const errorData = await postResponse.json();
      throw new Error(`Failed to create Facebook post: ${errorData.error?.message ?? postResponse.statusText}`);
    }

    const postData = await postResponse.json();
    postId = postData.id;
  }

  // Log as system event
  await logSystemEvent(
    {
      action: "FACEBOOK_LISTING_POSTED",
      description: `Posted listing: ${title} ($${price}/mo)`,
      metadata: { postId, title, price, propertyId, photoCount: photos?.length ?? 0 },
    },
    { propertyId }
  );

  return { postId, message };
}

// ─── Update Existing Post ────────────────────────────────────────────────────

/**
 * Update an existing Facebook page post's message text.
 * Photos cannot be changed after posting — only the text content.
 */
export async function updateFacebookPost({
  postId,
  title,
  description,
  price,
  location,
}: {
  postId: string;
  title: string;
  description: string;
  price: number;
  location?: { city?: string; state?: string };
}): Promise<void> {
  if (!pageAccessToken) {
    throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN is required");
  }

  const isDryRun = process.env.FACEBOOK_DRY_RUN === "true";
  if (isDryRun) return;

  const locationStr = location
    ? `${location.city ?? ""}${location.city && location.state ? ", " : ""}${location.state ?? ""}`
    : "";
  const message = [
    `🏠 ${title}`,
    `💰 $${price}/month`,
    locationStr ? `📍 ${locationStr}` : null,
    "",
    description,
    "",
    "💬 Message us for more info or to schedule a showing!",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const res = await fetch(`${graphApiBase}/${postId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      access_token: pageAccessToken,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(`Failed to update Facebook post: ${data.error?.message ?? res.statusText}`);
  }
}

// ─── Send Message via Messenger ─────────────────────────────────────────────

export interface SendFacebookMessageOptions {
  recipientId: string; // Facebook PSID (Page-Scoped ID)
  text: string;
  tenantId?: string;
  propertyId?: string;
}

/**
 * Send a message via Facebook Messenger using the Send API.
 * Creates a Message record and logs an immutable event.
 */
export async function sendFacebookMessage({
  recipientId,
  text,
  tenantId,
  propertyId,
}: SendFacebookMessageOptions) {
  const isDryRun = process.env.FACEBOOK_DRY_RUN === "true";
  let responseData: { message_id?: string } = {};

  if (isDryRun) {
    // In dry-run mode, skip the Graph API call but still store in DB
    responseData = { message_id: `dry_run_${Date.now()}` };
  } else {
    if (!pageAccessToken) {
      throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN is required");
    }

    const response = await fetch(
      `${graphApiBase}/me/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          access_token: pageAccessToken,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to send Facebook message: ${errorData.error?.message ?? response.statusText}`);
    }

    responseData = await response.json();
  }

  // Create message record in database
  const message = await prisma.message.create({
    data: {
      tenantId: tenantId ?? null,
      channel: "FACEBOOK",
      direction: "OUTBOUND",
      content: text,
      metadata: {
        facebookMessageId: responseData.message_id,
        recipientId,
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "FACEBOOK",
      direction: "OUTBOUND",
      content: text,
      to: recipientId,
    },
    { tenantId, propertyId }
  );

  return { message, facebookMessageId: responseData.message_id };
}

// ─── Process Incoming Messenger Message ─────────────────────────────────────

export interface MessengerReferral {
  ref?: string; // Custom ref set on click-to-Messenger ad (we encode listingId)
  ad_id?: string; // Ad ID if the referral came from an ad
  source?: string; // "ADS", "SHORTLINK", "CUSTOMER_CHAT_PLUGIN", etc.
  type?: string; // "OPEN_THREAD", etc.
}

export interface IncomingFacebookMessage {
  senderId: string; // Facebook PSID
  recipientId: string; // Page ID
  text: string;
  messageId: string;
  timestamp: number;
  attachments?: Array<{
    type: string;
    payload: { url?: string };
  }>;
  /** Ad / shortlink referral payload when the thread opened from an ad. */
  referral?: MessengerReferral;
  /**
   * True if this event is an echo of a message the Page sent (e.g. a human
   * reply sent from Meta Business Suite). The webhook handler uses this to
   * flip humanTakeover without triggering the bot.
   */
  isEcho?: boolean;
}

/**
 * Extract a listing ID from a Messenger referral ref.
 * We encode refs as `listing_<id>` when creating click-to-Messenger ads.
 */
function decodeListingRef(ref?: string): string | null {
  if (!ref) return null;
  const match = ref.match(/^listing_(.+)$/);
  return match ? match[1] : null;
}

/**
 * Process an incoming Facebook Messenger message.
 * Links to tenant by Facebook ID, creates Message + Event records.
 * Returns phone detection result for channel switching.
 *
 * Handles three variants:
 *  - Normal inbound from prospect → INBOUND Message row, returned for FSM.
 *  - is_echo (Page replied manually from Business Suite) → OUTBOUND Message
 *    row logged, caller should flip humanTakeover and skip FSM.
 *  - Referral-only event (thread opened from CTM ad) → no Message row created
 *    (nothing was said yet); returns attribution hints for the FSM to use on
 *    the first real message.
 */
export async function processIncomingFacebookMessage(data: IncomingFacebookMessage) {
  const tenant = await prisma.tenant.findFirst({
    where: {
      facebookId: data.senderId,
      active: true,
    },
    include: {
      unit: {
        select: { propertyId: true },
      },
    },
  });

  const referralListingId = decodeListingRef(data.referral?.ref);

  // Skip message row for referral-only events (no actual message yet).
  if (!data.text && data.referral) {
    await logSystemEvent({
      action: "FACEBOOK_AD_REFERRAL",
      description: `Thread opened from ${data.referral.source ?? "ad"} referral${data.referral.ad_id ? ` (ad ${data.referral.ad_id})` : ""}`,
      metadata: {
        senderId: data.senderId,
        referral: data.referral,
        referralListingId,
      },
    });
    return {
      message: null,
      tenant: tenant
        ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` }
        : null,
      matched: !!tenant,
      phoneDetection: { detected: false, phone: null },
      senderId: data.senderId,
      isEcho: false,
      referral: data.referral,
      referralListingId,
    };
  }

  const phoneDetection = detectPhoneNumber(data.text);

  const message = await prisma.message.create({
    data: {
      tenantId: tenant?.id ?? null,
      channel: "FACEBOOK",
      direction: data.isEcho ? "OUTBOUND" : "INBOUND",
      content: data.text,
      read: false,
      metadata: {
        facebookMessageId: data.messageId,
        senderId: data.senderId,
        recipientId: data.recipientId,
        timestamp: data.timestamp,
        attachments: data.attachments ?? [],
        phoneDetected: phoneDetection.detected,
        detectedPhone: phoneDetection.phone,
        isEcho: data.isEcho ?? false,
        referral: data.referral ? { ...data.referral } : null,
      } as Prisma.InputJsonValue,
    },
  });

  await logMessageEvent(
    {
      messageId: message.id,
      channel: "FACEBOOK",
      direction: data.isEcho ? "OUTBOUND" : "INBOUND",
      content: data.text,
      from: data.isEcho ? undefined : data.senderId,
      to: data.isEcho ? data.senderId : undefined,
    },
    {
      tenantId: tenant?.id,
      propertyId: tenant?.unit?.propertyId,
    }
  );

  return {
    message,
    tenant: tenant
      ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` }
      : null,
    matched: !!tenant,
    phoneDetection,
    senderId: data.senderId,
    isEcho: data.isEcho ?? false,
    referral: data.referral,
    referralListingId,
  };
}

// ─── Auto-Response for Initial Inquiries ────────────────────────────────────

/**
 * Generate and send an auto-response for initial Facebook Marketplace inquiries.
 * Uses AI if configured, otherwise sends a template response.
 */
export async function sendAutoResponse(senderId: string, incomingMessage: string) {
  if (!pageAccessToken) {
    return { sent: false, reason: "Facebook not configured" };
  }

  // Check if this is likely a first-time inquiry (no existing messages from this sender)
  const existingMessages = await prisma.message.count({
    where: {
      channel: "FACEBOOK",
      direction: "INBOUND",
      metadata: {
        path: ["senderId"],
        equals: senderId,
      },
    },
  });

  // Only auto-respond to the very first message from a sender
  if (existingMessages > 1) {
    return { sent: false, reason: "Not first message" };
  }

  let responseText: string;

  // Try to use AI for response generation
  try {
    const { isAIConfigured } = await import("@/lib/ai");
    if (isAIConfigured()) {
      const { generateText } = await import("ai");
      const { getLanguageModel } = await import("@/lib/ai/provider");
      const model = getLanguageModel();
      if (model) {
        const result = await generateText({
          model,
          system: `You are a friendly property manager responding to a Facebook Marketplace rental inquiry.
Keep your response brief (2-3 sentences).
Thank them for their interest, mention you have availability, and ask them to share their phone number so you can text them details and schedule a showing.
Do NOT include any pricing or specific property details in this initial response.
Be warm and professional.`,
          prompt: `Respond to this rental inquiry: "${incomingMessage}"`,
        });
        responseText = result.text;
      } else {
        responseText = getDefaultAutoResponse();
      }
    } else {
      responseText = getDefaultAutoResponse();
    }
  } catch {
    responseText = getDefaultAutoResponse();
  }

  // Send the auto-response
  await sendFacebookMessage({
    recipientId: senderId,
    text: responseText,
  });

  // Log the auto-response event
  await logSystemEvent({
    action: "FACEBOOK_AUTO_RESPONSE",
    description: `Auto-responded to initial inquiry from ${senderId}`,
    metadata: { senderId, incomingMessage, responseText },
  });

  return { sent: true, responseText };
}

function getDefaultAutoResponse(): string {
  return "Thanks for your interest! We have availability and would love to tell you more. Could you share your phone number? I'll text you the details and we can schedule a showing. 🏠";
}

// ─── Phone Number Detection ─────────────────────────────────────────────────

/**
 * Detect if a message contains a phone number.
 * Used to trigger the SMS channel switch from Facebook to SMS.
 */
export function detectPhoneNumber(text: string): { detected: boolean; phone: string | null } {
  // Common phone number patterns
  const patterns = [
    // (xxx) xxx-xxxx
    /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
    // xxx-xxx-xxxx
    /\d{3}[\s.-]\d{3}[\s.-]\d{4}/,
    // xxxxxxxxxx (10 digits)
    /\b\d{10}\b/,
    // +1xxxxxxxxxx
    /\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Normalize the detected number
      const digits = match[0].replace(/\D/g, "");
      let normalized: string;
      if (digits.length === 11 && digits.startsWith("1")) {
        normalized = `+${digits}`;
      } else if (digits.length === 10) {
        normalized = `+1${digits}`;
      } else {
        normalized = match[0];
      }
      return { detected: true, phone: normalized };
    }
  }

  return { detected: false, phone: null };
}

// ─── Channel Switch Handler ─────────────────────────────────────────────────

/**
 * Handle the transition from Facebook Messenger to SMS when a phone number is detected.
 * Updates/creates tenant record with phone, sends a confirmation via SMS, and logs the switch.
 */
export async function handleChannelSwitch(
  senderId: string,
  phoneNumber: string,
  tenantId?: string
) {
  // If we have an existing tenant, update their phone
  if (tenantId) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { phone: phoneNumber, facebookId: senderId },
    });
  }

  // Send confirmation via Facebook that we'll switch to SMS
  await sendFacebookMessage({
    recipientId: senderId,
    text: "Great, I've got your number! I'll text you from there. Check your messages shortly. 📱",
    tenantId,
  });

  // Log channel switch event
  await logSystemEvent({
    action: "CHANNEL_SWITCH_FB_TO_SMS",
    description: `Switching from Facebook to SMS for sender ${senderId} → ${phoneNumber}`,
    metadata: { senderId, phoneNumber, tenantId },
  });

  return { switched: true, phoneNumber };
}

// ─── Webhook Verification ───────────────────────────────────────────────────

/**
 * Verify the webhook subscription from Facebook.
 * Returns the challenge token if verification succeeds.
 */
export function verifyWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null
): { valid: boolean; challenge: string | null } {
  if (mode === "subscribe" && token === verifyToken) {
    return { valid: true, challenge };
  }
  return { valid: false, challenge: null };
}

/**
 * Validate that an incoming webhook request is from Facebook.
 * Uses HMAC-SHA256 verification with the app secret.
 */
export async function validateWebhookSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  if (!appSecret) {
    // If app secret is not configured, skip validation (dev mode)
    console.warn("FACEBOOK_APP_SECRET not configured, skipping webhook signature validation");
    return true;
  }

  if (!signature) {
    return false;
  }

  // Expected format: sha256=<hex>
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    return false;
  }

  const signatureHash = signature.slice(expectedPrefix.length);

  // Use Web Crypto API for HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );

  const computedHash = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === signatureHash;
}

// ─── Marketing API: Ads ─────────────────────────────────────────────────────
//
// Two ad types are supported:
//
//   1. createMarketplaceLinkAd — "Learn More" CTA linking to a Facebook Marketplace
//      URL (or any external URL). Used to drive prospects to an existing Marketplace
//      item that was posted manually from a personal profile (required by Meta's
//      Jan 2025 policy for rentals).
//
//   2. createMessengerAd — "Send Message" CTA that opens a Messenger thread with
//      the Page directly. Prospects are handled by the AI chatbot in
//      facebook-conversation.ts. This is the higher-conversion path.
//
// Both types are HOUSING-category compliant: age 18-65, no interest targeting,
// geo = city + 15mi radius.

const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

export type AdType = "MARKETPLACE_LINK" | "MESSENGER";

interface BaseAdOptions {
  /** Display name seeded into campaign / ad set / ad names */
  listingTitle: string;
  /** City for geo-targeting (15-mile radius minimum for housing) */
  city: string;
  /** State for geo-targeting (US state abbreviation, e.g. "FL") */
  state: string;
  /** Daily budget in dollars (minimum $1) */
  dailyBudgetDollars?: number;
  /** Number of days to run the ad */
  durationDays?: number;
  /** Start paused for review, or active to go live immediately */
  startPaused?: boolean;
  /** Ad copy shown above the image */
  adCopy?: string;
  /** Absolute URL of the primary image to show in the ad */
  imageUrl?: string;
}

export interface CreateMarketplaceLinkAdOptions extends BaseAdOptions {
  /** The Facebook Marketplace item URL to link to (required) */
  marketplaceUrl: string;
}

export interface CreateMessengerAdOptions extends BaseAdOptions {
  /** Listing ID encoded into the m.me ref parameter for webhook attribution */
  listingId: string;
}

export interface ListingAdResult {
  campaignId: string;
  adSetId: string;
  adCreativeId: string;
  adId: string;
  dailyBudget: number;
  durationDays: number;
  status: string;
  adType: AdType;
}

/**
 * Create a Facebook ad that drives clicks to a Facebook Marketplace item URL.
 * CTA: "Learn More".
 *
 * Note: Meta's Jan 2025 policy prevents Pages from posting rental listings to
 * Marketplace organically. The Marketplace item must be posted manually from a
 * personal profile; paste that URL as `marketplaceUrl`.
 */
export async function createMarketplaceLinkAd(
  options: CreateMarketplaceLinkAdOptions
): Promise<ListingAdResult> {
  if (!options.marketplaceUrl) {
    throw new Error("marketplaceUrl is required for a Marketplace Link ad");
  }

  return createAdInternal({
    adType: "MARKETPLACE_LINK",
    baseOptions: options,
    linkData: {
      message: options.adCopy ?? defaultAdCopy(options.listingTitle, options.city, options.state),
      link: options.marketplaceUrl,
      picture: options.imageUrl,
      call_to_action: { type: "LEARN_MORE" },
    },
  });
}

/**
 * Create a Facebook click-to-Messenger ad. Tapping the ad opens a Messenger
 * thread with the Page directly; the chatbot handles the conversation.
 *
 * The `listingId` is encoded into the m.me ref parameter; Meta delivers this
 * via the `referral` field in the first inbound webhook event so we can attribute
 * the conversation to the correct listing.
 */
export async function createMessengerAd(
  options: CreateMessengerAdOptions
): Promise<ListingAdResult> {
  if (!pageId) {
    throw new Error("FACEBOOK_PAGE_ID is required");
  }
  const ref = `listing_${options.listingId}`;

  return createAdInternal({
    adType: "MESSENGER",
    baseOptions: options,
    linkData: {
      message: options.adCopy ?? defaultAdCopy(options.listingTitle, options.city, options.state),
      link: `https://m.me/${pageId}?ref=${encodeURIComponent(ref)}`,
      picture: options.imageUrl,
      call_to_action: {
        type: "MESSAGE_PAGE",
        value: {
          app_destination: "MESSENGER",
          page: pageId,
          ref,
        },
      },
    },
    destinationMessenger: true,
  });
}

function defaultAdCopy(title: string, city: string, state: string): string {
  return `${title} — available now in ${city}, ${state}. Message us or tap to learn more.`;
}

type LinkDataCallToAction =
  | { type: "LEARN_MORE" }
  | {
      type: "MESSAGE_PAGE";
      value: { app_destination: "MESSENGER"; page: string; ref?: string };
    };

interface LinkData {
  message: string;
  link: string;
  picture?: string;
  call_to_action: LinkDataCallToAction;
}

async function createAdInternal(args: {
  adType: AdType;
  baseOptions: BaseAdOptions;
  linkData: LinkData;
  destinationMessenger?: boolean;
}): Promise<ListingAdResult> {
  const { adType, baseOptions, linkData, destinationMessenger } = args;
  const {
    listingTitle,
    city,
    state,
    dailyBudgetDollars = 10,
    durationDays = 7,
    startPaused = true,
  } = baseOptions;

  if (!pageAccessToken || !adAccountId || !pageId) {
    throw new Error(
      "FACEBOOK_PAGE_ACCESS_TOKEN, FACEBOOK_AD_ACCOUNT_ID, and FACEBOOK_PAGE_ID are required"
    );
  }

  const campaignStatus = startPaused ? "PAUSED" : "ACTIVE";
  const dailyBudgetCents = Math.round(dailyBudgetDollars * 100);
  const createdIds: { campaignId?: string; adSetId?: string; creativeId?: string } = {};

  let campaignId: string;
  let adSetId: string;
  let adCreativeId: string;
  let adId: string;

  try {
    // 1. Campaign. Messenger ads use ENGAGEMENT objective (conversations);
    //    Marketplace-link ads use AWARENESS (reach + clicks).
    const campaignRes = await graphPost(`${adAccountId}/campaigns`, {
      name: `Listing (${adType}): ${listingTitle}`,
      objective: destinationMessenger ? "OUTCOME_ENGAGEMENT" : "OUTCOME_AWARENESS",
      special_ad_categories: JSON.stringify(["HOUSING"]),
      special_ad_category_country: JSON.stringify(["US"]),
      status: campaignStatus,
    });
    campaignId = campaignRes.id;
    createdIds.campaignId = campaignId;

    // 2. Ad Set. Housing-compliant targeting. Messenger ads optimize for
    //    CONVERSATIONS and set destination_type so taps open Messenger.
    const now = new Date();
    const endTime = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const targeting = {
      geo_locations: {
        cities: [
          {
            key: await getCityKey(city, state),
            radius: 15,
            distance_unit: "mile",
          },
        ],
      },
      age_min: 18,
      age_max: 65,
    };

    const adSetParams: Record<string, string> = {
      name: `${listingTitle} — ${city} area (${adType})`,
      campaign_id: campaignId,
      daily_budget: dailyBudgetCents.toString(),
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      billing_event: "IMPRESSIONS",
      optimization_goal: destinationMessenger ? "CONVERSATIONS" : "REACH",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify(targeting),
      publisher_platforms: JSON.stringify(["facebook"]),
      facebook_positions: JSON.stringify(["feed", "marketplace"]),
      status: campaignStatus,
    };

    if (destinationMessenger) {
      adSetParams.destination_type = "MESSENGER";
    }

    const adSetRes = await graphPost(`${adAccountId}/adsets`, adSetParams);
    adSetId = adSetRes.id;
    createdIds.adSetId = adSetId;

    // 3. Ad Creative. Uses object_story_spec.link_data so we control the CTA.
    const objectStorySpec = {
      page_id: pageId,
      link_data: linkData,
    };

    const creativeRes = await graphPost(`${adAccountId}/adcreatives`, {
      name: `Creative (${adType}): ${listingTitle}`,
      object_story_spec: JSON.stringify(objectStorySpec),
    });
    adCreativeId = creativeRes.id;
    createdIds.creativeId = adCreativeId;

    // 4. Ad.
    const adRes = await graphPost(`${adAccountId}/ads`, {
      name: `Ad (${adType}): ${listingTitle}`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: adCreativeId }),
      status: campaignStatus,
    });
    adId = adRes.id;
  } catch (err) {
    for (const id of [createdIds.creativeId, createdIds.adSetId, createdIds.campaignId]) {
      if (id) {
        try {
          await fetch(`${graphApiBase}/${id}?access_token=${pageAccessToken}`, { method: "DELETE" });
        } catch {
          console.error(`Failed to clean up Facebook object ${id}`);
        }
      }
    }
    throw err;
  }

  await logSystemEvent({
    action: "FACEBOOK_AD_CREATED",
    description: `Created ${adType} ad for "${listingTitle}" — $${dailyBudgetDollars}/day for ${durationDays} days`,
    metadata: {
      adType,
      campaignId,
      adSetId,
      adCreativeId,
      adId,
      city,
      state,
      dailyBudgetDollars,
      durationDays,
      status: campaignStatus,
    },
  });

  return {
    campaignId,
    adSetId,
    adCreativeId,
    adId,
    dailyBudget: dailyBudgetDollars,
    durationDays,
    status: campaignStatus,
    adType,
  };
}

/**
 * Look up a Facebook city targeting key by name and state.
 * Searches the adgeolocation endpoint and matches by region.
 */
async function getCityKey(city: string, state: string): Promise<string> {
  const query = encodeURIComponent(city);
  const res = await fetch(
    `${graphApiBase}/search?type=adgeolocation&location_types=${encodeURIComponent('["city"]')}&q=${query}&country_code=US&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (!data.data?.length) {
    throw new Error(`Could not find city "${city}, ${state}" for ad targeting`);
  }

  // State abbreviation → full name mapping for common states
  const stateNames: Record<string, string> = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
    MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
    OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
    VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    DC: "District of Columbia",
  };

  const stateFull = stateNames[state.toUpperCase()] ?? state;

  // Match by state/region
  const match = data.data.find(
    (c: { region?: string; country_code?: string }) =>
      c.country_code === "US" &&
      c.region?.toLowerCase() === stateFull.toLowerCase()
  );

  if (match) return match.key;

  // Fallback to first US result
  const usResult = data.data.find(
    (c: { country_code?: string }) => c.country_code === "US"
  );
  if (usResult) return usResult.key;

  return data.data[0].key;
}

/**
 * Helper for Graph API POST requests to the Marketing API.
 */
async function graphPost(
  endpoint: string,
  params: Record<string, string>
): Promise<{ id: string }> {
  const body = new URLSearchParams(params);
  body.set("access_token", pageAccessToken!);

  const res = await fetch(`${graphApiBase}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(
      `Facebook Marketing API error (${endpoint}): ${data.error.message}`
    );
  }
  return data;
}

/**
 * Delete a Facebook page post by its ID.
 */
export async function deleteFacebookPost(postId: string): Promise<void> {
  if (!pageAccessToken) return;
  const isDryRun = process.env.FACEBOOK_DRY_RUN === "true";
  if (isDryRun) return;

  const res = await fetch(
    `${graphApiBase}/${postId}?access_token=${pageAccessToken}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  if (data.error) {
    console.error(`Failed to delete Facebook post ${postId}:`, data.error.message);
  }
}

/**
 * Delete a Facebook ad campaign and all its children (ad sets, ads).
 */
export async function deleteFacebookCampaign(campaignId: string): Promise<void> {
  if (!pageAccessToken) return;
  const isDryRun = process.env.FACEBOOK_DRY_RUN === "true";
  if (isDryRun) return;

  const res = await fetch(
    `${graphApiBase}/${campaignId}?access_token=${pageAccessToken}`,
    { method: "DELETE" }
  );
  const data = await res.json();
  if (data.error) {
    console.error(`Failed to delete Facebook campaign ${campaignId}:`, data.error.message);
  }
}

/**
 * Check if Facebook Ads (Marketing API) is configured.
 */
export function isAdsConfigured(): boolean {
  return !!(pageAccessToken && adAccountId);
}

// ─── Parse Webhook Events ───────────────────────────────────────────────────

export interface WebhookEntry {
  id: string;
  time: number;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
      mid: string;
      text?: string;
      is_echo?: boolean;
      attachments?: Array<{
        type: string;
        payload: { url?: string };
      }>;
      referral?: MessengerReferral;
    };
    /** New-thread referral (fires on first tap from a CTM ad, before any message). */
    referral?: MessengerReferral;
    delivery?: { mids: string[] };
    read?: { watermark: number };
  }>;
}

/**
 * Parse incoming webhook payload from Facebook.
 * Extracts messaging events and returns structured data.
 *
 * Handles three event shapes:
 *   - `message` with text (normal inbound from prospect, or is_echo from Page)
 *   - `message` with referral (first message from a click-to-Messenger ad)
 *   - `referral` without message (thread-opened event from CTM ad)
 */
export function parseWebhookPayload(body: {
  object: string;
  entry?: WebhookEntry[];
}): IncomingFacebookMessage[] {
  if (body.object !== "page" || !body.entry) {
    return [];
  }

  const messages: IncomingFacebookMessage[] = [];

  for (const entry of body.entry) {
    if (!entry.messaging) continue;

    for (const event of entry.messaging) {
      // Referral-only events (user tapped CTM ad, thread opened, no message yet).
      // Emit a synthetic empty-text event so processIncomingFacebookMessage can
      // attribute the conversation to the listing.
      if (!event.message && event.referral) {
        messages.push({
          senderId: event.sender.id,
          recipientId: event.recipient.id,
          text: "",
          messageId: `ref_${event.timestamp}_${event.sender.id}`,
          timestamp: event.timestamp,
          referral: event.referral,
        });
        continue;
      }

      if (event.message && event.message.text) {
        messages.push({
          senderId: event.sender.id,
          recipientId: event.recipient.id,
          text: event.message.text,
          messageId: event.message.mid,
          timestamp: event.timestamp,
          attachments: event.message.attachments,
          referral: event.message.referral ?? event.referral,
          isEcho: event.message.is_echo === true,
        });
      }
    }
  }

  return messages;
}
