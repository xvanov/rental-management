import { getQueue, createWorker, type Job } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";
import { createEvent } from "@/lib/events";
import {
  type EnforcementAction,
  type EnforcementContext,
  generateLateRentNoticeContent,
  generateViolationNoticeContent,
  generateEvictionWarningContent,
} from "@/lib/enforcement/rules-engine";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RentReminderData {
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  rentAmount: number;
  dueDay: number;
  daysUntilDue: number;
  propertyAddress: string;
  period: string;
}

export interface LateNoticeData {
  tenantId: string;
  leaseId: string;
  propertyId: string;
  context: EnforcementContext;
  period: string;
}

export interface EscalationData {
  tenantId: string;
  leaseId: string;
  propertyId: string;
  context: EnforcementContext;
  period: string;
  originalNoticeId?: string;
}

export interface MaterialBreachData {
  tenantId: string;
  leaseId: string;
  propertyId: string;
  context: EnforcementContext;
  period: string;
}

// ─── Enqueue Jobs ───────────────────────────────────────────────────────────

/**
 * Schedule a rent reminder to be sent via SMS/email.
 */
export async function enqueueRentReminder(data: RentReminderData, delay = 0) {
  const queue = getQueue("enforcement");
  await queue.add("rent-reminder", data, {
    delay,
    jobId: `reminder-${data.tenantId}-${data.period}-${data.daysUntilDue}d`,
  });
}

/**
 * Schedule a late rent notice to be generated and sent.
 */
export async function enqueueLateNotice(data: LateNoticeData, delay = 0) {
  const queue = getQueue("enforcement");
  await queue.add("late-notice", data, {
    delay,
    jobId: `late-${data.tenantId}-${data.period}`,
  });
}

/**
 * Schedule an escalation action (lease violation or eviction warning).
 */
export async function enqueueEscalation(data: EscalationData, delay = 0) {
  const queue = getQueue("enforcement");
  await queue.add("escalation", data, {
    delay,
    jobId: `escalation-${data.tenantId}-${data.period}`,
  });
}

/**
 * Schedule a material breach / eviction warning action.
 */
export async function enqueueMaterialBreach(data: MaterialBreachData, delay = 0) {
  const queue = getQueue("enforcement");
  await queue.add("material-breach", data, {
    delay,
    jobId: `breach-${data.tenantId}-${data.period}`,
  });
}

/**
 * Process enforcement actions from the rules engine.
 */
export async function processEnforcementActions(actions: EnforcementAction[]) {
  for (const action of actions) {
    switch (action.type) {
      case "RENT_REMINDER":
        await enqueueRentReminder({
          tenantId: action.tenantId,
          propertyId: action.propertyId,
          tenantName: action.context.tenantName,
          tenantPhone: action.context.tenantPhone,
          tenantEmail: action.context.tenantEmail,
          rentAmount: action.context.rentAmount,
          dueDay: action.context.dueDay,
          daysUntilDue: action.context.dueDay - new Date().getDate(),
          propertyAddress: action.context.propertyAddress,
          period: action.period,
        });
        break;
      case "LATE_NOTICE":
      case "LATE_FEE":
        await enqueueLateNotice({
          tenantId: action.tenantId,
          leaseId: action.leaseId,
          propertyId: action.propertyId,
          context: action.context,
          period: action.period,
        });
        break;
      case "ESCALATION":
      case "VIOLATION_NOTICE":
        await enqueueEscalation({
          tenantId: action.tenantId,
          leaseId: action.leaseId,
          propertyId: action.propertyId,
          context: action.context,
          period: action.period,
        });
        break;
      case "MATERIAL_BREACH":
        await enqueueMaterialBreach({
          tenantId: action.tenantId,
          leaseId: action.leaseId,
          propertyId: action.propertyId,
          context: action.context,
          period: action.period,
        });
        break;
    }
  }
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let workerStarted = false;

export function startEnforcementWorker() {
  if (workerStarted) return;
  workerStarted = true;

  createWorker<RentReminderData | LateNoticeData | EscalationData | MaterialBreachData>(
    "enforcement",
    async (job: Job<RentReminderData | LateNoticeData | EscalationData | MaterialBreachData>) => {
      switch (job.name) {
        case "rent-reminder":
          await handleRentReminder(job.data as RentReminderData);
          break;
        case "late-notice":
          await handleLateNotice(job.data as LateNoticeData);
          break;
        case "escalation":
          await handleEscalation(job.data as EscalationData);
          break;
        case "material-breach":
          await handleMaterialBreach(job.data as MaterialBreachData);
          break;
      }
    }
  );
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleRentReminder(data: RentReminderData) {
  const { tenantId, propertyId, tenantName, tenantPhone, tenantEmail, rentAmount, dueDay, daysUntilDue, propertyAddress, period } = data;

  const message = `Hi ${tenantName}, this is a reminder that your rent of $${rentAmount.toFixed(2)} for ${propertyAddress} is due in ${daysUntilDue} day(s) on the ${dueDay}${getOrdinal(dueDay)}. Please ensure timely payment to avoid late fees.`;

  // Send via SMS if phone available
  if (tenantPhone) {
    try {
      await sendSms({ to: tenantPhone, body: message, tenantId, propertyId });
      console.log(`[Enforcement] Sent rent reminder SMS to ${tenantName}`);
    } catch (error) {
      console.error(`[Enforcement] Failed to send reminder SMS:`, error);
    }
  }

  // Send via Email if available
  if (tenantEmail) {
    try {
      await sendEmail({
        to: tenantEmail,
        subject: `Rent Reminder - Due ${dueDay}${getOrdinal(dueDay)}`,
        text: message,
        tenantId,
        propertyId,
      });
      console.log(`[Enforcement] Sent rent reminder email to ${tenantName}`);
    } catch (error) {
      console.error(`[Enforcement] Failed to send reminder email:`, error);
    }
  }

  // Log system event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "RENT_REMINDER",
      description: `Rent reminder sent: $${rentAmount.toFixed(2)} due in ${daysUntilDue} day(s)`,
      metadata: { period, dueDay, rentAmount },
    },
    tenantId,
    propertyId,
  });
}

