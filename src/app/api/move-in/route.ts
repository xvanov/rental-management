import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import {
  enqueueWelcomeFlow,
  startWelcomeFlowWorker,
  checkMoveInPaymentsReceived,
  getMoveInChecklist,
} from "@/lib/jobs/welcome-flow";
import { getAuthContext } from "@/lib/auth-context";

// ─── GET: Check move-in status or get checklist ──────────────────────────────

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const action = searchParams.get("action");

    // Return move-in checklist
    if (action === "checklist") {
      return NextResponse.json({ checklist: getMoveInChecklist() });
    }

    // Get move-in status for a specific tenant
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
        include: {
          unit: { include: { property: true } },
          leases: { where: { status: "ACTIVE" }, take: 1 },
          payments: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      });

      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      const paymentsReceived = await checkMoveInPaymentsReceived(tenantId);

      // Check if welcome has already been sent
      const welcomeEvent = await prisma.event.findFirst({
        where: {
          tenantId,
          type: "SYSTEM",
          payload: { path: ["action"], equals: "WELCOME_SENT" },
        },
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
        },
        status: {
          hasActiveLease: tenant.leases.length > 0,
          paymentsReceived,
          welcomeSent: !!welcomeEvent,
          welcomeSentAt: welcomeEvent?.createdAt ?? null,
          unitStatus: tenant.unit?.status,
          paymentCount: tenant.payments.length,
        },
      });
    }

    // Get all tenants eligible for move-in (have active lease but unit not yet OCCUPIED)
    const eligibleTenants = await prisma.tenant.findMany({
      where: {
        active: true,
        unitId: { not: null },
        leases: { some: { status: "ACTIVE" } },
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: "ACTIVE" }, take: 1 },
        payments: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    // Also get tenants with pending leases who may be ready
    const pendingTenants = await prisma.tenant.findMany({
      where: {
        active: true,
        unitId: { not: null },
        leases: { some: { status: "PENDING_SIGNATURE" } },
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: "PENDING_SIGNATURE" }, take: 1 },
        payments: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    const tenantsWithStatus = await Promise.all(
      [...eligibleTenants, ...pendingTenants].map(async (tenant) => {
        const welcomeEvent = await prisma.event.findFirst({
          where: {
            tenantId: tenant.id,
            type: "SYSTEM",
            payload: { path: ["action"], equals: "WELCOME_SENT" },
          },
        });

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
          leaseStatus: tenant.leases[0]?.status,
          rentAmount: tenant.leases[0]?.rentAmount,
          startDate: tenant.leases[0]?.startDate,
          paymentCount: tenant.payments.length,
          welcomeSent: !!welcomeEvent,
          welcomeSentAt: welcomeEvent?.createdAt ?? null,
        };
      })
    );

    return NextResponse.json({ tenants: tenantsWithStatus });
  } catch (error) {
    console.error("[MoveIn] GET error:", error);
    return NextResponse.json({ error: "Failed to get move-in data" }, { status: 500 });
  }
}

// ─── POST: Trigger welcome flow ──────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, moveInDate } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
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

    // Check if welcome was already sent
    const existingWelcome = await prisma.event.findFirst({
      where: {
        tenantId,
        type: "SYSTEM",
        payload: { path: ["action"], equals: "WELCOME_SENT" },
      },
    });

    if (existingWelcome) {
      return NextResponse.json(
        { error: "Welcome flow has already been sent to this tenant", sentAt: existingWelcome.createdAt },
        { status: 409 }
      );
    }

    const propertyAddress = `${tenant.unit.property.address}, ${tenant.unit.property.city}, ${tenant.unit.property.state}`;
    const effectiveMoveInDate = moveInDate ?? tenant.leases[0].startDate?.toISOString().split("T")[0] ?? new Date().toISOString().split("T")[0];

    // Start the worker
    startWelcomeFlowWorker();

    // Enqueue the welcome flow
    await enqueueWelcomeFlow({
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
      unitId: tenant.unitId!,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      tenantPhone: tenant.phone,
      tenantEmail: tenant.email,
      propertyAddress,
      unitName: tenant.unit.name,
      moveInDate: effectiveMoveInDate,
    });

    // Update unit status to OCCUPIED
    await prisma.unit.update({
      where: { id: tenant.unitId! },
      data: { status: "OCCUPIED" },
    });

    // Log the move-in initiation event
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "MOVE_IN_INITIATED",
        description: `Move-in process initiated for ${tenant.firstName} ${tenant.lastName} at ${tenant.unit.name}`,
        metadata: {
          moveInDate: effectiveMoveInDate,
          unitId: tenant.unitId,
          leaseId: tenant.leases[0].id,
        },
      },
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
    });

    return NextResponse.json({
      success: true,
      message: `Welcome flow initiated for ${tenant.firstName} ${tenant.lastName}`,
      moveInDate: effectiveMoveInDate,
      unitStatus: "OCCUPIED",
    }, { status: 201 });
  } catch (error) {
    console.error("[MoveIn] POST error:", error);
    return NextResponse.json({ error: "Failed to trigger welcome flow" }, { status: 500 });
  }
}
