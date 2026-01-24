import { getQueue, createWorker, type Job } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";
import {
  markOverdueAssignments,
  applyCleaningFee,
  getCleaningFeeAmount,
} from "@/lib/cleaning/schedule";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CleaningReminderData {
  assignmentId: string;
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  weekOf: string;
  token: string;
}

export interface CleaningOverdueData {
  propertyId?: string;
}

export interface CleaningFeeData {
  assignmentId: string;
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
}

// ─── Enqueue Jobs ───────────────────────────────────────────────────────────

/**
 * Schedule a cleaning reminder SMS for Sunday.
 */
export async function enqueueCleaningReminder(data: CleaningReminderData, delay = 0) {
  const queue = getQueue("cleaning");
  await queue.add("cleaning-reminder", data, {
    delay,
    jobId: `cleaning-reminder-${data.assignmentId}`,
  });
}

/**
 * Schedule an overdue check for Monday.
 */
export async function enqueueOverdueCheck(data: CleaningOverdueData = {}, delay = 0) {
  const queue = getQueue("cleaning");
  await queue.add("cleaning-overdue", data, {
    delay,
    jobId: `cleaning-overdue-${Date.now()}`,
  });
}

/**
 * Schedule a cleaning fee application for an overdue/failed assignment.
 */
export async function enqueueCleaningFee(data: CleaningFeeData, delay = 0) {
  const queue = getQueue("cleaning");
  await queue.add("cleaning-fee", data, {
    delay,
    jobId: `cleaning-fee-${data.assignmentId}`,
  });
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let workerStarted = false;

export function startCleaningWorker() {
  if (workerStarted) return;
  workerStarted = true;

  createWorker<CleaningReminderData | CleaningOverdueData | CleaningFeeData>(
    "cleaning",
    async (job: Job<CleaningReminderData | CleaningOverdueData | CleaningFeeData>) => {
      switch (job.name) {
        case "cleaning-reminder":
          await handleCleaningReminder(job.data as CleaningReminderData);
          break;
        case "cleaning-overdue":
          await handleOverdueCheck();
          break;
        case "cleaning-fee":
          await handleCleaningFee(job.data as CleaningFeeData);
          break;
      }
    }
  );
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleCleaningReminder(data: CleaningReminderData) {
  const { assignmentId, tenantId, propertyId, tenantName, tenantPhone, tenantEmail, token } = data;

  // Verify assignment is still pending
  const assignment = await prisma.cleaningAssignment.findUnique({
    where: { id: assignmentId },
  });

  if (!assignment || assignment.status !== "PENDING") {
    console.log(`[Cleaning] Assignment ${assignmentId} no longer pending, skipping reminder`);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  const submitUrl = `${appUrl}/cleaning/${token}`;

  const message = `Hi ${tenantName}, this is your cleaning reminder! It's your turn to clean the common areas this week. Please complete cleaning and submit at least 5 photos by Sunday midnight. Submit here: ${submitUrl}`;

  // Send via SMS
  if (tenantPhone) {
    try {
      await sendSms({ to: tenantPhone, body: message, tenantId, propertyId });
      console.log(`[Cleaning] Sent reminder SMS to ${tenantName}`);
    } catch (error) {
      console.error(`[Cleaning] Failed to send reminder SMS:`, error);
    }
  }

  // Send via Email
  if (tenantEmail) {
    try {
      await sendEmail({
        to: tenantEmail,
        subject: "Cleaning Reminder - Your Turn This Week",
        text: message,
        tenantId,
        propertyId,
      });
      console.log(`[Cleaning] Sent reminder email to ${tenantName}`);
    } catch (error) {
      console.error(`[Cleaning] Failed to send reminder email:`, error);
    }
  }

  // Log system event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "CLEANING_REMINDER",
      description: `Cleaning reminder sent to ${tenantName}`,
      metadata: { assignmentId, weekOf: data.weekOf },
    },
    tenantId,
    propertyId,
  });
}

async function handleOverdueCheck() {
  console.log(`[Cleaning] Running overdue check...`);

  const overdueResults = await markOverdueAssignments();

  for (const result of overdueResults) {
    // Schedule fee application for each overdue assignment
    const assignment = await prisma.cleaningAssignment.findUnique({
      where: { id: result.assignmentId },
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

  console.log(`[Cleaning] Marked ${overdueResults.length} assignments as overdue`);
}

async function handleCleaningFee(data: CleaningFeeData) {
  const { assignmentId, tenantId, propertyId, tenantName, tenantPhone, tenantEmail } = data;

  const feeAmount = getCleaningFeeAmount();

  // Apply fee to ledger
  await applyCleaningFee(
    tenantId,
    assignmentId,
    feeAmount,
    `Professional cleaning fee - missed cleaning assignment`
  );

  // Notify tenant
  const message = `NOTICE: You missed your cleaning assignment this week. A professional cleaning fee of $${feeAmount.toFixed(2)} has been applied to your ledger. Please ensure you complete your assigned cleaning duties in the future to avoid additional fees.`;

  if (tenantPhone) {
    try {
      await sendSms({ to: tenantPhone, body: message, tenantId, propertyId });
    } catch (error) {
      console.error(`[Cleaning] Failed to send fee notice SMS:`, error);
    }
  }

  if (tenantEmail) {
    try {
      await sendEmail({
        to: tenantEmail,
        subject: "Cleaning Fee Applied",
        text: message,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error(`[Cleaning] Failed to send fee notice email:`, error);
    }
  }

  // Log violation event
  await createEvent({
    type: "VIOLATION",
    payload: {
      violationType: "CLEANING",
      description: `Professional cleaning fee applied: $${feeAmount.toFixed(2)}`,
      feeAmount,
      resolved: false,
    },
    tenantId,
    propertyId,
  });

  console.log(`[Cleaning] Applied $${feeAmount.toFixed(2)} cleaning fee to ${tenantName}`);
}
