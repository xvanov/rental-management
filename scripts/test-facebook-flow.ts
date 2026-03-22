/**
 * Test the full Facebook listing-to-showing flow.
 *
 * Usage: npx tsx scripts/test-facebook-flow.ts http://localhost:3000
 *
 * Requires FACEBOOK_DRY_RUN=true to avoid real Facebook API calls.
 * Skips signature validation in dev mode (already supported).
 */

import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";

const BASE_URL = process.argv[2] || "http://localhost:3000";
const FAKE_PSID = `test_psid_${Date.now()}`;

interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message: { mid: string; text: string };
    }>;
  }>;
}

function createWebhookPayload(text: string): WebhookPayload {
  return {
    object: "page",
    entry: [
      {
        id: "test_page",
        time: Date.now(),
        messaging: [
          {
            sender: { id: FAKE_PSID },
            recipient: { id: "test_page" },
            timestamp: Date.now(),
            message: {
              mid: `mid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              text,
            },
          },
        ],
      },
    ],
  };
}

async function sendMessage(text: string): Promise<void> {
  console.log(`\n→ Prospect: "${text}"`);

  const payload = createWebhookPayload(text);
  const response = await fetch(`${BASE_URL}/api/webhooks/facebook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook returned ${response.status}: ${body}`);
  }

  // Wait briefly for async processing
  await new Promise((r) => setTimeout(r, 2000));

  // Read the latest outbound message from DB
  const outbound = await prisma.message.findFirst({
    where: {
      channel: "FACEBOOK",
      direction: "OUTBOUND",
      metadata: { path: ["recipientId"], equals: FAKE_PSID },
    },
    orderBy: { createdAt: "desc" },
  });

  if (outbound) {
    console.log(`← Agent: "${outbound.content}"`);
  } else {
    console.log("← (no outbound response found)");
  }
}

async function checkConversation() {
  const conversation = await prisma.facebookConversation.findFirst({
    where: { senderPsid: FAKE_PSID },
    orderBy: { updatedAt: "desc" },
  });

  if (conversation) {
    console.log(`\n📊 Conversation state:`);
    console.log(`   Stage: ${conversation.stage}`);
    console.log(`   Messages: ${conversation.messageCount}`);
    console.log(`   Name: ${conversation.prospectName ?? "—"}`);
    console.log(`   Phone: ${conversation.prospectPhone ?? "—"}`);
    console.log(`   Showing ID: ${conversation.showingId ?? "—"}`);
  }

  return conversation;
}

async function main() {
  console.log("=== Facebook Listing-to-Showing Flow Test ===");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test PSID: ${FAKE_PSID}`);
  console.log("");

  // Check prerequisites
  const listing = await prisma.listing.findFirst({
    where: { status: "POSTED" },
    orderBy: { postedAt: "desc" },
  });

  if (!listing) {
    console.error("❌ No active listing found. Run post-listing.ts first.");
    console.error("   Example: FACEBOOK_DRY_RUN=true npx tsx scripts/post-listing.ts data/listings/example/");
    process.exit(1);
  }

  console.log(`✅ Found active listing: "${listing.title}" ($${listing.price}/mo)`);

  // Step 1: Initial inquiry
  console.log("\n--- Step 1: Initial Inquiry ---");
  await sendMessage("Hi! I saw your listing and I'm interested. Is this place still available?");
  await checkConversation();

  // Step 2: Ask a question
  console.log("\n--- Step 2: Property Question ---");
  await sendMessage("Does it allow pets? And how many bedrooms?");
  await checkConversation();

  // Step 3: Request showing
  console.log("\n--- Step 3: Request Showing ---");
  await sendMessage("Looks great! I'd love to schedule a showing.");
  await checkConversation();

  // Step 4: Select a time
  console.log("\n--- Step 4: Select Time ---");
  await sendMessage("Option 1 works for me!");
  await checkConversation();

  // Step 5: Confirm with name
  console.log("\n--- Step 5: Confirm Booking ---");
  await sendMessage("My name is Alex Johnson. That time works perfectly, let's book it!");
  const finalConvo = await checkConversation();

  // Verify results
  console.log("\n\n=== Verification ===");

  // Check listing
  const dbListing = await prisma.listing.findFirst({
    where: { status: "POSTED" },
  });
  console.log(`✅ Listing: ${dbListing ? "POSTED" : "❌ NOT FOUND"}`);

  // Check conversation final state
  if (finalConvo) {
    const isBooked = finalConvo.stage === "SHOWING_BOOKED";
    console.log(`${isBooked ? "✅" : "⚠️"} Conversation stage: ${finalConvo.stage}`);
  }

  // Check showing
  if (finalConvo?.showingId) {
    const showing = await prisma.showing.findUnique({
      where: { id: finalConvo.showingId },
    });
    console.log(`✅ Showing: ${showing?.status ?? "NOT FOUND"} — ${showing?.date?.toISOString() ?? ""}`);
  } else {
    console.log("⚠️  No showing ID on conversation (may still be in earlier stage)");
  }

  // Check events
  const events = await prisma.event.count({
    where: {
      type: "SHOWING",
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  console.log(`${events > 0 ? "✅" : "⚠️"} Showing events logged: ${events}`);

  // Message count (inbound + outbound)
  const inboundCount = await prisma.message.count({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["senderId"], equals: FAKE_PSID },
    },
  });
  const outboundCount = await prisma.message.count({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["recipientId"], equals: FAKE_PSID },
    },
  });
  console.log(`✅ Total messages: ${inboundCount + outboundCount} (${inboundCount} in, ${outboundCount} out)`);

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
