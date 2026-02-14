import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, orgScope } from "@/lib/auth-context";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { tenantId } = await params;

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

    const documents = await prisma.tenantDocument.findMany({
      where: { tenantId },
      orderBy: { uploadedAt: "desc" },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Failed to list tenant documents:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}
