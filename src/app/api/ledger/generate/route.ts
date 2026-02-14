import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logSystemEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

/**
 * POST /api/ledger/generate
 * Generates monthly rent charges for all active tenants.
 * Also applies late fees based on lease clause rules.
 * Can be called by a cron job or manually from the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json();
    const { period, tenantId, action } = body;

    // action: "rent" | "late-fees" | "prorate"
    if (!action) {
      return NextResponse.json(
        { error: "action is required (rent, late-fees, or prorate)" },
        { status: 400 }
      );
    }

    if (action === "rent") {
      return await generateRentCharges(ctx.organizationId, period);
    } else if (action === "late-fees") {
      return await applyLateFees(ctx.organizationId, period);
    } else if (action === "prorate") {
      if (!tenantId) {
        return NextResponse.json(
          { error: "tenantId is required for prorate action" },
          { status: 400 }
        );
      }
      return await generateProration(ctx.organizationId, tenantId, body.moveInDate);
    }

    return NextResponse.json(
      { error: "Invalid action. Use: rent, late-fees, or prorate" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to generate ledger entries:", error);
    return NextResponse.json(
      { error: "Failed to generate ledger entries" },
      { status: 500 }
    );
  }
}

async function generateRentCharges(organizationId: string, periodOverride?: string) {
  const period = periodOverride || formatPeriod(new Date());

  // Find all active leases with tenants, scoped to org
  const activeLeases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      unit: { property: { organizationId } },
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
      clauses: true,
    },
  });

  const results: Array<{ tenantId: string; tenantName: string; amount: number; status: string }> = [];

  for (const lease of activeLeases) {
    if (!lease.tenant) continue;

    // Check if rent already charged for this period
    const existingRent = await prisma.ledgerEntry.findFirst({
      where: {
        tenantId: lease.tenantId,
        type: "RENT",
        period,
      },
    });

    if (existingRent) {
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        amount: 0,
        status: "already_charged",
      });
      continue;
    }

    // Get rent amount from lease
    const rentAmount = lease.rentAmount || 0;
    if (rentAmount <= 0) continue;

    // Get current balance
    const latestLedger = await prisma.ledgerEntry.findFirst({
      where: { tenantId: lease.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const currentBalance = latestLedger?.balance ?? 0;
    const newBalance = currentBalance + rentAmount;

    // Create rent charge ledger entry
    await prisma.ledgerEntry.create({
      data: {
        tenantId: lease.tenantId,
        type: "RENT",
        amount: rentAmount,
        description: `Monthly rent - ${formatPeriodLabel(period)}`,
        period,
        balance: newBalance,
      },
    });

    results.push({
      tenantId: lease.tenantId,
      tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      amount: rentAmount,
      status: "charged",
    });
  }

  // Log system event
  await logSystemEvent(
    {
      action: "RENT_CHARGES_GENERATED",
      description: `Generated rent charges for period ${period}`,
      metadata: { period, count: results.filter((r) => r.status === "charged").length },
    }
  );

  return NextResponse.json({
    period,
    results,
    charged: results.filter((r) => r.status === "charged").length,
    skipped: results.filter((r) => r.status === "already_charged").length,
  });
}

async function applyLateFees(organizationId: string, periodOverride?: string) {
  const period = periodOverride || formatPeriod(new Date());

  // Find all active leases with their clauses, scoped to org
  const activeLeases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      unit: { property: { organizationId } },
    },
    include: {
      tenant: true,
      clauses: true,
    },
  });

  const results: Array<{ tenantId: string; tenantName: string; feeAmount: number; status: string }> = [];

  for (const lease of activeLeases) {
    if (!lease.tenant) continue;

    // Get late fee and grace period from lease clauses
    const lateFeeClause = lease.clauses.find((c) => c.type === "LATE_FEE");
    const gracePeriodClause = lease.clauses.find((c) => c.type === "GRACE_PERIOD");
    const dueDateClause = lease.clauses.find((c) => c.type === "RENT_DUE_DATE");

    if (!lateFeeClause) {
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        feeAmount: 0,
        status: "no_late_fee_clause",
      });
      continue;
    }

    // Determine due date and grace period
    const metadata = lateFeeClause.metadata as Record<string, unknown>;
    const dueDateMeta = dueDateClause?.metadata as Record<string, unknown> | undefined;
    const graceMeta = gracePeriodClause?.metadata as Record<string, unknown> | undefined;

    const dueDay = (dueDateMeta?.dueDay as number) || 1;
    const graceDays = (graceMeta?.days as number) || 0;
    const rawFeeAmount = (metadata?.amount as number) || 0;
    const feeType = (metadata?.type as string) || "fixed";
    const resolvedFeeAmount = feeType === "percentage"
      ? (lease.rentAmount || 0) * (rawFeeAmount / 100)
      : rawFeeAmount;

    if (resolvedFeeAmount <= 0) continue;

    // Calculate the deadline (due date + grace period)
    const [year, month] = period.split("-").map(Number);
    const dueDate = new Date(year, month - 1, dueDay);
    const deadline = new Date(dueDate);
    deadline.setDate(deadline.getDate() + graceDays);

    // Only apply late fee if we're past the deadline
    const now = new Date();
    if (now <= deadline) {
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        feeAmount: 0,
        status: "within_grace_period",
      });
      continue;
    }

    // Check if late fee already applied for this period
    const existingLateFee = await prisma.ledgerEntry.findFirst({
      where: {
        tenantId: lease.tenantId,
        type: "LATE_FEE",
        period,
      },
    });

    if (existingLateFee) {
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        feeAmount: 0,
        status: "already_applied",
      });
      continue;
    }

    // Check if rent has been paid in full for this period
    const rentEntry = await prisma.ledgerEntry.findFirst({
      where: { tenantId: lease.tenantId, type: "RENT", period },
    });

    if (!rentEntry) {
      // No rent charge means no late fee needed
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        feeAmount: 0,
        status: "no_rent_charge",
      });
      continue;
    }

    // Check total payments for this period
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);
    const periodPayments = await prisma.ledgerEntry.findMany({
      where: {
        tenantId: lease.tenantId,
        type: "PAYMENT",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    });

    const totalPaid = periodPayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
    const rentDue = rentEntry.amount;

    if (totalPaid >= rentDue) {
      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        feeAmount: 0,
        status: "rent_paid",
      });
      continue;
    }

    // Apply late fee
    const latestLedger = await prisma.ledgerEntry.findFirst({
      where: { tenantId: lease.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const currentBalance = latestLedger?.balance ?? 0;
    const newBalance = currentBalance + resolvedFeeAmount;

    await prisma.ledgerEntry.create({
      data: {
        tenantId: lease.tenantId,
        type: "LATE_FEE",
        amount: resolvedFeeAmount,
        description: `Late fee - ${formatPeriodLabel(period)}`,
        period,
        balance: newBalance,
      },
    });

    results.push({
      tenantId: lease.tenantId,
      tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      feeAmount: resolvedFeeAmount,
      status: "applied",
    });
  }

  await logSystemEvent({
    action: "LATE_FEES_APPLIED",
    description: `Applied late fees for period ${period}`,
    metadata: { period, count: results.filter((r) => r.status === "applied").length },
  });

  return NextResponse.json({
    period,
    results,
    applied: results.filter((r) => r.status === "applied").length,
    skipped: results.filter((r) => r.status !== "applied").length,
  });
}

async function generateProration(organizationId: string, tenantId: string, moveInDate?: string) {
  if (!moveInDate) {
    return NextResponse.json(
      { error: "moveInDate is required for proration" },
      { status: 400 }
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      unit: { include: { property: true } },
      leases: {
        where: { status: "ACTIVE" },
        take: 1,
      },
    },
  });

  if (!tenant || tenant.unit?.property?.organizationId !== organizationId) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const activeLease = tenant.leases[0];
  if (!activeLease) {
    return NextResponse.json(
      { error: "No active lease found for tenant" },
      { status: 400 }
    );
  }

  const moveIn = new Date(moveInDate);
  const moveInDay = moveIn.getDate();
  const daysInMonth = new Date(moveIn.getFullYear(), moveIn.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - moveInDay + 1;
  const rentAmount = activeLease.rentAmount || 0;

  if (rentAmount <= 0) {
    return NextResponse.json(
      { error: "Lease has no rent amount set" },
      { status: 400 }
    );
  }

  const dailyRate = rentAmount / daysInMonth;
  const proratedAmount = Math.round(dailyRate * remainingDays * 100) / 100;

  const period = formatPeriod(moveIn);

  // Check if proration already exists
  const existingProration = await prisma.ledgerEntry.findFirst({
    where: {
      tenantId,
      type: "RENT",
      period,
      description: { contains: "Prorated" },
    },
  });

  if (existingProration) {
    return NextResponse.json({
      message: "Prorated rent already exists for this period",
      entry: existingProration,
    });
  }

  // Get current balance
  const latestLedger = await prisma.ledgerEntry.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const currentBalance = latestLedger?.balance ?? 0;
  const newBalance = currentBalance + proratedAmount;

  const entry = await prisma.ledgerEntry.create({
    data: {
      tenantId,
      type: "RENT",
      amount: proratedAmount,
      description: `Prorated rent (${remainingDays}/${daysInMonth} days) - ${formatPeriodLabel(period)}`,
      period,
      balance: newBalance,
    },
  });

  await logSystemEvent(
    {
      action: "PRORATED_RENT_GENERATED",
      description: `Prorated rent of $${proratedAmount.toFixed(2)} for ${remainingDays} days`,
      metadata: {
        moveInDate,
        daysInMonth,
        remainingDays,
        dailyRate,
        proratedAmount,
        fullRent: rentAmount,
      },
    },
    { tenantId }
  );

  return NextResponse.json({
    entry,
    calculation: {
      fullRent: rentAmount,
      moveInDay,
      daysInMonth,
      remainingDays,
      dailyRate: Math.round(dailyRate * 100) / 100,
      proratedAmount,
    },
  });
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
