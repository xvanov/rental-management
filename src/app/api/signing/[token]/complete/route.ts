import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { generateLeasePdfBuffer } from "@/lib/lease-pdf";
import { saveSignedDocument } from "@/lib/signing";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { signatureDataUrl, fullName } = body;

    if (!signatureDataUrl || !fullName) {
      return NextResponse.json(
        { error: "signatureDataUrl and fullName are required" },
        { status: 400 }
      );
    }

    const signingToken = await prisma.signingToken.findUnique({
      where: { token },
      include: {
        lease: {
          include: {
            tenant: true,
            unit: { include: { property: true } },
          },
        },
      },
    });

    if (!signingToken) {
      return NextResponse.json(
        { error: "Invalid signing link" },
        { status: 404 }
      );
    }

    if (signingToken.usedAt) {
      return NextResponse.json(
        { error: "This lease has already been signed" },
        { status: 410 }
      );
    }

    if (new Date() > signingToken.expiresAt) {
      return NextResponse.json(
        { error: "This signing link has expired" },
        { status: 410 }
      );
    }

    if (signingToken.lease.status !== "PENDING_SIGNATURE") {
      return NextResponse.json(
        { error: "This lease is no longer available for signing" },
        { status: 400 }
      );
    }

    // Capture request metadata
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const signedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Generate PDF with tenant signature baked in
    const pdfBuffer = await generateLeasePdfBuffer(
      signingToken.lease,
      { name: fullName, signatureDataUrl, date: signedDate }
    );

    // Save signed PDF to filesystem
    const signedDocumentPath = await saveSignedDocument(
      signingToken.lease.id,
      pdfBuffer
    );

    // Update signing token
    await prisma.signingToken.update({
      where: { id: signingToken.id },
      data: {
        usedAt: new Date(),
        ipAddress,
        userAgent,
      },
    });

    // Update lease to ACTIVE
    await prisma.lease.update({
      where: { id: signingToken.lease.id },
      data: {
        status: "ACTIVE",
        signedAt: new Date(),
        signedDocumentUrl: signedDocumentPath,
      },
    });

    // Log event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: signingToken.lease.id,
        action: "SIGNED",
        signerName: fullName,
        signerEmail: signingToken.signerEmail,
        ipAddress,
      },
      tenantId: signingToken.lease.tenantId,
      propertyId: signingToken.lease.unit.propertyId,
    });

    return NextResponse.json({ success: true, leaseId: signingToken.lease.id });
  } catch (error) {
    console.error("Failed to complete signing:", error);
    return NextResponse.json(
      { error: "Failed to complete signing" },
      { status: 500 }
    );
  }
}
