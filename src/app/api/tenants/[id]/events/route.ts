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

    // Verify tenant belongs to org
    const tenant = await prisma.tenant.findFirst({
      where: { id, unit: { property: { organizationId: ctx.organizationId } } },
    });
    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const eventsWhere = {
      tenantId: id,
      property: { organizationId: ctx.organizationId },
    };

    const events = await prisma.event.findMany({
      where: eventsWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.event.count({
      where: eventsWhere,
    });

    return NextResponse.json({ events, total });
  } catch (error) {
    console.error("Failed to fetch tenant events:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenant events" },
      { status: 500 }
    );
  }
}
