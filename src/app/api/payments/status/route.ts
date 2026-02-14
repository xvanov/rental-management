import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export interface TenantPaymentStatus {
  tenantId: string;
  tenantName: string;
  unitName: string | null;
  propertyAddress: string | null;
  rentAmount: number;
  totalPaid: number;
  remaining: number;
  lateFeeApplied: number;
  status: "paid" | "partial" | "unpaid" | "late" | "not_due";
  activeNotices: Array<{ id: string; type: string; status: string }>;
  materialBreach: boolean;
}

/**
 * GET /api/payments/status?period=YYYY-MM
 * Returns per-tenant payment status for the given period.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const period = searchParams.get("period") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [year, month] = period.split("-").map(Number);

    // Get all active leases with their tenants and clauses
    const activeLeases = await prisma.lease.findMany({
      where: {
        status: "ACTIVE",
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        clauses: true,
      },
    });

    const results: TenantPaymentStatus[] = [];

    for (const lease of activeLeases) {
      if (!lease.tenant || !lease.unit) continue;

      const rentAmount = lease.rentAmount || 0;
      if (rentAmount <= 0) continue;

      // Get due day and grace period from clauses
      let dueDay = 1;
      let gracePeriodDays = 5;
      for (const clause of lease.clauses) {
        const meta = clause.metadata as Record<string, unknown> | null;
        if (!meta) continue;
        if (clause.type === "RENT_DUE_DATE") dueDay = (meta.dueDay as number) ?? 1;
        if (clause.type === "GRACE_PERIOD") gracePeriodDays = (meta.days as number) ?? 5;
      }

      // Get ledger entries for this period
      const ledgerEntries = await prisma.ledgerEntry.findMany({
        where: { tenantId: lease.tenantId, period },
      });

      const totalPaid = ledgerEntries
        .filter((e) => e.type === "PAYMENT")
        .reduce((sum, e) => sum + Math.abs(e.amount), 0);

      const lateFeeApplied = ledgerEntries
        .filter((e) => e.type === "LATE_FEE")
        .reduce((sum, e) => sum + e.amount, 0);

      const totalDue = rentAmount + lateFeeApplied;
      const remaining = Math.max(0, totalDue - totalPaid);

      // Determine status
      const dayOfMonth = now.getDate();
      const deadlineDay = dueDay + gracePeriodDays;
      const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;

      let status: TenantPaymentStatus["status"];
      if (totalPaid >= totalDue) {
        status = "paid";
      } else if (totalPaid > 0) {
        status = "partial";
      } else if (isCurrentMonth && dayOfMonth < dueDay) {
        status = "not_due";
      } else if (isCurrentMonth && dayOfMonth > deadlineDay) {
        status = "late";
      } else if (!isCurrentMonth) {
        // Past month with no payment
        status = totalPaid > 0 ? "partial" : "late";
      } else {
        status = "unpaid";
      }

      // Get active notices for this period
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0, 23, 59, 59);

      const activeNotices = await prisma.notice.findMany({
        where: {
          tenantId: lease.tenantId,
          type: { in: ["LATE_RENT", "EVICTION_WARNING", "LEASE_VIOLATION"] },
          status: { in: ["SENT", "SERVED"] },
          createdAt: { gte: periodStart, lte: periodEnd },
        },
        select: { id: true, type: true, status: true },
      });

      const materialBreach = activeNotices.some((n) => n.type === "EVICTION_WARNING");

      results.push({
        tenantId: lease.tenantId,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        unitName: lease.unit.name,
        propertyAddress: lease.unit.property.address,
        rentAmount,
        totalPaid,
        remaining,
        lateFeeApplied,
        status,
        activeNotices,
        materialBreach,
      });
    }

    // Sort: late/breach first, then unpaid, then partial, then not_due, then paid
    const statusOrder: Record<string, number> = { late: 0, unpaid: 1, partial: 2, not_due: 3, paid: 4 };
    results.sort((a, b) => {
      if (a.materialBreach !== b.materialBreach) return a.materialBreach ? -1 : 1;
      return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    });

    return NextResponse.json({ period, tenants: results });
  } catch (error) {
    console.error("Failed to get payment status:", error);
    return NextResponse.json(
      { error: "Failed to get payment status" },
      { status: 500 }
    );
  }
}
