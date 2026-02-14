import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { sendEmail } from "@/lib/integrations/sendgrid";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { leaseId } = body;

    if (!leaseId) {
      return NextResponse.json(
        { error: "leaseId is required" },
        { status: 400 }
      );
    }

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
    });

    if (!lease || lease.unit.property.organizationId !== ctx.organizationId) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    if (lease.status === "ACTIVE" || lease.status === "EXPIRED" || lease.status === "TERMINATED") {
      return NextResponse.json(
        { error: `Cannot send a ${lease.status} lease for signature` },
        { status: 400 }
      );
    }

    if (!lease.tenant.email) {
      return NextResponse.json(
        { error: "Tenant must have an email address for e-signature" },
        { status: 400 }
      );
    }

    // Set lease status to PENDING_SIGNATURE
    await prisma.lease.update({
      where: { id: leaseId },
      data: { status: "PENDING_SIGNATURE" },
    });

    // Create signing token with 30-day expiry
    const signingToken = await prisma.signingToken.create({
      data: {
        leaseId,
        signerEmail: lease.tenant.email,
        signerName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const signingUrl = `${appUrl}/sign/${signingToken.token}`;

    // Send email with signing link
    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendEmail({
        to: lease.tenant.email,
        subject: `Lease Agreement Ready for Signature - ${lease.unit.name} at ${lease.unit.property.address}`,
        text: `Hi ${lease.tenant.firstName},\n\nYour lease agreement for ${lease.unit.name} at ${lease.unit.property.address} is ready for signature.\n\nPlease review and sign your lease at: ${signingUrl}\n\nThis link will expire in 30 days.`,
        html: `
          <p>Hi ${lease.tenant.firstName},</p>
          <p>Your lease agreement for <strong>${lease.unit.name}</strong> at <strong>${lease.unit.property.address}</strong> is ready for signature.</p>
          <p><a href="${signingUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Review &amp; Sign Lease</a></p>
          <p style="color: #666; font-size: 14px;">Or copy this link: ${signingUrl}</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 30 days.</p>
        `,
        tenantId: lease.tenantId,
        propertyId: lease.unit.propertyId,
      });
      emailSent = true;
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("Failed to send signing email:", msg);
      emailError = msg;
    }

    // Log event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: lease.id,
        action: "CREATED",
        version: lease.version,
      },
      tenantId: lease.tenantId,
      propertyId: lease.unit.propertyId,
    });

    return NextResponse.json({
      success: true,
      signingUrl,
      emailSent,
      emailError,
      message: emailSent
        ? "Lease sent for signature"
        : "Signing link created but email failed to send — share the link manually",
    });
  } catch (error) {
    console.error("Failed to send lease for signature:", error);
    return NextResponse.json(
      { error: "Failed to send lease for signature" },
      { status: 500 }
    );
  }
}
