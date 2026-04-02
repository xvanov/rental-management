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
    const { leaseId, guarantors } = body as {
      leaseId: string;
      guarantors?: Array<{ name: string; email: string }>;
    };

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

    if (!lease || !lease.unit || !lease.tenant || lease.unit.property.organizationId !== ctx.organizationId) {
      return NextResponse.json(
        { error: "Lease not found or missing tenant/unit" },
        { status: 404 }
      );
    }

    const tenant = lease.tenant;
    const unit = lease.unit;

    if (lease.status === "ACTIVE" || lease.status === "EXPIRED" || lease.status === "TERMINATED") {
      return NextResponse.json(
        { error: `Cannot send a ${lease.status} lease for signature` },
        { status: 400 }
      );
    }

    if (!tenant.email) {
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const propertyDesc = `${unit.name} at ${unit.property.address}`;

    // ─── Create signing token for tenant ──────────────────────────────
    const tenantToken = await prisma.signingToken.create({
      data: {
        leaseId,
        signerEmail: tenant.email,
        signerName: `${tenant.firstName} ${tenant.lastName}`,
        signerRole: "TENANT",
        expiresAt,
      },
    });

    const tenantSigningUrl = `${appUrl}/sign/${tenantToken.token}`;

    // Send email to tenant
    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendEmail({
        to: tenant.email,
        subject: `Lease Agreement Ready for Signature - ${propertyDesc}`,
        text: `Hi ${tenant.firstName},\n\nYour lease agreement for ${propertyDesc} is ready for signature.\n\nPlease review and sign your lease at: ${tenantSigningUrl}\n\nThis link will expire in 30 days.`,
        html: `
          <p>Hi ${tenant.firstName},</p>
          <p>Your lease agreement for <strong>${propertyDesc}</strong> is ready for signature.</p>
          <p><a href="${tenantSigningUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Review &amp; Sign Lease</a></p>
          <p style="color: #666; font-size: 14px;">Or copy this link: ${tenantSigningUrl}</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 30 days.</p>
        `,
        tenantId: lease.tenantId || undefined,
        propertyId: unit.propertyId,
      });
      emailSent = true;
    } catch (emailErr) {
      const msg = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("Failed to send signing email:", msg);
      emailError = msg;
    }

    // ─── Create signing tokens for guarantors ─────────────────────────
    const guarantorResults: Array<{ name: string; email: string; signingUrl: string; emailSent: boolean }> = [];

    if (guarantors && guarantors.length > 0) {
      for (const guarantor of guarantors) {
        if (!guarantor.email || !guarantor.name) continue;

        const gToken = await prisma.signingToken.create({
          data: {
            leaseId,
            signerEmail: guarantor.email,
            signerName: guarantor.name,
            signerRole: "GUARANTOR",
            expiresAt,
          },
        });

        const gSigningUrl = `${appUrl}/sign/${gToken.token}`;
        let gEmailSent = false;

        try {
          await sendEmail({
            to: guarantor.email,
            subject: `Guarantor Signature Required - Lease for ${propertyDesc}`,
            text: `Hi ${guarantor.name},\n\nYou have been listed as a guarantor for a lease agreement at ${propertyDesc}.\n\nPlease review the lease and guarantor terms, then sign at: ${gSigningUrl}\n\nThis link will expire in 30 days.`,
            html: `
              <p>Hi ${guarantor.name},</p>
              <p>You have been listed as a <strong>guarantor</strong> for a lease agreement at <strong>${propertyDesc}</strong>.</p>
              <p>As a guarantor, you agree to be responsible for the tenant's obligations under the lease, including rent payments.</p>
              <p><a href="${gSigningUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">Review &amp; Sign as Guarantor</a></p>
              <p style="color: #666; font-size: 14px;">Or copy this link: ${gSigningUrl}</p>
              <p style="color: #666; font-size: 14px;">This link will expire in 30 days.</p>
            `,
            propertyId: unit.propertyId,
          });
          gEmailSent = true;
        } catch (err) {
          console.error(`Failed to send guarantor signing email to ${guarantor.email}:`, err);
        }

        guarantorResults.push({
          name: guarantor.name,
          email: guarantor.email,
          signingUrl: gSigningUrl,
          emailSent: gEmailSent,
        });
      }
    }

    // Log event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: lease.id,
        action: "CREATED",
        version: lease.version,
      },
      tenantId: lease.tenantId || undefined,
      propertyId: unit.propertyId,
    });

    return NextResponse.json({
      success: true,
      signingUrl: tenantSigningUrl,
      emailSent,
      emailError,
      guarantors: guarantorResults,
      message: emailSent
        ? `Lease sent for signature${guarantorResults.length > 0 ? ` (${guarantorResults.length} guarantor(s) also notified)` : ""}`
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
