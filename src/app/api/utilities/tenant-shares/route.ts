import { NextRequest, NextResponse } from "next/server";
import {
  calculatePropertyUtilityShares,
} from "@/lib/utilities/tenant-split-calculator";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * GET /api/utilities/tenant-shares
 *
 * Get dynamically calculated utility shares for tenants.
 *
 * Query params:
 * - propertyId: Filter to specific property (optional)
 * - period: Billing period in YYYY-MM format (required)
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const orgId = ctx.organizationId;

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const period = searchParams.get("period");

    // Helper: get org-scoped shares for a single property
    async function getPropertyShares(pid: string, p: string) {
      // Verify property belongs to org
      const prop = await prisma.property.findUnique({
        where: { id: pid, organizationId: orgId },
      });
      if (!prop) return null;
      return calculatePropertyUtilityShares(pid, p);
    }

    // Helper: get org-scoped shares for all properties
    async function getAllOrgShares(p: string) {
      const properties = await prisma.property.findMany({
        where: {
          organizationId: orgId,
          utilityBills: { some: { period: p } },
        },
        select: { id: true },
      });
      const summaries = [];
      for (const prop of properties) {
        const summary = await calculatePropertyUtilityShares(prop.id, p);
        if (summary && summary.tenantShares.length > 0) {
          summaries.push(summary);
        }
      }
      return summaries;
    }

    if (!period) {
      // Default to current month
      const now = new Date();
      const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      if (propertyId) {
        const summary = await getPropertyShares(propertyId, defaultPeriod);
        return NextResponse.json({
          period: defaultPeriod,
          properties: summary ? [summary] : [],
        });
      } else {
        const summaries = await getAllOrgShares(defaultPeriod);
        return NextResponse.json({
          period: defaultPeriod,
          properties: summaries,
        });
      }
    }

    if (propertyId) {
      const summary = await getPropertyShares(propertyId, period);
      return NextResponse.json({
        period,
        properties: summary ? [summary] : [],
      });
    } else {
      const summaries = await getAllOrgShares(period);
      return NextResponse.json({
        period,
        properties: summaries,
      });
    }
  } catch (error) {
    console.error("Error calculating tenant shares:", error);
    return NextResponse.json(
      { error: "Failed to calculate tenant shares" },
      { status: 500 }
    );
  }
}
