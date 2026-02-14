import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";
import fs from "fs";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; documentId: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { tenantId, documentId } = await params;

    // Verify tenant belongs to this org
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        ...orgScope.tenant(ctx.organizationId),
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const document = await prisma.tenantDocument.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), document.filePath);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Document file not found on disk" },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);
    const contentType = document.mimeType || "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${document.fileName}"`,
      },
    });
  } catch (error) {
    console.error("Failed to serve tenant document:", error);
    return NextResponse.json(
      { error: "Failed to serve document" },
      { status: 500 }
    );
  }
}
