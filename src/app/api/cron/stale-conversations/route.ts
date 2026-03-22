import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logSystemEvent } from "@/lib/events";

/**
 * GET /api/cron/stale-conversations
 *
 * Marks inactive Facebook conversations as STALE.
 * - PROPOSING_TIMES / AWAITING_SELECTION: stale after 48h
 * - INITIAL_INQUIRY / ANSWERING_QUESTIONS: stale after 72h
 *
 * Does NOT send proactive messages (Facebook 24h policy).
 * Validates CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate cron secret in production
    if (process.env.NODE_ENV === "production") {
      const authHeader = request.headers.get("authorization");
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const now = new Date();
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const hours72Ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    // Mark scheduling-stage conversations stale after 48h
    const schedulingStale = await prisma.facebookConversation.updateMany({
      where: {
        stage: { in: ["PROPOSING_TIMES", "AWAITING_SELECTION", "CONFIRMING_BOOKING"] },
        lastMessageAt: { lt: hours48Ago },
      },
      data: { stage: "STALE" },
    });

    // Mark inquiry-stage conversations stale after 72h
    const inquiryStale = await prisma.facebookConversation.updateMany({
      where: {
        stage: { in: ["INITIAL_INQUIRY", "ANSWERING_QUESTIONS"] },
        lastMessageAt: { lt: hours72Ago },
      },
      data: { stage: "STALE" },
    });

    const totalMarked = schedulingStale.count + inquiryStale.count;

    if (totalMarked > 0) {
      await logSystemEvent({
        action: "STALE_CONVERSATIONS_CLEANUP",
        description: `Marked ${totalMarked} conversation(s) as stale`,
        metadata: {
          schedulingStale: schedulingStale.count,
          inquiryStale: inquiryStale.count,
        },
      });
    }

    return NextResponse.json({
      status: "ok",
      staleConversations: totalMarked,
      breakdown: {
        scheduling: schedulingStale.count,
        inquiry: inquiryStale.count,
      },
    });
  } catch (error) {
    console.error("Stale conversations cron error:", error);
    return NextResponse.json(
      { error: "Failed to process stale conversations" },
      { status: 500 }
    );
  }
}
