import { NextRequest, NextResponse } from "next/server";
import {
  calculatePropertyUtilityShares,
  calculateAllPropertyUtilityShares,
} from "@/lib/utilities/tenant-split-calculator";

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
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const period = searchParams.get("period");

    if (!period) {
      // Default to current month
      const now = new Date();
      const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      if (propertyId) {
        const summary = await calculatePropertyUtilityShares(propertyId, defaultPeriod);
        return NextResponse.json({
          period: defaultPeriod,
          properties: summary ? [summary] : [],
        });
      } else {
        const summaries = await calculateAllPropertyUtilityShares(defaultPeriod);
        return NextResponse.json({
          period: defaultPeriod,
          properties: summaries,
        });
      }
    }

    if (propertyId) {
      const summary = await calculatePropertyUtilityShares(propertyId, period);
      return NextResponse.json({
        period,
        properties: summary ? [summary] : [],
      });
    } else {
      const summaries = await calculateAllPropertyUtilityShares(period);
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
