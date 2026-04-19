import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import { sendFacebookMessage } from "@/lib/integrations/facebook";
import { logSystemEvent } from "@/lib/events";

async function loadScoped(id: string, organizationId: string) {
  return prisma.facebookConversation.findFirst({
    where: {
      id,
      property: { organizationId },
    },
    include: {
      listing: {
        select: { id: true, title: true, price: true },
      },
      property: {
        select: { id: true, address: true, city: true, state: true },
      },
    },
  });
}

/**
 * GET /api/conversations/[id]
 * Full thread view for one conversation: metadata + chronological message list
 * (inbound + outbound merged by PSID).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const conversation = await loadScoped(id, ctx.organizationId);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const psid = conversation.senderPsid;
  const inbound = await prisma.message.findMany({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["senderId"], equals: psid },
    },
    orderBy: { createdAt: "asc" },
  });
  const outbound = await prisma.message.findMany({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["recipientId"], equals: psid },
    },
    orderBy: { createdAt: "asc" },
  });

  const messages = [...inbound, ...outbound].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  let showing = null;
  if (conversation.showingId) {
    showing = await prisma.showing.findUnique({
      where: { id: conversation.showingId },
      select: {
        id: true,
        date: true,
        status: true,
        attendeeName: true,
        attendeePhone: true,
        attendeeEmail: true,
      },
    });
  }

  return NextResponse.json({ conversation, messages, showing });
}

/**
 * PATCH /api/conversations/[id]
 * Toggle humanTakeover (two-way: true hands off to a human, false resumes
 * the bot). The bot picks up with full message history on the next inbound.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const conversation = await loadScoped(id, ctx.organizationId);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { humanTakeover?: boolean };
  if (typeof body.humanTakeover !== "boolean") {
    return NextResponse.json(
      { error: "humanTakeover (boolean) is required" },
      { status: 400 }
    );
  }

  const updated = await prisma.facebookConversation.update({
    where: { id },
    data: { humanTakeover: body.humanTakeover },
  });

  await logSystemEvent({
    action: body.humanTakeover
      ? "FACEBOOK_HUMAN_TAKEOVER"
      : "FACEBOOK_BOT_RESUMED",
    description: body.humanTakeover
      ? `Human taking over conversation ${id}; bot paused.`
      : `Bot resuming conversation ${id}.`,
    metadata: { conversationId: id, senderPsid: conversation.senderPsid },
  });

  return NextResponse.json(updated);
}

/**
 * POST /api/conversations/[id]
 * Send a manual reply from the Page to this prospect. Automatically sets
 * humanTakeover=true so the bot doesn't respond on top of the human.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const conversation = await loadScoped(id, ctx.organizationId);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  await sendFacebookMessage({
    recipientId: conversation.senderPsid,
    text,
    propertyId: conversation.propertyId,
  });

  await prisma.facebookConversation.update({
    where: { id },
    data: {
      humanTakeover: true,
      lastMessageAt: new Date(),
      messageCount: { increment: 1 },
    },
  });

  return NextResponse.json({ ok: true });
}
