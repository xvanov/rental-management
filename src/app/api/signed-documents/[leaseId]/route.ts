import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import fs from "fs";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leaseId: string }> }
) {
  try {
    const { leaseId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    let authorized = false;

    if (token) {
      // Public access via signing token — only if the token was used (person signed)
      const signingToken = await prisma.signingToken.findFirst({
        where: { leaseId, token, usedAt: { not: null } },
      });
      if (signingToken) authorized = true;
    } else {
      // Admin access via auth
      const ctx = await getAuthContext();
      if (!(ctx instanceof NextResponse)) authorized = true;
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: { tenant: true, unit: { include: { property: true } } },
    });

    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
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
    const tenantName = lease.tenant?.lastName || "tenant";
    const unitName = lease.unit?.name || "lease";

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="signed-lease-${tenantName}-${unitName}.pdf"`,
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