async function handleLateNotice(data: LateNoticeData) {
  const { tenantId, leaseId, propertyId, context, period } = data;

  // Generate late rent notice content
  const content = generateLateRentNoticeContent(context, period);

  // Create the notice record
  const notice = await prisma.notice.create({
    data: {
      tenantId,
      type: "LATE_RENT",
      status: "DRAFT",
      content,
    },
  });

  // Send via SMS
  if (context.tenantPhone) {
    try {
      const smsMessage = `NOTICE: Your rent of $${context.rentAmount.toFixed(2)} is past due. A late fee of $${context.lateFeeAmount.toFixed(2)} has been applied. Total owed: $${(context.rentAmount + context.lateFeeAmount).toFixed(2)}. Please pay immediately to avoid further action. Full notice sent to your email.`;
      await sendSms({ to: context.tenantPhone, body: smsMessage, tenantId, propertyId });
    } catch (error) {
      console.error(`[Enforcement] Failed to send late notice SMS:`, error);
    }
  }

  // Send via Email with full notice
  if (context.tenantEmail) {
    try {
      await sendEmail({
        to: context.tenantEmail,
        subject: "Notice of Late Rent Payment",
        text: content,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error(`[Enforcement] Failed to send late notice email:`, error);
    }
  }

  // Update notice status to SENT
  await prisma.notice.update({
    where: { id: notice.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Apply late fee to ledger
  const latestEntry = await prisma.ledgerEntry.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  const currentBalance = latestEntry?.balance ?? 0;

  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      type: "LATE_FEE",
      amount: context.lateFeeAmount,
      description: `Late fee for ${period}`,
      period,
      balance: currentBalance + context.lateFeeAmount,
    },
  });

  // Log events
  await createEvent({
    type: "NOTICE",
    payload: {
      noticeId: notice.id,
      noticeType: "LATE_RENT",
      sentVia: context.tenantPhone ? "SMS" : context.tenantEmail ? "EMAIL" : undefined,
      content: `Late rent notice issued for ${period}`,
    },
    tenantId,
    propertyId,
  });

  await createEvent({
    type: "VIOLATION",
    payload: {
      violationType: "LATE_RENT",
      description: `Late fee of $${context.lateFeeAmount.toFixed(2)} applied for ${period}`,
      feeAmount: context.lateFeeAmount,
      deadline: undefined,
      resolved: false,
    },
    tenantId,
    propertyId,
  });

  // Schedule escalation check in 10 days
  await enqueueEscalation(
    { tenantId, leaseId, propertyId, context, period, originalNoticeId: notice.id },
    10 * 24 * 60 * 60 * 1000 // 10 days
  );

  console.log(`[Enforcement] Late notice created and sent for tenant ${context.tenantName}, period ${period}`);
}

async function handleEscalation(data: EscalationData) {
  const { tenantId, propertyId, context, period } = data;

  // Check if rent was paid since the notice
  const payments = await prisma.ledgerEntry.findMany({
    where: { tenantId, period, type: "PAYMENT" },
  });
  const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  if (totalPaid >= context.rentAmount) {
    console.log(`[Enforcement] Rent paid for ${context.tenantName}, skipping escalation`);
    return;
  }

  // Calculate total owed
  const entries = await prisma.ledgerEntry.findMany({
    where: { tenantId, period },
  });
  const totalOwed = entries.reduce((sum, e) => sum + e.amount, 0);

  // Generate violation notice content
  const content = generateViolationNoticeContent(context, period, Math.abs(totalOwed));

  // Create violation notice
  const notice = await prisma.notice.create({
    data: {
      tenantId,
      type: "LEASE_VIOLATION",
      status: "DRAFT",
      content,
    },
  });

  // Send via SMS
  if (context.tenantPhone) {
    try {
      const smsMessage = `FORMAL NOTICE: You are in violation of your lease due to non-payment. Outstanding balance: $${Math.abs(totalOwed).toFixed(2)}. Contact property management within 5 business days to arrange payment. Full notice sent to your email.`;
      await sendSms({ to: context.tenantPhone, body: smsMessage, tenantId, propertyId });
    } catch (error) {
      console.error(`[Enforcement] Failed to send violation SMS:`, error);
    }
  }

  // Send via Email
  if (context.tenantEmail) {
    try {
      await sendEmail({
        to: context.tenantEmail,
        subject: "Notice of Lease Violation - Non-Payment",
        text: content,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error(`[Enforcement] Failed to send violation email:`, error);
    }
  }

  // Update notice status
  await prisma.notice.update({
    where: { id: notice.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Log events
  await createEvent({
    type: "NOTICE",
    payload: {
      noticeId: notice.id,
      noticeType: "LEASE_VIOLATION",
      sentVia: context.tenantPhone ? "SMS" : context.tenantEmail ? "EMAIL" : undefined,
      content: `Lease violation notice issued for non-payment (${period})`,
    },
    tenantId,
    propertyId,
  });

  await createEvent({
    type: "VIOLATION",
    payload: {
      violationType: "LEASE_VIOLATION",
      description: `Lease violation: unpaid balance of $${Math.abs(totalOwed).toFixed(2)} for ${period}`,
      feeAmount: undefined,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
    },
    tenantId,
    propertyId,
  });

  console.log(`[Enforcement] Escalation: Violation notice created for tenant ${context.tenantName}, period ${period}`);
}

async function handleMaterialBreach(data: MaterialBreachData) {
  const { tenantId, propertyId, context, period } = data;

  // Double-check rent is still unpaid
  const payments = await prisma.ledgerEntry.findMany({
    where: { tenantId, period, type: "PAYMENT" },
  });
  const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  if (totalPaid >= context.rentAmount) {
    console.log(`[Enforcement] Rent paid for ${context.tenantName}, skipping material breach`);
    return;
  }

  // Generate eviction warning content
  const content = generateEvictionWarningContent(context, period);

  // Create EVICTION_WARNING notice
  const notice = await prisma.notice.create({
    data: {
      tenantId,
      type: "EVICTION_WARNING",
      status: "DRAFT",
      content,
    },
  });

  // Send via SMS
  if (context.tenantPhone) {
    try {
      const smsMessage = `URGENT NOTICE: You are in material breach of your lease due to non-payment of $${context.rentAmount.toFixed(2)}. An eviction warning has been issued. You have 10 days to pay in full. Full notice sent to your email.`;
      await sendSms({ to: context.tenantPhone, body: smsMessage, tenantId, propertyId });
    } catch (error) {
      console.error(`[Enforcement] Failed to send material breach SMS:`, error);
    }
  }

  // Send via Email
  if (context.tenantEmail) {
    try {
      await sendEmail({
        to: context.tenantEmail,
        subject: "URGENT: Notice of Material Breach and Eviction Warning",
        text: content,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error(`[Enforcement] Failed to send material breach email:`, error);
    }
  }

  // Update notice status to SENT
  await prisma.notice.update({
    where: { id: notice.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Log events
  await createEvent({
    type: "NOTICE",
    payload: {
      noticeId: notice.id,
      noticeType: "EVICTION_WARNING",
      sentVia: context.tenantPhone ? "SMS" : context.tenantEmail ? "EMAIL" : undefined,
      content: `Eviction warning issued for material breach (${period})`,
    },
    tenantId,
    propertyId,
  });

  await createEvent({
    type: "VIOLATION",
    payload: {
      violationType: "MATERIAL_BREACH",
      description: `Material breach: eviction warning issued for unpaid rent of $${context.rentAmount.toFixed(2)} for ${period}`,
      deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      resolved: false,
    },
    tenantId,
    propertyId,
  });

  console.log(`[Enforcement] Material breach: Eviction warning issued for ${context.tenantName}, period ${period}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
