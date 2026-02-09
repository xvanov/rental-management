import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLeasePdfBuffer } from "@/lib/lease-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

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

    if (new Date() > signingToken.expiresAt) {
      return NextResponse.json(
        { error: "This signing link has expired" },
        { status: 410 }
      );
    }

    const { lease } = signingToken;

    const pdfBuffer = await generateLeasePdfBuffer(lease);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lease-${lease.unit.name}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate lease PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
