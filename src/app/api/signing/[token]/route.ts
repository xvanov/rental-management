import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

    const { lease } = signingToken;

    return NextResponse.json({
      signerName: signingToken.signerName,
      signerEmail: signingToken.signerEmail,
      leaseContent: lease.content,
      propertyAddress: `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state} ${lease.unit.property.zip}`,
      unitName: lease.unit.name,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
    });
  } catch (error) {
    console.error("Failed to fetch signing data:", error);
    return NextResponse.json(
      { error: "Failed to load signing data" },
      { status: 500 }
    );
  }
}
