import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import {
  enqueueMoveOutNotice,
  startMoveOutFlowWorker,
  getDepositReturnDeadline,
  getDepositAmount,
  calculateAutoDeductions,
} from "@/lib/jobs/move-out-flow";
import { getAuthContext } from "@/lib/auth-context";

// ─── GET: List move-out candidates and status ────────────────────────────────

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    // Get status for a specific tenant
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
        include: {
          unit: { include: { property: true } },
          leases: { where: { status: { in: ["ACTIVE", "TERMINATED"] } }, orderBy: { createdAt: "desc" }, take: 1 },
          notices: { where: { type: { in: ["MOVE_OUT", "DEPOSIT_DISPOSITION"] } }, orderBy: { createdAt: "desc" } },
          ledgerEntries: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      const depositAmount = await getDepositAmount(tenantId);
      const autoDeductions = await calculateAutoDeductions(tenantId);

      // Check for move-out initiation event
      const moveOutEvent = await prisma.event.findFirst({
        where: {
          tenantId,
          type: "SYSTEM",
          payload: { path: ["action"], equals: "MOVE_OUT_INITIATED" },
        },
        orderBy: { createdAt: "desc" },
      });

      // Check for inspection event
      const inspectionEvent = await prisma.event.findFirst({
        where: {
          tenantId,
          type: "INSPECTION",
          payload: { path: ["inspectionType"], equals: "MOVE_OUT" },
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({
        tenant: {
          id: tenant.id,
          name: `${tenant.firstName} ${tenant.lastName}`,
          phone: tenant.phone,
          email: tenant.email,
          unitName: tenant.unit?.name,
          propertyAddress: tenant.unit?.property
            ? `${tenant.unit.property.address}, ${tenant.unit.property.city}, ${tenant.unit.property.state}`
            : null,
          jurisdiction: tenant.unit?.property?.jurisdiction,
        },
        status: {
          moveOutInitiated: !!moveOutEvent,
          moveOutDate: moveOutEvent ? (moveOutEvent.payload as Record<string, unknown>)?.metadata && ((moveOutEvent.payload as Record<string, unknown>).metadata as Record<string, unknown>)?.moveOutDate : null,
          inspectionCompleted: !!inspectionEvent,
          inspectionDate: inspectionEvent?.createdAt ?? null,
          dispositionSent: tenant.notices.some((n) => n.type === "DEPOSIT_DISPOSITION" && n.status !== "DRAFT"),
          leaseStatus: tenant.leases[0]?.status,
          currentBalance: tenant.ledgerEntries[0]?.balance ?? 0,
          depositAmount,
          autoDeductions,
          notices: tenant.notices,
        },
      });
    }

    // List all tenants eligible for move-out (active lease, occupied unit)
    const activeTenants = await prisma.tenant.findMany({
      where: {
        active: true,
        unitId: { not: null },
        leases: { some: { status: "ACTIVE" } },
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: "ACTIVE" }, take: 1 },
        ledgerEntries: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    // Also get tenants with terminated leases still in units (in-progress move-outs)
    const terminatedTenants = await prisma.tenant.findMany({
      where: {
        active: true,
        unitId: { not: null },
        leases: { some: { status: "TERMINATED" } },
        NOT: { leases: { some: { status: "ACTIVE" } } },
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: "TERMINATED" }, orderBy: { createdAt: "desc" }, take: 1 },
        notices: { where: { type: { in: ["MOVE_OUT", "DEPOSIT_DISPOSITION"] } } },
        ledgerEntries: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const tenantsWithStatus = await Promise.all(
      [...activeTenants, ...terminatedTenants].map(async (tenant) => {
        const moveOutEvent = await prisma.event.findFirst({
          where: {
            tenantId: tenant.id,
            type: "SYSTEM",
            payload: { path: ["action"], equals: "MOVE_OUT_INITIATED" },
          },
          orderBy: { createdAt: "desc" },
        });

        const inspectionEvent = await prisma.event.findFirst({
          where: {
            tenantId: tenant.id,
            type: "INSPECTION",
            payload: { path: ["inspectionType"], equals: "MOVE_OUT" },
          },
          orderBy: { createdAt: "desc" },
        });

        const moveOutDate = moveOutEvent
          ? ((moveOutEvent.payload as Record<string, unknown>)?.metadata as Record<string, unknown>)?.moveOutDate as string ?? null
          : null;

        return {
          id: tenant.id,
          name: `${tenant.firstName} ${tenant.lastName}`,
          phone: tenant.phone,
          email: tenant.email,
          unitName: tenant.unit?.name,
          unitStatus: tenant.unit?.status,
          propertyAddress: tenant.unit?.property
            ? `${tenant.unit.property.address}, ${tenant.unit.property.city}, ${tenant.unit.property.state}`
            : null,
          propertyId: tenant.unit?.propertyId,
          jurisdiction: tenant.unit?.property?.jurisdiction,
          leaseStatus: tenant.leases[0]?.status,
          leaseEndDate: tenant.leases[0]?.endDate,
          rentAmount: tenant.leases[0]?.rentAmount,
          currentBalance: tenant.ledgerEntries[0]?.balance ?? 0,
          moveOutInitiated: !!moveOutEvent,
          moveOutDate,
          inspectionCompleted: !!inspectionEvent,
          dispositionSent: "notices" in tenant && (tenant.notices as Array<{ type: string; status: string }>).some(
            (n) => n.type === "DEPOSIT_DISPOSITION" && n.status !== "DRAFT"
          ),
        };
      })
    );

    return NextResponse.json({ tenants: tenantsWithStatus });
  } catch (error) {
    console.error("[MoveOut] GET error:", error);
    return NextResponse.json({ error: "Failed to get move-out data" }, { status: 500 });
  }
}

// ─── POST: Initiate move-out process ─────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, moveOutDate } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    if (!moveOutDate) {
      return NextResponse.json({ error: "moveOutDate is required" }, { status: 400 });
    }

    // Fetch tenant with relations, scoped to org
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: "ACTIVE" }, take: 1 },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (!tenant.unit) {
      return NextResponse.json({ error: "Tenant is not assigned to a unit" }, { status: 400 });
    }

    if (!tenant.leases[0]) {
      return NextResponse.json({ error: "Tenant does not have an active lease" }, { status: 400 });
    }

    // Check if move-out already initiated
    const existingMoveOut = await prisma.event.findFirst({
      where: {
        tenantId,
        type: "SYSTEM",
        payload: { path: ["action"], equals: "MOVE_OUT_INITIATED" },
      },
    });

    if (existingMoveOut) {
      return NextResponse.json(
        { error: "Move-out has already been initiated for this tenant", initiatedAt: existingMoveOut.createdAt },
        { status: 409 }
      );
    }

    const propertyAddress = `${tenant.unit.property.address}, ${tenant.unit.property.city}, ${tenant.unit.property.state}`;
    const jurisdiction = tenant.unit.property.jurisdiction;
    const deadline = getDepositReturnDeadline(moveOutDate, jurisdiction);

    // Create a MOVE_OUT notice
    const notice = await prisma.notice.create({
      data: {
        tenantId,
        type: "MOVE_OUT",
        status: "DRAFT",
        content: `Move-out scheduled for ${new Date(moveOutDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}. Deposit disposition deadline: ${deadline.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`,
      },
    });

    // Terminate the lease
    await prisma.lease.update({
      where: { id: tenant.leases[0].id },
      data: {
        status: "TERMINATED",
        endDate: new Date(moveOutDate),
      },
    });

    // Start the worker and enqueue notice
    startMoveOutFlowWorker();
    await enqueueMoveOutNotice({
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
      unitId: tenant.unitId!,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      tenantPhone: tenant.phone,
      tenantEmail: tenant.email,
      propertyAddress,
      unitName: tenant.unit.name,
      moveOutDate,
      noticeDate: new Date().toISOString(),
    });

    // Log the move-out initiation event
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "MOVE_OUT_INITIATED",
        description: `Move-out initiated for ${tenant.firstName} ${tenant.lastName} from ${tenant.unit.name}`,
        metadata: {
          moveOutDate,
          unitId: tenant.unitId,
          leaseId: tenant.leases[0].id,
          noticeId: notice.id,
          depositDeadline: deadline.toISOString(),
        },
      },
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
    });

    // Log lease termination event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: tenant.leases[0].id,
        action: "TERMINATED",
        version: tenant.leases[0].version,
      },
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
    });

    return NextResponse.json({
      success: true,
      message: `Move-out initiated for ${tenant.firstName} ${tenant.lastName}`,
      moveOutDate,
      depositDeadline: deadline.toISOString(),
      noticeId: notice.id,
    }, { status: 201 });
  } catch (error) {
    console.error("[MoveOut] POST error:", error);
    return NextResponse.json({ error: "Failed to initiate move-out" }, { status: 500 });
  }
}
