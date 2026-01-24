import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyMessage } from "@/lib/ai";
import { logSystemEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messageId, content, tenantId } = body;

    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // Get context if tenantId is provided
    let context: { tenantName?: string; unitName?: string; propertyAddress?: string } = {};
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          unit: {
            include: {
              property: { select: { address: true } },
            },
          },
        },
      });
      if (tenant) {
        context = {
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          unitName: tenant.unit?.name,
          propertyAddress: tenant.unit?.property?.address,
        };
      }
    }

    const classification = await classifyMessage(content, context);

    if (!classification) {
      return NextResponse.json(
        { error: "AI is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable." },
        { status: 503 }
      );
    }

    // Log classification event
    await logSystemEvent(
      {
        action: "AI_MESSAGE_CLASSIFIED",
        description: `Message classified as ${classification.category} (${Math.round(classification.confidence * 100)}% confidence)`,
        metadata: {
          messageId: messageId ?? null,
          tenantId: tenantId ?? null,
          category: classification.category,
          confidence: classification.confidence,
          summary: classification.summary,
        },
      },
      { tenantId }
    );

    return NextResponse.json(classification);
  } catch (error) {
    console.error("Failed to classify message:", error);
    return NextResponse.json(
      { error: "Failed to classify message" },
      { status: 500 }
    );
  }
}
