import { describe, test, expect } from "vitest";
import { prisma } from "@/lib/db";
import { state } from "../helpers/state";
import { publicPost, assertOk } from "../helpers/api-client";

const FAKE_PSID = `e2e_psid_${Date.now()}`;

function messengerWebhook(text: string) {
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

async function sendAndWait(text: string) {
  const res = await publicPost("/api/webhooks/facebook", messengerWebhook(text));
  await assertOk(res, `Messenger webhook: "${text}"`);
  // Wait for async processing
  await new Promise((r) => setTimeout(r, 2500));
}

describe("Phase 2: Facebook Messenger Inquiry", () => {
  test("initial inquiry from prospect", async () => {
    state.facebookPsid = FAKE_PSID;

    await sendAndWait(
      "Hi! I saw your listing and I'm interested. Is this place still available?"
    );

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
    });

    expect(convo).toBeTruthy();
    expect(convo!.messageCount).toBeGreaterThanOrEqual(1);
  });

  test("prospect asks a question about the property", async () => {
    await sendAndWait("Does it allow pets? And what's the parking situation?");

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo!.messageCount).toBeGreaterThanOrEqual(2);
  });

  test("prospect requests a showing", async () => {
    await sendAndWait("Looks great! I'd love to schedule a showing.");

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo).toBeTruthy();
  });

  test("prospect provides name and confirms interest", async () => {
    await sendAndWait(
      "My name is Alex Johnson. That time works perfectly, let's book it!"
    );

    const convo = await prisma.facebookConversation.findFirst({
      where: { senderPsid: FAKE_PSID },
      orderBy: { updatedAt: "desc" },
    });

    expect(convo).toBeTruthy();
    // Name may or may not be extracted depending on AI config
    if (convo!.prospectName) {
      expect(convo!.prospectName).toContain("Alex");
    }
  });

  test("messages were stored in the database", async () => {
    const inbound = await prisma.message.count({
      where: {
        channel: "FACEBOOK",
        metadata: { path: ["senderId"], equals: FAKE_PSID },
      },
    });

    expect(inbound).toBeGreaterThanOrEqual(4);
  });
});
