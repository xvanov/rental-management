import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const { leaseId } = await params;

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: { tenant: true, unit: true },
    });

    if (!lease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    if (!lease.signedDocumentUrl) {
      return NextResponse.json(
        { error: "No signed document available" },
        { status: 404 }
      );
    }

    const filePath = path.join(process.cwd(), lease.signedDocumentUrl);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Signed document file not found" },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="signed-lease-${lease.tenant.lastName}-${lease.unit.name}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to serve signed document:", error);
    return NextResponse.json(
      { error: "Failed to serve signed document" },
      { status: 500 }
    );
  }
}
