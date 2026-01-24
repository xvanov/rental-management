import { NextRequest, NextResponse } from "next/server";
import { generateWeeklyAssignments, markOverdueAssignments } from "@/lib/cleaning/schedule";
import { enqueueCleaningReminder, enqueueCleaningFee, startCleaningWorker } from "@/lib/jobs/cleaning";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";

/**
 * GET /api/cron/cleaning
 *
 * Automated cleaning schedule management. Should be called daily.
 * - Sunday: Generate new weekly assignments and send reminders
 * - Monday: Check for overdue assignments and apply fees
 * - Other days: Send reminders for pending assignments
 *
 * Validates CRON_SECRET in production.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate cron secret in production
    if (process.env.NODE_ENV === "production") {
      const authHeader = request.headers.get("authorization");
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Start the cleaning worker
    startCleaningWorker();

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const results: Record<string, unknown> = { day: dayOfWeek, timestamp: now.toISOString() };

    if (dayOfWeek === 0) {
      // SUNDAY: Generate new assignments and send reminders
      const created = await generateWeeklyAssignments();
      results.generated = created;
      results.generatedCount = created.length;

      // Schedule reminders for all new assignments
      for (const assignment of created) {
        const fullAssignment = await prisma.cleaningAssignment.findUnique({
          where: { id: assignment.assignmentId },
          include: {
            tenant: true,
            unit: { include: { property: true } },
          },
        });

        if (fullAssignment) {
          await enqueueCleaningReminder({
            assignmentId: fullAssignment.id,
            tenantId: fullAssignment.tenantId,
            propertyId: fullAssignment.unit.propertyId,
            tenantName: `${fullAssignment.tenant.firstName} ${fullAssignment.tenant.lastName}`,
            tenantPhone: fullAssignment.tenant.phone,
            tenantEmail: fullAssignment.tenant.email,
            weekOf: fullAssignment.weekOf.toISOString(),
            token: fullAssignment.token,
          });
        }
      }
    } else if (dayOfWeek === 1) {
      // MONDAY: Mark overdue and apply fees
      const overdue = await markOverdueAssignments();
      results.overdue = overdue;
      results.overdueCount = overdue.length;

      // Apply fees for overdue assignments
      for (const item of overdue) {
        const assignment = await prisma.cleaningAssignment.findUnique({
          where: { id: item.assignmentId },
          include: {
            tenant: true,
            unit: { include: { property: true } },
          },
        });

        if (assignment) {
          await enqueueCleaningFee({
            assignmentId: assignment.id,
            tenantId: assignment.tenantId,
            propertyId: assignment.unit.propertyId,
            tenantName: `${assignment.tenant.firstName} ${assignment.tenant.lastName}`,
            tenantPhone: assignment.tenant.phone,
            tenantEmail: assignment.tenant.email,
          });
        }
      }
    } else {
      // OTHER DAYS: Send reminders for pending assignments this week
      const pendingAssignments = await prisma.cleaningAssignment.findMany({
        where: {
          status: "PENDING",
          weekOf: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()),
          },
        },
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      });

      // Send mid-week reminder on Wednesday or Saturday
      if (dayOfWeek === 3 || dayOfWeek === 6) {
        for (const assignment of pendingAssignments) {
          await enqueueCleaningReminder({
            assignmentId: assignment.id,
            tenantId: assignment.tenantId,
            propertyId: assignment.unit.propertyId,
            tenantName: `${assignment.tenant.firstName} ${assignment.tenant.lastName}`,
            tenantPhone: assignment.tenant.phone,
            tenantEmail: assignment.tenant.email,
            weekOf: assignment.weekOf.toISOString(),
            token: assignment.token,
          });
        }
        results.reminders = pendingAssignments.length;
      }

      results.pending = pendingAssignments.length;
    }

    // Log the cron run
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "CLEANING_CRON",
        description: `Daily cleaning cron executed (day ${dayOfWeek})`,
        metadata: results as Record<string, unknown>,
      },
    });

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error("Error in cleaning cron:", error);
    return NextResponse.json(
      { error: "Failed to run cleaning cron" },
      { status: 500 }
    );
  }
}
