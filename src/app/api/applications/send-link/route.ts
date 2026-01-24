import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";
import { createEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { applicationId, channel, to } = body;

    if (!applicationId || !channel || !to) {
      return NextResponse.json(
        { error: "applicationId, channel, and to are required" },
        { status: 400 }
      );
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3001";
    const applicationUrl = `${baseUrl}/apply/${application.token}`;
    const message = `You've been invited to submit a rental application. Please fill out the form at: ${applicationUrl}`;

    if (channel === "SMS") {
      await sendSms({
        to,
        body: message,
      });
    } else if (channel === "EMAIL") {
      await sendEmail({
        to,
        subject: "Rental Application Invitation",
        text: message,
        html: `<p>You've been invited to submit a rental application.</p><p><a href="${applicationUrl}">Click here to fill out your application</a></p>`,
      });
    } else {
      return NextResponse.json(
        { error: "Channel must be SMS or EMAIL" },
        { status: 400 }
      );
    }

    // Log the event
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "APPLICATION_LINK_SENT",
        description: `Application link sent via ${channel} to ${to}`,
        metadata: { applicationId: application.id, channel, to },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send application link:", error);
    return NextResponse.json(
      { error: "Failed to send application link" },
      { status: 500 }
    );
  }
}
