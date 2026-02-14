import { NextResponse } from "next/server";
import { evaluateEnforcementRules } from "@/lib/enforcement/rules-engine";
import { processEnforcementActions, startEnforcementWorker } from "@/lib/jobs/enforcement";
import { createEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

/**
 * POST /api/enforcement/run - Evaluate enforcement rules and process actions.
 * Can be called manually from dashboard or from cron job.
 */
export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    // Start the worker if not already running
    startEnforcementWorker();

    // Evaluate active leases against enforcement rules, scoped to org
    const actions = await evaluateEnforcementRules({ organizationId: ctx.organizationId });

    if (actions.length === 0) {
      return NextResponse.json({
        message: "No enforcement actions needed",
        actionsProcessed: 0,
      });
    }

    // Process all actions (enqueue jobs)
    await processEnforcementActions(actions);

    // Log the enforcement run
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "ENFORCEMENT_RUN",
        description: `Enforcement check: ${actions.length} action(s) identified`,
        metadata: {
          actions: actions.map((a) => ({
            type: a.type,
            tenantId: a.tenantId,
            description: a.description,
          })),
        },
      },
    });

    return NextResponse.json({
      message: `Enforcement check complete: ${actions.length} action(s) processed`,
      actionsProcessed: actions.length,
      actions: actions.map((a) => ({
        type: a.type,
        tenantId: a.tenantId,
        description: a.description,
        period: a.period,
      })),
    });
  } catch (error) {
    console.error("Failed to run enforcement:", error);
    return NextResponse.json(
      { error: "Failed to run enforcement check" },
      { status: 500 }
    );
  }
}
