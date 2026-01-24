import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { isXodoSignConfigured, sendForSignature } from "@/lib/integrations/xodo-sign";

export async function POST(request: NextRequest) {
  try {
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

    if (!lease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    if (lease.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT leases can be sent for signature" },
        { status: 400 }
      );
    }

    if (!lease.tenant.email) {
      return NextResponse.json(
        { error: "Tenant must have an email address for e-signature" },
        { status: 400 }
      );
    }

    if (!isXodoSignConfigured()) {
      // When Xodo Sign is not configured, just transition the status
      await prisma.lease.update({
        where: { id: leaseId },
        data: { status: "PENDING_SIGNATURE" },
      });

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
        message: "Lease marked as pending signature (Xodo Sign not configured)",
      });
    }

    // Send for signature via Xodo Sign
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const webhookUrl = `${appUrl}/api/webhooks/xodo-sign`;

    const result = await sendForSignature({
      leaseContent: lease.content,
      fileName: `lease-${lease.id}.pdf`,
      signerEmail: lease.tenant.email,
      signerName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      webhookUrl,
    });

    // Update lease with Xodo Sign document ID
    await prisma.lease.update({
      where: { id: leaseId },
      data: {
        status: "PENDING_SIGNATURE",
        xodoSignDocumentId: result.documentId,
      },
    });

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
      documentId: result.documentId,
      message: "Lease sent for signature via Xodo Sign",
    });
  } catch (error) {
    console.error("Failed to send lease for signature:", error);
    return NextResponse.json(
      { error: "Failed to send lease for signature" },
      { status: 500 }
    );
  }
}
