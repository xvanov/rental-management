import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateDraftReply } from "@/lib/ai";
import type { ConversationMessage } from "@/lib/ai";
import { logSystemEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "tenantId is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get tenant info with lease and unit data, scoped to org
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      include: {
        unit: {
          select: {
            name: true,
            propertyId: true,
            property: { select: { address: true } },
          },
        },
        leases: {
          where: { status: "ACTIVE" },
          take: 1,
          select: { status: true, rentAmount: true },
        },
      },
    });

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get recent conversation history (last 20 messages)
    const messages = await prisma.message.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: {
        channel: true,
        direction: true,
        content: true,
        createdAt: true,
      },
    });

    // Get tenant balance
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { balance: true },
    });

    const conversationHistory: ConversationMessage[] = messages.map((msg) => ({
      role: msg.direction === "INBOUND" ? "tenant" as const : "operator" as const,
      content: msg.content,
      channel: msg.channel,
      timestamp: msg.createdAt.toISOString(),
    }));

    const activeLease = tenant.leases[0];

    const result = generateDraftReply({
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      unitName: tenant.unit?.name,
      propertyAddress: tenant.unit?.property?.address,
      leaseStatus: activeLease?.status,
      rentAmount: activeLease?.rentAmount ? Number(activeLease.rentAmount) : undefined,
      balance: ledgerEntries[0]?.balance ? Number(ledgerEntries[0].balance) : undefined,
      conversationHistory,
    });

    if (!result) {
      return new Response(
        JSON.stringify({ error: "AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable." }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log AI draft generation event
    await logSystemEvent(
      {
        action: "AI_DRAFT_GENERATED",
        description: `AI draft reply generated for tenant ${tenant.firstName} ${tenant.lastName}`,
        metadata: {
          tenantId,
          messageCount: messages.length,
        },
      },
      { tenantId, propertyId: tenant.unit?.propertyId }
    );

    // Return streaming response
    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Failed to generate AI draft:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate AI draft" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
