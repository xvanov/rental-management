/**
 * Dynamic utility bill split calculator.
 *
 * Calculates tenant shares based on:
 * 1. Occupant count - tenant with 2 people pays 2x share
 * 2. Pro-rated first month - based on move-in date
 * 3. Move-out handling - only charges for occupied period
 */

import { prisma } from "@/lib/db";

export interface TenantUtilityShare {
  tenantId: string;
  tenantName: string;
  unitName: string;
  occupantCount: number;
  moveInDate: Date | null;
  moveOutDate: Date | null;
  sharePercentage: number; // Their share as a percentage (e.g., 0.25 = 25%)
  proRatedFactor: number; // 1.0 = full month, 0.5 = half month
  calculatedAmount: number; // Final amount they owe
  bills: Array<{
    billId: string;
    provider: string;
    type: string;
    totalAmount: number;
    tenantShare: number;
  }>;
}

export interface PropertyUtilitySummary {
  propertyId: string;
  propertyAddress: string;
  period: string;
  totalBillAmount: number;
  totalOccupants: number;
  tenantShares: TenantUtilityShare[];
  bills: Array<{
    id: string;
    provider: string;
    type: string;
    amount: number;
    billingStart: Date;
    billingEnd: Date;
  }>;
}

/**
 * Calculate the number of days a tenant occupied the unit during a billing period.
 */
function calculateOccupiedDays(
  billingStart: Date,
  billingEnd: Date,
  moveInDate: Date | null,
  moveOutDate: Date | null
): { occupiedDays: number; totalDays: number; factor: number } {
  const totalDays = Math.ceil(
    (billingEnd.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1; // Include both start and end dates

  // Default: tenant occupied entire period
  let effectiveStart = billingStart;
  let effectiveEnd = billingEnd;

  // Adjust for move-in date
  if (moveInDate && moveInDate > billingStart) {
    effectiveStart = moveInDate;
  }

  // Adjust for move-out date
  if (moveOutDate && moveOutDate < billingEnd) {
    effectiveEnd = moveOutDate;
  }

  // If tenant wasn't there during this period at all
  if (effectiveStart > billingEnd || effectiveEnd < billingStart) {
    return { occupiedDays: 0, totalDays, factor: 0 };
  }

  const occupiedDays = Math.ceil(
    (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

  const factor = Math.min(1, Math.max(0, occupiedDays / totalDays));

  return { occupiedDays, totalDays, factor };
}

/**
 * Calculate utility shares for all tenants at a property for a given period.
 */
export async function calculatePropertyUtilityShares(
  propertyId: string,
  period: string // YYYY-MM format
): Promise<PropertyUtilitySummary | null> {
  // Get property with units and active tenants
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      units: {
        where: { status: "OCCUPIED" },
        include: {
          tenants: {
            where: { active: true },
          },
        },
      },
      utilityBills: {
        where: { period },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!property) {
    return null;
  }

  // No bills for this period
  if (property.utilityBills.length === 0) {
    return {
      propertyId: property.id,
      propertyAddress: property.address,
      period,
      totalBillAmount: 0,
      totalOccupants: 0,
      tenantShares: [],
      bills: [],
    };
  }

  // Collect all active tenants across units
  const tenants = property.units.flatMap((unit) =>
    unit.tenants.map((tenant) => ({
      ...tenant,
      unitName: unit.name,
    }))
  );

  if (tenants.length === 0) {
    return {
      propertyId: property.id,
      propertyAddress: property.address,
      period,
      totalBillAmount: property.utilityBills.reduce((sum, b) => sum + b.amount, 0),
      totalOccupants: 0,
      tenantShares: [],
      bills: property.utilityBills.map((b) => ({
        id: b.id,
        provider: b.provider,
        type: b.type,
        amount: b.amount,
        billingStart: b.billingStart,
        billingEnd: b.billingEnd,
      })),
    };
  }

  // Calculate total occupants
  const totalOccupants = tenants.reduce((sum, t) => sum + t.occupantCount, 0);

  // Calculate total bill amount
  const totalBillAmount = property.utilityBills.reduce((sum, b) => sum + b.amount, 0);

  // Calculate shares for each tenant
  const tenantShares: TenantUtilityShare[] = tenants.map((tenant) => {
    // Base share percentage based on occupant count
    const baseSharePercentage = tenant.occupantCount / totalOccupants;

    // Calculate bill-by-bill shares (for pro-rating by move-in/move-out)
    const billShares = property.utilityBills.map((bill) => {
      const { factor } = calculateOccupiedDays(
        bill.billingStart,
        bill.billingEnd,
        tenant.moveInDate,
        tenant.moveOutDate
      );

      const tenantShare = bill.amount * baseSharePercentage * factor;

      return {
        billId: bill.id,
        provider: bill.provider,
        type: bill.type,
        totalAmount: bill.amount,
        tenantShare: Math.round(tenantShare * 100) / 100, // Round to cents
        proRatedFactor: factor,
      };
    });

    // Calculate weighted average pro-rated factor
    const totalShare = billShares.reduce((sum, b) => sum + b.tenantShare, 0);
    const avgProRatedFactor =
      billShares.length > 0
        ? billShares.reduce((sum, b) => sum + b.proRatedFactor, 0) / billShares.length
        : 1;

    return {
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`.trim(),
      unitName: tenant.unitName,
      occupantCount: tenant.occupantCount,
      moveInDate: tenant.moveInDate,
      moveOutDate: tenant.moveOutDate,
      sharePercentage: baseSharePercentage,
      proRatedFactor: avgProRatedFactor,
      calculatedAmount: Math.round(totalShare * 100) / 100,
      bills: billShares,
    };
  });

  return {
    propertyId: property.id,
    propertyAddress: property.address,
    period,
    totalBillAmount,
    totalOccupants,
    tenantShares,
    bills: property.utilityBills.map((b) => ({
      id: b.id,
      provider: b.provider,
      type: b.type,
      amount: b.amount,
      billingStart: b.billingStart,
      billingEnd: b.billingEnd,
    })),
  };
}

/**
 * Calculate utility shares for all properties for a given period.
 */
export async function calculateAllPropertyUtilityShares(
  period: string
): Promise<PropertyUtilitySummary[]> {
  // Get all properties with bills for this period
  const properties = await prisma.property.findMany({
    where: {
      utilityBills: {
        some: { period },
      },
    },
    select: { id: true },
  });

  const summaries: PropertyUtilitySummary[] = [];

  for (const property of properties) {
    const summary = await calculatePropertyUtilityShares(property.id, period);
    if (summary && summary.tenantShares.length > 0) {
      summaries.push(summary);
    }
  }

  return summaries;
}

/**
 * Get a tenant's utility charges across all periods.
 */
export async function getTenantUtilityHistory(
  tenantId: string,
  months: number = 6
): Promise<Array<{ period: string; amount: number; details: TenantUtilityShare | null }>> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { unit: true },
  });

  if (!tenant || !tenant.unit) {
    return [];
  }

  // Get recent periods
  const periods: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }

  const history: Array<{ period: string; amount: number; details: TenantUtilityShare | null }> = [];

  for (const period of periods) {
    const summary = await calculatePropertyUtilityShares(tenant.unit.propertyId, period);
    const tenantShare = summary?.tenantShares.find((ts) => ts.tenantId === tenantId);

    history.push({
      period,
      amount: tenantShare?.calculatedAmount || 0,
      details: tenantShare || null,
    });
  }

  return history;
}
