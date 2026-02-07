import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface TenantSplit {
  tenantId: string;
  tenantName: string;
  unitName: string;
  moveInDate: string | null;
  moveOutDate: string | null;
  daysInPeriod: number;
  totalDaysInPeriod: number;
  weight: number;
  share: number;
}

interface BillSplit {
  billId: string;
  provider: string;
  type: string;
  amount: number;
  period: string;
  tenantSplits: TenantSplit[];
}

/**
 * GET /api/utilities/tenant-splits?propertyId=xxx&period=YYYY-MM
 * Calculates weighted splits for utility bills among tenants
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const period = searchParams.get("period");

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    // Default to current period if not specified
    const now = new Date();
    const targetPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Parse period to get start and end dates
    const [year, month] = targetPeriod.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month
    const totalDaysInPeriod = periodEnd.getDate();

    // Get bills for this property and period
    const bills = await prisma.utilityBill.findMany({
      where: {
        propertyId,
        period: targetPeriod,
      },
      include: {
        property: true,
      },
    });

    // Get active tenants for this property
    const tenants = await prisma.tenant.findMany({
      where: {
        unit: {
          propertyId,
        },
        active: true,
      },
      include: {
        unit: true,
      },
    });

    // Calculate weighted splits for each bill
    const billSplits: BillSplit[] = [];
    const tenantTotals: Record<string, { name: string; unit: string; total: number; weight: number }> = {};

    for (const bill of bills) {
      const tenantSplits: TenantSplit[] = [];
      let totalWeight = 0;

      // Calculate weight for each tenant
      for (const tenant of tenants) {
        const moveIn = tenant.moveInDate ? new Date(tenant.moveInDate) : null;
        const moveOut = tenant.moveOutDate ? new Date(tenant.moveOutDate) : null;

        // Calculate days in period
        let startDate = periodStart;
        let endDate = periodEnd;

        // If moved in during period, start from move-in date
        if (moveIn && moveIn > periodStart) {
          startDate = moveIn;
        }

        // If moved out during period, end at move-out date
        if (moveOut && moveOut < periodEnd) {
          endDate = moveOut;
        }

        // If tenant wasn't in property during this period, skip
        if (startDate > periodEnd || (moveOut && moveOut < periodStart)) {
          continue;
        }

        // Calculate days (inclusive)
        const daysInPeriod = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const weight = daysInPeriod / totalDaysInPeriod;
        totalWeight += weight;

        tenantSplits.push({
          tenantId: tenant.id,
          tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
          unitName: tenant.unit?.name || "N/A",
          moveInDate: tenant.moveInDate?.toISOString().split("T")[0] || null,
          moveOutDate: tenant.moveOutDate?.toISOString().split("T")[0] || null,
          daysInPeriod,
          totalDaysInPeriod,
          weight,
          share: 0, // Will be calculated after
        });
      }

      // Calculate share for each tenant (normalized by total weight)
      for (const split of tenantSplits) {
        split.share = totalWeight > 0 ? (split.weight / totalWeight) * bill.amount : 0;

        // Accumulate tenant totals
        if (!tenantTotals[split.tenantId]) {
          tenantTotals[split.tenantId] = {
            name: split.tenantName,
            unit: split.unitName,
            total: 0,
            weight: split.weight,
          };
        }
        tenantTotals[split.tenantId].total += split.share;
      }

      billSplits.push({
        billId: bill.id,
        provider: bill.provider,
        type: bill.type,
        amount: bill.amount,
        period: bill.period,
        tenantSplits,
      });
    }

    // Convert tenant totals to array
    const tenantSummary = Object.entries(tenantTotals).map(([tenantId, data]) => ({
      tenantId,
      name: data.name,
      unit: data.unit,
      weight: data.weight,
      totalOwed: Math.round(data.total * 100) / 100,
    }));

    // Calculate grand total
    const grandTotal = bills.reduce((sum, bill) => sum + bill.amount, 0);

    return NextResponse.json({
      period: targetPeriod,
      periodStart: periodStart.toISOString().split("T")[0],
      periodEnd: periodEnd.toISOString().split("T")[0],
      totalDaysInPeriod,
      grandTotal,
      billCount: bills.length,
      tenantCount: tenants.length,
      tenantSummary,
      billSplits,
    });
  } catch (error) {
    console.error("Failed to calculate tenant splits:", error);
    return NextResponse.json(
      { error: "Failed to calculate tenant splits" },
      { status: 500 }
    );
  }
}
