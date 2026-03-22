import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id } = await params;

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { units: { select: { id: true } } },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const activeParam = searchParams.get("active");

    const unitIds = property.units.map((u) => u.id);

    const where: Record<string, unknown> = {
      unitId: { in: unitIds },
    };
    if (activeParam !== null) {
      where.active = activeParam === "true";
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        unit: { select: { name: true } },
        leases: { select: { status: true, startDate: true, endDate: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tenants);
  } catch (error) {
    console.error("Failed to fetch property tenants:", error);
    return NextResponse.json(
      { error: "Failed to fetch property tenants" },
      { status: 500 }
    );
  }
}
