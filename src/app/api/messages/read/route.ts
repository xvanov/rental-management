import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId is required" },
        { status: 400 }
      );
    }

    // Verify tenant belongs to this org
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Mark all inbound messages from this tenant as read
    const result = await prisma.message.updateMany({
      where: {
        tenantId,
        direction: "INBOUND",
        read: false,
        tenant: { unit: { property: { organizationId: ctx.organizationId } } },
      },
      data: { read: true },
    });

    return NextResponse.json({ marked: result.count });
  } catch (error) {
    console.error("Failed to mark messages as read:", error);
    return NextResponse.json(
      { error: "Failed to mark messages as read" },
      { status: 500 }
    );
  }
}
