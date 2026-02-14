import { NextRequest, NextResponse } from "next/server";
import { scanAndCreatePayments } from "@/lib/payment-import/scan-service";
import { logSystemEvent } from "@/lib/events";

/**
 * GET /api/cron/payment-scan - Scheduled payment email scanning.
 * Called by Railway cron or external scheduler.
 * Validates CRON_SECRET header in production for security.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate cron secret in production
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await scanAndCreatePayments();

    // Log system event
    await logSystemEvent({
      action: "PAYMENT_SCAN_CRON",
      description: `Payment scan: scanned ${result.emailsScanned} emails, created ${result.created} payments`,
      metadata: {
        timestamp: new Date().toISOString(),
        ...result,
      },
    });

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Payment scan cron failed:", error);
    return NextResponse.json(
      { error: "Payment scan cron failed" },
      { status: 500 }
    );
  }
}
