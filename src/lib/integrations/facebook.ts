import { prisma } from "@/lib/db";
import { logMessageEvent, logSystemEvent } from "@/lib/events";

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
}

/**
 * Process an incoming Facebook Messenger message.
 * Links to tenant by Facebook ID, creates Message + Event records.
 * Returns phone detection result for channel switching.
 */
export async function processIncomingFacebookMessage(data: IncomingFacebookMessage) {
  // Look up tenant by facebookId
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

  // Detect phone number in message for channel switching
  const phoneDetection = detectPhoneNumber(data.text);

  // Create message record
  const message = await prisma.message.create({
    data: {
      tenantId: tenant?.id ?? null,
      channel: "FACEBOOK",
      direction: "INBOUND",
      content: data.text,
      read: false,
      metadata: {
        facebookMessageId: data.messageId,
        senderId: data.senderId,
        timestamp: data.timestamp,
        attachments: data.attachments ?? [],
        phoneDetected: phoneDetection.detected,
        detectedPhone: phoneDetection.phone,
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "FACEBOOK",
      direction: "INBOUND",
      content: data.text,
      from: data.senderId,
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

// ─── Marketing API: Marketplace Ads ─────────────────────────────────────────

const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

export interface CreateListingAdOptions {
  /** The page post ID from createListingPost (format: pageId_postId) */
  postId: string;
  /** Display name for the campaign */
  listingTitle: string;
  /** City for geo-targeting (15-mile radius minimum for housing) */
  city: string;
  /** State for geo-targeting */
  state: string;
  /** Daily budget in dollars (minimum $5) */
  dailyBudgetDollars?: number;
  /** Number of days to run the ad */
  durationDays?: number;
  /** Start paused for review, or active to go live immediately */
  startPaused?: boolean;
}

export interface ListingAdResult {
  campaignId: string;
  adSetId: string;
  adCreativeId: string;
  adId: string;
  dailyBudget: number;
  durationDays: number;
  status: string;
}

/**
 * Create a Facebook ad campaign that promotes a listing post in Marketplace + Feed.
 * Compliant with HOUSING special ad category restrictions:
 * - Age: 18-65+ (fixed)
 * - Gender: all
 * - Location: city + 15mi radius minimum
 * - No interest/behavior targeting
 */
export async function createListingAd({
  postId,
  listingTitle,
  city,
  state,
  dailyBudgetDollars = 10,
  durationDays = 7,
  startPaused = true,
}: CreateListingAdOptions): Promise<ListingAdResult> {
  if (!pageAccessToken || !adAccountId) {
    throw new Error(
      "FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_AD_ACCOUNT_ID are required"
    );
  }

  const campaignStatus = startPaused ? "PAUSED" : "ACTIVE";
  // Budget is in cents
  const dailyBudgetCents = Math.round(dailyBudgetDollars * 100);

  // Track created objects for cleanup on partial failure
  const createdIds: { campaignId?: string; adSetId?: string; creativeId?: string } = {};

  let campaignId: string;
  let adSetId: string;
  let adCreativeId: string;
  let adId: string;

  try {
    // 1. Create Campaign with HOUSING special ad category
    const campaignRes = await graphPost(`${adAccountId}/campaigns`, {
      name: `Listing: ${listingTitle}`,
      objective: "OUTCOME_AWARENESS",
      special_ad_categories: JSON.stringify(["HOUSING"]),
      special_ad_category_country: JSON.stringify(["US"]),
      status: campaignStatus,
    });
    campaignId = campaignRes.id;
    createdIds.campaignId = campaignId;

    // 2. Create Ad Set with housing-compliant targeting
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
      // Housing ads: age must be 18-65+, gender must be all
      age_min: 18,
      age_max: 65,
    };

    const adSetRes = await graphPost(`${adAccountId}/adsets`, {
      name: `${listingTitle} — ${city} area`,
      campaign_id: campaignId,
      daily_budget: dailyBudgetCents.toString(),
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      billing_event: "IMPRESSIONS",
      optimization_goal: "REACH",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      targeting: JSON.stringify(targeting),
      status: campaignStatus,
    });
    adSetId = adSetRes.id;
    createdIds.adSetId = adSetId;

    // 3. Create Ad Creative using the existing page post
    const creativeRes = await graphPost(`${adAccountId}/adcreatives`, {
      name: `Creative: ${listingTitle}`,
      object_story_id: postId,
    });
    adCreativeId = creativeRes.id;
    createdIds.creativeId = adCreativeId;

    // 4. Create the Ad
    const adRes = await graphPost(`${adAccountId}/ads`, {
      name: `Ad: ${listingTitle}`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: adCreativeId }),
      status: campaignStatus,
    });
    adId = adRes.id;
  } catch (err) {
    // Clean up any partially created objects
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

  // Log the ad creation
  await logSystemEvent({
    action: "FACEBOOK_AD_CREATED",
    description: `Created Marketplace ad for "${listingTitle}" — $${dailyBudgetDollars}/day for ${durationDays} days`,
    metadata: {
      campaignId,
      adSetId,
      adCreativeId,
      adId,
      postId,
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
      attachments?: Array<{
        type: string;
        payload: { url?: string };
      }>;
    };
    delivery?: { mids: string[] };
    read?: { watermark: number };
  }>;
}

/**
 * Parse incoming webhook payload from Facebook.
 * Extracts messaging events and returns structured data.
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
      // Only process actual messages (not delivery/read receipts)
      if (event.message && event.message.text) {
        messages.push({
          senderId: event.sender.id,
          recipientId: event.recipient.id,
          text: event.message.text,
          messageId: event.message.mid,
          timestamp: event.timestamp,
          attachments: event.message.attachments,
        });
      }
    }
  }

  return messages;
}
