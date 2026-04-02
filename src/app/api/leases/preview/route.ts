import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const lease = await prisma.lease.findFirst({
      where: {
        id,
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
    });

    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    return NextResponse.json({
      signerName: lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : "N/A",
      signerEmail: lease.tenant?.email || "",
      leaseContent: lease.content,
      propertyAddress: lease.unit?.property ? `${lease.unit.property.address}, ${lease.unit.property.city}, ${lease.unit.property.state} ${lease.unit.property.zip}` : "N/A",
      unitName: lease.unit?.name ?? "N/A",
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      preview: true,
    });
  } catch (error) {
    console.error("Failed to fetch lease preview:", error);
    return NextResponse.json(
      { error: "Failed to load lease preview" },
      { status: 500 }
    );
  }
}
