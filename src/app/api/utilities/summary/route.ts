import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const months = parseInt(searchParams.get("months") || "6");

    // Calculate the start period (N months ago)
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const startPeriod = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

    const where: { propertyId?: string; period?: { gte: string } } = {
      period: { gte: startPeriod },
    };
    if (propertyId) where.propertyId = propertyId;

    // Get all bills in the period range
    const bills = await prisma.utilityBill.findMany({
      where,
      include: { property: true },
      orderBy: { period: "asc" },
    });

    // Aggregate by period
    const byPeriod: Record<string, { period: string; total: number; allocated: number; pending: number; bills: typeof bills }> = {};
    for (const bill of bills) {
      if (!byPeriod[bill.period]) {
        byPeriod[bill.period] = { period: bill.period, total: 0, allocated: 0, pending: 0, bills: [] };
      }
      byPeriod[bill.period].total += bill.amount;
      if (bill.allocated) {
        byPeriod[bill.period].allocated += bill.amount;
      } else {
        byPeriod[bill.period].pending += bill.amount;
      }
      byPeriod[bill.period].bills.push(bill);
    }

    // Aggregate by type
    const byType: Record<string, { type: string; total: number; count: number }> = {};
    for (const bill of bills) {
      if (!byType[bill.type]) {
        byType[bill.type] = { type: bill.type, total: 0, count: 0 };
      }
      byType[bill.type].total += bill.amount;
      byType[bill.type].count += 1;
    }

    // Aggregate by property with utility type breakdown
    const byProperty: Record<string, {
      propertyId: string;
      address: string;
      total: number;
      count: number;
      byType: Record<string, number>;
    }> = {};
    for (const bill of bills) {
      if (!byProperty[bill.propertyId]) {
        byProperty[bill.propertyId] = {
          propertyId: bill.propertyId,
          address: bill.property.address,
          total: 0,
          count: 0,
          byType: {},
        };
      }
      byProperty[bill.propertyId].total += bill.amount;
      byProperty[bill.propertyId].count += 1;
      // Track by utility type
      if (!byProperty[bill.propertyId].byType[bill.type]) {
        byProperty[bill.propertyId].byType[bill.type] = 0;
      }
      byProperty[bill.propertyId].byType[bill.type] += bill.amount;
    }

    // Per-tenant utility charges from ledger
    const tenantCharges = await prisma.ledgerEntry.findMany({
      where: {
        type: "UTILITY",
        period: { gte: startPeriod },
        ...(propertyId
          ? { tenant: { unit: { propertyId } } }
          : {}),
      },
      include: {
        tenant: {
          include: { unit: { include: { property: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate tenant charges
    const byTenant: Record<string, { tenantId: string; name: string; unit: string; total: number; count: number }> = {};
    for (const entry of tenantCharges) {
      if (!entry.tenant) continue;
      if (!byTenant[entry.tenantId]) {
        byTenant[entry.tenantId] = {
          tenantId: entry.tenantId,
          name: `${entry.tenant.firstName} ${entry.tenant.lastName}`,
          unit: entry.tenant.unit?.name || "Unassigned",
          total: 0,
          count: 0,
        };
      }
      byTenant[entry.tenantId].total += entry.amount;
      byTenant[entry.tenantId].count += 1;
    }

    const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);
    const allocatedAmount = bills.filter(b => b.allocated).reduce((sum, b) => sum + b.amount, 0);
    const pendingAmount = bills.filter(b => !b.allocated).reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({
      overview: {
        totalBills: bills.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        allocatedAmount: Math.round(allocatedAmount * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        months,
      },
      byPeriod: Object.values(byPeriod).sort((a, b) => b.period.localeCompare(a.period)),
      byType: Object.values(byType).sort((a, b) => b.total - a.total),
      byProperty: Object.values(byProperty),
      byTenant: Object.values(byTenant).sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    console.error("Failed to fetch utility summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch utility summary" },
      { status: 500 }
    );
  }
}
