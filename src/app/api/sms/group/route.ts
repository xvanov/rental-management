import { NextRequest, NextResponse } from "next/server";
import { sendGroupSms } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * Send a group SMS to all tenants in a property.
 * POST /api/sms/group
 * Body: { propertyId: string, content: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { propertyId, content } = body;

    if (!propertyId || !content) {
      return NextResponse.json(
        { error: "propertyId and content are required" },
        { status: 400 }
      );
    }

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found in your organization" },
        { status: 404 }
      );
    }

    const result = await sendGroupSms({
      propertyId,
      body: content,
    });

    return NextResponse.json(
      {
        success: true,
        sent: result.sent,
        failed: result.failed,
        results: result.results,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send group SMS:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send group SMS" },
      { status: 500 }
    );
  }
}
