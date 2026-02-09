import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateLeasePdfBuffer } from "@/lib/lease-pdf";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Lease ID is required" },
        { status: 400 }
      );
    }

    const lease = await prisma.lease.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: {
          include: { property: true },
        },
        template: true,
      },
    });

    if (!lease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    const pdfBuffer = await generateLeasePdfBuffer(lease);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lease-${lease.tenant.lastName}-${lease.unit.name}.pdf"`,
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
