import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/db";

/**
 * Send an SMS message to a tenant.
 * POST /api/sms
 * Body: { tenantId: string, content: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, content } = body;

    if (!tenantId || !content) {
      return NextResponse.json(
        { error: "tenantId and content are required" },
        { status: 400 }
      );
    }

    // Look up tenant to get phone number
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        phone: true,
        firstName: true,
        lastName: true,
        unit: { select: { propertyId: true } },
      },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    if (!tenant.phone) {
      return NextResponse.json(
        { error: "Tenant has no phone number on file" },
        { status: 400 }
      );
    }

    const result = await sendSms({
      to: tenant.phone,
      body: content,
      tenantId: tenant.id,
      propertyId: tenant.unit?.propertyId,
    });

    return NextResponse.json(
      {
        success: true,
        messageId: result.message.id,
        twilioSid: result.twilioSid,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send SMS:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send SMS" },
      { status: 500 }
    );
  }
}
