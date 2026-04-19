import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * GET /api/conversations
 * List all Facebook Messenger conversations for the current org.
 * Returns prospect info, stage, listing reference, last message time,
 * humanTakeover state, and booked showing (if any).
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const conversations = await prisma.facebookConversation.findMany({
    where: {
      property: { organizationId: ctx.organizationId },
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      listing: {
        select: { id: true, title: true, price: true },
      },
      property: {
        select: { id: true, address: true, city: true, state: true },
      },
    },
    take: 200,
  });

  return NextResponse.json(conversations);
}
