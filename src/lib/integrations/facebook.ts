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

  const responseData = await response.json();

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
