import { NextRequest, NextResponse } from "next/server";
import { evaluateEnforcementRules } from "@/lib/enforcement/rules-engine";
import { processEnforcementActions, startEnforcementWorker } from "@/lib/jobs/enforcement";
import { createEvent } from "@/lib/events";

/**
 * GET /api/cron/enforcement - Daily enforcement check cron endpoint.
 * Called by Railway cron or external scheduler daily.
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

    // Start the enforcement worker
    startEnforcementWorker();

    // Evaluate rules
    const actions = await evaluateEnforcementRules();

    // Process actions
    if (actions.length > 0) {
      await processEnforcementActions(actions);
    }

    // Log the cron run
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "ENFORCEMENT_CRON",
        description: `Daily enforcement check: ${actions.length} action(s)`,
        metadata: {
          timestamp: new Date().toISOString(),
          actionsCount: actions.length,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      actionsProcessed: actions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Enforcement cron failed:", error);
    return NextResponse.json(
      { error: "Enforcement cron failed" },
      { status: 500 }
    );
  }
}
