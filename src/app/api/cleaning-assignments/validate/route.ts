import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logCleaningEvent } from "@/lib/events";
import { applyCleaningFee, getCleaningFeeAmount } from "@/lib/cleaning/schedule";
import { getAuthContext } from "@/lib/auth-context";

/**
 * POST - Validate or fail a submitted cleaning assignment.
 * For PM use: approve a submission or reject with fee application.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { assignmentId, action, notes } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
    }

    if (!action || !["validate", "fail"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'validate' or 'fail'" },
        { status: 400 }
      );
    }

    // Verify assignment belongs to org
    const assignment = await prisma.cleaningAssignment.findFirst({
      where: { id: assignmentId, unit: { property: { organizationId: ctx.organizationId } } },
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (assignment.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Can only validate/fail submitted assignments. Current status: ${assignment.status}` },
        { status: 400 }
      );
    }

    if (action === "validate") {
      await prisma.cleaningAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "VALIDATED",
          validatedAt: new Date(),
          notes: notes || "Approved by property manager",
        },
      });

      await logCleaningEvent(
        {
          assignmentId,
          action: "VALIDATED",
          photoCount: Array.isArray(assignment.photos) ? (assignment.photos as unknown[]).length : 0,
        },
        {
          tenantId: assignment.tenantId,
          propertyId: assignment.unit.propertyId,
        }
      );

      return NextResponse.json({ success: true, status: "VALIDATED" });
    }

    // Action is "fail" - mark as failed and apply fee
    const feeAmount = getCleaningFeeAmount();

    await prisma.cleaningAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "FAILED",
        notes: notes || "Failed validation - professional cleaning scheduled",
      },
    });

    // Apply cleaning fee to tenant's ledger
    const feeResult = await applyCleaningFee(
      assignment.tenantId,
      assignmentId,
      feeAmount,
      `Professional cleaning fee - cleaning submission failed validation`
    );

    return NextResponse.json({
      success: true,
      status: "FAILED",
      feeApplied: feeResult.feeAmount,
      newBalance: feeResult.newBalance,
    });
  } catch (error) {
    console.error("Error validating cleaning assignment:", error);
    return NextResponse.json(
      { error: "Failed to validate cleaning assignment" },
      { status: 500 }
    );
  }
}
