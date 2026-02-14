import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logMaintenanceEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { configId, date, filterIds } = body;

    if (!configId) {
      return NextResponse.json(
        { error: "configId is required" },
        { status: 400 }
      );
    }

    const changeDate = date ? new Date(date) : new Date();

    // Verify config belongs to org
    const config = await prisma.airFilterConfig.findFirst({
      where: { id: configId, property: { organizationId: ctx.organizationId } },
      include: { filters: true },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Config not found" },
        { status: 404 }
      );
    }

    // Determine which filters to update (all if none specified)
    const targetFilterIds =
      filterIds && filterIds.length > 0
        ? filterIds
        : config.filters.map((f) => f.id);

    // Update individual filter dates
    await prisma.airFilter.updateMany({
      where: { id: { in: targetFilterIds } },
      data: { lastChangedDate: changeDate },
    });

    // Update config-level lastChangedDate
    await prisma.airFilterConfig.update({
      where: { id: configId },
      data: { lastChangedDate: changeDate },
    });

    // Complete any open AIR_FILTER tasks for this property
    await prisma.task.updateMany({
      where: {
        propertyId: config.propertyId,
        source: "AIR_FILTER",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    // Log maintenance event
    await logMaintenanceEvent(
      {
        maintenanceType: "AIR_FILTER",
        action: "FILTER_CHANGED",
        configId,
        filterCount: targetFilterIds.length,
        description: `Changed ${targetFilterIds.length} air filter(s)`,
      },
      { propertyId: config.propertyId }
    );

    return NextResponse.json({ success: true, filtersUpdated: targetFilterIds.length });
  } catch (error) {
    console.error("Failed to log filter change:", error);
    return NextResponse.json(
      { error: "Failed to log filter change" },
      { status: 500 }
    );
  }
}
