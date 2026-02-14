import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getEffectiveLastChanged,
  isOverdue,
  getNextDueDate,
  cadenceToMonths,
} from "@/lib/air-filters";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const configs = await prisma.airFilterConfig.findMany({
      where: { property: { organizationId: ctx.organizationId } },
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        filters: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const enriched = configs.map((config) => {
      const effectiveLastChanged = getEffectiveLastChanged(config);
      return {
        ...config,
        isOverdue: isOverdue(effectiveLastChanged, config.cadence),
        nextDueDate: getNextDueDate(effectiveLastChanged, config.cadence),
        effectiveLastChanged,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Failed to fetch air filter configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch air filter configs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { propertyId, cadence, filters, notes } = body;

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found in your organization" },
        { status: 404 }
      );
    }

    const existing = await prisma.airFilterConfig.findUnique({
      where: { propertyId },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Air filter config already exists for this property" },
        { status: 409 }
      );
    }

    const config = await prisma.airFilterConfig.create({
      data: {
        propertyId,
        cadence: cadence || "MONTHS_3",
        notes: notes || null,
        filters: {
          create: (filters || []).map(
            (f: { dimensions: string; label?: string }) => ({
              dimensions: f.dimensions,
              label: f.label || null,
            })
          ),
        },
      },
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        filters: true,
      },
    });

    // If no lastChangedDate, the config is immediately overdue — create a task
    const effectiveLastChanged = getEffectiveLastChanged(config);
    if (isOverdue(effectiveLastChanged, config.cadence)) {
      const months = cadenceToMonths(config.cadence);
      await prisma.task.create({
        data: {
          title: `Change air filters - ${config.property.address}`,
          description: `Air filters are overdue for change (${months}-month cadence). ${config.filters.length} filter(s) to replace.`,
          priority: "HIGH",
          source: "AIR_FILTER",
          sourceId: config.id,
          propertyId,
          dueDate: getNextDueDate(effectiveLastChanged, config.cadence),
        },
      });
    }

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error("Failed to create air filter config:", error);
    return NextResponse.json(
      { error: "Failed to create air filter config" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, cadence, notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Config id is required" },
        { status: 400 }
      );
    }

    // Verify config belongs to org
    const existing = await prisma.airFilterConfig.findFirst({
      where: { id, property: { organizationId: ctx.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Config not found in your organization" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    if (cadence !== undefined) data.cadence = cadence;
    if (notes !== undefined) data.notes = notes || null;

    const config = await prisma.airFilterConfig.update({
      where: { id },
      data,
      include: {
        property: { select: { id: true, address: true, city: true, state: true } },
        filters: true,
      },
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to update air filter config:", error);
    return NextResponse.json(
      { error: "Failed to update air filter config" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Config id is required" },
        { status: 400 }
      );
    }

    const config = await prisma.airFilterConfig.findFirst({
      where: { id, property: { organizationId: ctx.organizationId } },
      select: { propertyId: true },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Config not found" },
        { status: 404 }
      );
    }

    // Dismiss any open air filter tasks for this property
    await prisma.task.updateMany({
      where: {
        propertyId: config.propertyId,
        source: "AIR_FILTER",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: { status: "DISMISSED", completedAt: new Date() },
    });

    // Delete config (filters cascade)
    await prisma.airFilterConfig.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete air filter config:", error);
    return NextResponse.json(
      { error: "Failed to delete air filter config" },
      { status: 500 }
    );
  }
}
