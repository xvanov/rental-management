import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhook,
  validateWebhookSignature,
  parseWebhookPayload,
  processIncomingFacebookMessage,
  sendAutoResponse,
  handleChannelSwitch,
} from "@/lib/integrations/facebook";

/**
 * GET /api/webhooks/facebook
 * Facebook Webhook Verification endpoint.
 * Facebook sends a GET request with hub.mode, hub.verify_token, and hub.challenge
 * to verify the webhook subscription.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = verifyWebhook(mode, token, challenge);

  if (result.valid && result.challenge) {
    // Must return the challenge as plain text with 200
    return new NextResponse(result.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST /api/webhooks/facebook
 * Handles incoming Messenger webhook events from Facebook.
 * Processes messages, detects phone numbers for channel switching,
 * and sends auto-responses for initial inquiries.
 */
export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();

    // Validate webhook signature in production
    if (process.env.NODE_ENV === "production") {
      const signature = request.headers.get("x-hub-signature-256");
      const isValid = await validateWebhookSignature(bodyText, signature);
      if (!isValid) {
        console.error("Invalid Facebook webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(bodyText);

    // Parse webhook payload to extract messages
    const messages = parseWebhookPayload(body);

    if (messages.length === 0) {
      // Acknowledge non-message events (delivery receipts, read receipts, etc.)
      return NextResponse.json({ status: "ok" });
    }

    // Process each incoming message
    const results = [];
    for (const msg of messages) {
      // Process and store the message
      const result = await processIncomingFacebookMessage(msg);
      results.push(result);

      // If a phone number was detected, handle channel switch
      if (result.phoneDetection.detected && result.phoneDetection.phone) {
        await handleChannelSwitch(
          msg.senderId,
          result.phoneDetection.phone,
          result.tenant?.id
        );
      } else {
        // Send auto-response for initial inquiries (only if no phone detected)
        await sendAutoResponse(msg.senderId, msg.text);
      }
    }

    // Always return 200 to prevent Facebook retries
    return NextResponse.json({
      status: "ok",
      processed: results.length,
    });
  } catch (error) {
    console.error("Facebook webhook error:", error);
    // Always return 200 to prevent Facebook retries
    return NextResponse.json({ status: "ok", error: "Processing error" });
  }
}
