import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhook,
  validateWebhookSignature,
  parseWebhookPayload,
  processIncomingFacebookMessage,
  sendFacebookMessage,
  detectPhoneNumber,
} from "@/lib/integrations/facebook";
import { handleConversationMessage } from "@/lib/facebook-conversation";
import { prisma } from "@/lib/db";

/**
 * GET /api/webhooks/facebook
 * Facebook Webhook Verification endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const result = verifyWebhook(mode, token, challenge);

  if (result.valid && result.challenge) {
    return new NextResponse(result.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST /api/webhooks/facebook
 * Handles incoming Messenger webhook events.
 * Routes messages through the conversation AI engine.
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
    const messages = parseWebhookPayload(body);

    if (messages.length === 0) {
      return NextResponse.json({ status: "ok" });
    }

    const results = [];
    for (const msg of messages) {
      // 1. Store the incoming message
      const result = await processIncomingFacebookMessage(msg);
      results.push(result);

      // 2. If phone detected, store on conversation record (but stay on Messenger)
      const phoneDetection = detectPhoneNumber(msg.text);
      if (phoneDetection.detected && phoneDetection.phone) {
        await prisma.facebookConversation.updateMany({
          where: { senderPsid: msg.senderId },
          data: { prospectPhone: phoneDetection.phone },
        });
      }

      // 3. Run conversation AI engine
      try {
        const responseText = await handleConversationMessage(
          msg.senderId,
          msg.text,
          msg.messageId
        );

        // 4. Send response via Messenger
        await sendFacebookMessage({
          recipientId: msg.senderId,
          text: responseText,
          tenantId: result.tenant?.id,
          propertyId: result.tenant ? undefined : undefined,
        });
      } catch (err) {
        console.error("Conversation engine error:", err);
        // Send a graceful fallback (best-effort)
        try {
          await sendFacebookMessage({
            recipientId: msg.senderId,
            text: "Thanks for your message! A team member will follow up with you shortly.",
          });
        } catch {
          // Can't send fallback either — just log
          console.error("Failed to send fallback message to", msg.senderId);
        }
      }
    }

    // Always return 200 to prevent Facebook retries
    return NextResponse.json({
      status: "ok",
      processed: results.length,
    });
  } catch (error) {
    console.error("Facebook webhook error:", error);
    return NextResponse.json({ status: "ok", error: "Processing error" });
  }
}
