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
import { logSystemEvent } from "@/lib/events";

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
      // 1. Store the incoming message / referral.
      const result = await processIncomingFacebookMessage(msg);
      results.push(result);

      // 2. Referral-only event (thread opened from a CTM ad, no text yet).
      //    Pre-create the FacebookConversation with correct listingId so the
      //    first real message is attributed properly. No reply is sent yet —
      //    we wait for the prospect to say something.
      if (!msg.text && msg.referral) {
        if (result.referralListingId) {
          const listing = await prisma.listing.findUnique({
            where: { id: result.referralListingId },
            select: { id: true, propertyId: true },
          });
          if (listing) {
            await prisma.facebookConversation.upsert({
              where: {
                senderPsid_propertyId: {
                  senderPsid: msg.senderId,
                  propertyId: listing.propertyId,
                },
              },
              create: {
                senderPsid: msg.senderId,
                propertyId: listing.propertyId,
                listingId: listing.id,
                stage: "INITIAL_INQUIRY",
                adReferralRef: msg.referral.ref,
                adId: msg.referral.ad_id,
              },
              update: {
                listingId: listing.id,
                adReferralRef: msg.referral.ref,
                adId: msg.referral.ad_id,
              },
            });
          }
        }
        continue;
      }

      // 3. Echo of a message sent by the Page itself (e.g. a human reply from
      //    Meta Business Suite). Log it, flip humanTakeover, do NOT run the
      //    bot. The human's message has already been delivered to the user by
      //    Meta; we just need to stop replying on top of them.
      if (msg.isEcho) {
        await prisma.facebookConversation.updateMany({
          where: { senderPsid: msg.senderId },
          data: { humanTakeover: true, lastMessageAt: new Date() },
        });
        await logSystemEvent({
          action: "FACEBOOK_HUMAN_TAKEOVER",
          description: `Human replied from Page inbox for sender ${msg.senderId}; bot paused.`,
          metadata: { senderId: msg.senderId, content: msg.text },
        });
        continue;
      }

      // 4. Normal inbound from prospect. Persist phone if detected.
      const phoneDetection = detectPhoneNumber(msg.text);
      if (phoneDetection.detected && phoneDetection.phone) {
        await prisma.facebookConversation.updateMany({
          where: { senderPsid: msg.senderId },
          data: { prospectPhone: phoneDetection.phone },
        });
      }

      // 5. If this is the first real message after a CTM referral, ensure the
      //    conversation is tied to the right listing before the FSM runs.
      if (result.referralListingId) {
        const listing = await prisma.listing.findUnique({
          where: { id: result.referralListingId },
          select: { id: true, propertyId: true },
        });
        if (listing) {
          await prisma.facebookConversation.upsert({
            where: {
              senderPsid_propertyId: {
                senderPsid: msg.senderId,
                propertyId: listing.propertyId,
              },
            },
            create: {
              senderPsid: msg.senderId,
              propertyId: listing.propertyId,
              listingId: listing.id,
              stage: "INITIAL_INQUIRY",
              adReferralRef: msg.referral?.ref,
              adId: msg.referral?.ad_id,
            },
            update: {
              listingId: listing.id,
              adReferralRef: msg.referral?.ref ?? undefined,
              adId: msg.referral?.ad_id ?? undefined,
            },
          });
        }
      }

      // 6. Human-takeover guard. If a human is driving this thread, log the
      //    inbound message but don't run the AI or send a reply.
      const activeConvo = await prisma.facebookConversation.findFirst({
        where: { senderPsid: msg.senderId },
        orderBy: { lastMessageAt: "desc" },
      });
      if (activeConvo?.humanTakeover) {
        continue;
      }

      // 7. Run conversation AI engine.
      try {
        const responseText = await handleConversationMessage(
          msg.senderId,
          msg.text,
          msg.messageId
        );

        if (responseText) {
          await sendFacebookMessage({
            recipientId: msg.senderId,
            text: responseText,
            tenantId: result.tenant?.id,
          });
        }
      } catch (err) {
        console.error("Conversation engine error:", err);
        try {
          await sendFacebookMessage({
            recipientId: msg.senderId,
            text: "Thanks for your message! A team member will follow up with you shortly.",
          });
        } catch {
          console.error("Failed to send fallback message to", msg.senderId);
        }
      }
    }

    return NextResponse.json({
      status: "ok",
      processed: results.length,
    });
  } catch (error) {
    console.error("Facebook webhook error:", error);
    return NextResponse.json({ status: "ok", error: "Processing error" });
  }
}
