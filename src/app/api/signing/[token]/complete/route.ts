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
    const { signatureDataUrl, fullName, smsConsent } = body;

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
            signingTokens: true, // Need all tokens to check if everyone signed
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

    if (!signingToken.lease.tenant || !signingToken.lease.tenantId || !signingToken.lease.unit) {
      return NextResponse.json(
        { error: "Lease is missing tenant or unit" },
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

    // Update this signing token — mark as used and store signature
    await prisma.signingToken.update({
      where: { id: signingToken.id },
      data: {
        usedAt: new Date(),
        ipAddress,
        userAgent,
        signatureDataUrl,
      },
    });

    // Update tenant SMS consent if tenant is signing and opted in
    if (smsConsent && signingToken.signerRole === "TENANT") {
      await prisma.tenant.update({
        where: { id: signingToken.lease.tenantId },
        data: {
          smsConsent: true,
          smsConsentDate: new Date(),
        },
      });
    }

    // Log signing event
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

    // Check if ALL signers have now signed
    const allTokens = signingToken.lease.signingTokens;
    const unsignedCount = allTokens.filter(
      (t) => !t.usedAt && t.id !== signingToken.id // Exclude current (just marked as used above)
    ).length;

    if (unsignedCount > 0) {
      // Still waiting for other signers
      return NextResponse.json({
        success: true,
        leaseId: signingToken.lease.id,
        allSigned: false,
        remainingSigners: unsignedCount,
        message: `Signature recorded. Waiting for ${unsignedCount} more signer(s) to complete.`,
      });
    }

    // All signers have signed — generate final PDF with all signatures and activate lease
    // Reload all tokens to get stored signatures
    const completedTokens = await prisma.signingToken.findMany({
      where: { leaseId: signingToken.lease.id },
      orderBy: { createdAt: "asc" },
    });

    // Find tenant signature (primary signer for PDF)
    const tenantToken = completedTokens.find((t) => t.signerRole === "TENANT");
    const guarantorTokens = completedTokens.filter((t) => t.signerRole === "GUARANTOR");

    // Generate PDF with tenant signature
    const tenantSignature = tenantToken?.signatureDataUrl
      ? { name: tenantToken.signerName, signatureDataUrl: tenantToken.signatureDataUrl, date: signedDate }
      : { name: fullName, signatureDataUrl, date: signedDate };

    // Build guarantor signatures for the PDF
    const guarantorSignatures = guarantorTokens.map((gt) => ({
      name: gt.signerName,
      signatureDataUrl: gt.signatureDataUrl || "",
      date: gt.usedAt
        ? gt.usedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : signedDate,
    }));

    const pdfBuffer = await generateLeasePdfBuffer(
      signingToken.lease,
      tenantSignature,
      guarantorSignatures.length > 0 ? guarantorSignatures : undefined
    );

    // Save signed PDF
    const signedDocumentPath = await saveSignedDocument(
      signingToken.lease.id,
      pdfBuffer
    );

    // Activate lease
    await prisma.lease.update({
      where: { id: signingToken.lease.id },
      data: {
        status: "ACTIVE",
        signedAt: new Date(),
        signedDocumentUrl: signedDocumentPath,
      },
    });

    return NextResponse.json({
      success: true,
      leaseId: signingToken.lease.id,
      allSigned: true,
      message: "All parties have signed. Lease is now active.",
    });
  } catch (error) {
    console.error("Failed to complete signing:", error);
    return NextResponse.json(
      { error: "Failed to complete signing" },
      { status: 500 }
    );
  }
}
