import { getQueue, createWorker } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MoveOutInitData {
  tenantId: string;
  propertyId: string;
  unitId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  propertyAddress: string;
  unitName: string;
  moveOutDate: string;
  noticeDate: string;
}

export interface DepositDispositionData {
  tenantId: string;
  propertyId: string;
  unitId: string;
  tenantName: string;
  tenantEmail: string | null;
  propertyAddress: string;
  depositAmount: number;
  deductions: Array<{ description: string; amount: number }>;
  refundAmount: number;
  noticeId: string;
}

export interface GroupChatRemoveData {
  tenantId: string;
  propertyId: string;
  tenantName: string;
}

// ─── NC State Deposit Rules ─────────────────────────────────────────────────

/** North Carolina requires deposit return within 30 days of move-out */
export const NC_DEPOSIT_RETURN_DAYS = 30;

/** Get deposit return deadline based on jurisdiction */
export function getDepositReturnDeadline(moveOutDate: string, jurisdiction: string): Date {
  const date = new Date(moveOutDate);
  // NC law: 30 days to return deposit
  if (jurisdiction.toLowerCase().includes("durham") || jurisdiction.toLowerCase().includes("nc")) {
    date.setDate(date.getDate() + NC_DEPOSIT_RETURN_DAYS);
  } else {
    // Default to 30 days
    date.setDate(date.getDate() + 30);
  }
  return date;
}

// ─── Deposit Calculation ────────────────────────────────────────────────────

export interface DeductionItem {
  description: string;
  amount: number;
  category: "cleaning" | "damages" | "unpaid_balance" | "other";
}

/**
 * Calculate deposit deductions for a tenant.
 * Automatically includes unpaid balance and any outstanding fees.
 */
export async function calculateAutoDeductions(tenantId: string): Promise<DeductionItem[]> {
  const deductions: DeductionItem[] = [];

  // Get current balance from most recent ledger entry
  const lastEntry = await prisma.ledgerEntry.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  if (lastEntry && lastEntry.balance > 0) {
    deductions.push({
      description: `Unpaid balance as of ${new Date().toLocaleDateString("en-US")}`,
      amount: lastEntry.balance,
      category: "unpaid_balance",
    });
  }

  // Check for any unresolved cleaning violations (fees applied)
  const cleaningViolations = await prisma.cleaningAssignment.findMany({
    where: {
      tenantId,
      status: "FAILED",
    },
  });

  if (cleaningViolations.length > 0) {
    // Note: cleaning fees should already be in the ledger balance
    // This is informational only - we don't double-charge
  }

  return deductions;
}

/**
 * Get the security deposit amount for a tenant from their ledger entries.
 */
export async function getDepositAmount(tenantId: string): Promise<number> {
  const depositEntries = await prisma.ledgerEntry.findMany({
    where: {
      tenantId,
      type: "DEPOSIT",
    },
  });

  return depositEntries.reduce((sum, entry) => sum + Math.abs(entry.amount), 0);
}

// ─── Generate Disposition Notice Content ────────────────────────────────────

export function generateDispositionNoticeContent(data: {
  tenantName: string;
  propertyAddress: string;
  moveOutDate: string;
  depositAmount: number;
  deductions: Array<{ description: string; amount: number }>;
  refundAmount: number;
  deadline: Date;
}): string {
  const totalDeductions = data.deductions.reduce((sum, d) => sum + d.amount, 0);
  const deductionLines = data.deductions.length > 0
    ? data.deductions.map((d, i) => `  ${i + 1}. ${d.description}: $${d.amount.toFixed(2)}`).join("\n")
    : "  None";

  return `SECURITY DEPOSIT DISPOSITION NOTICE

Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

To: ${data.tenantName}
Property: ${data.propertyAddress}
Move-Out Date: ${new Date(data.moveOutDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Pursuant to North Carolina General Statutes Section 42-52, this notice provides an accounting of your security deposit.

DEPOSIT RECEIVED: $${data.depositAmount.toFixed(2)}

ITEMIZED DEDUCTIONS:
${deductionLines}

TOTAL DEDUCTIONS: $${totalDeductions.toFixed(2)}

${data.refundAmount > 0
    ? `REFUND DUE TO TENANT: $${data.refundAmount.toFixed(2)}\n\nYour refund will be mailed to your forwarding address within the statutory deadline of ${data.deadline.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`
    : data.refundAmount < 0
      ? `AMOUNT OWED BY TENANT: $${Math.abs(data.refundAmount).toFixed(2)}\n\nThe deductions exceed your security deposit. Please remit the outstanding balance.`
      : `No refund is due. The security deposit has been fully applied to the above deductions.`
}

If you dispute any deductions listed above, you may contact us in writing within 30 days of receiving this notice.

This notice is provided in compliance with North Carolina law, which requires landlords to provide a written accounting of the security deposit within ${NC_DEPOSIT_RETURN_DAYS} days of the end of the tenancy.`;
}

// ─── Job Queue Functions ────────────────────────────────────────────────────

const QUEUE_NAME = "move-out-flow";

export async function enqueueMoveOutNotice(data: MoveOutInitData) {
  const queue = getQueue(QUEUE_NAME);
  await queue.add("move-out-notice", data);
}

export async function enqueueDispositionNotice(data: DepositDispositionData) {
  const queue = getQueue(QUEUE_NAME);
  await queue.add("disposition-notice", data);
}

export async function enqueueGroupChatRemove(data: GroupChatRemoveData) {
  const queue = getQueue(QUEUE_NAME);
  await queue.add("group-chat-remove", data, { delay: 5000 });
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let workerStarted = false;

export function startMoveOutFlowWorker() {
  if (workerStarted) return;
  workerStarted = true;

  createWorker(QUEUE_NAME, async (job) => {
    switch (job.name) {
      case "move-out-notice":
        await handleMoveOutNotice(job.data as MoveOutInitData);
        break;
      case "disposition-notice":
        await handleDispositionNotice(job.data as DepositDispositionData);
        break;
      case "group-chat-remove":
        await handleGroupChatRemove(job.data as GroupChatRemoveData);
        break;
      default:
        console.error(`[MoveOutFlow] Unknown job name: ${job.name}`);
    }
  });

  console.log("[MoveOutFlow] Worker started");
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleMoveOutNotice(data: MoveOutInitData) {
  const { tenantId, propertyId, tenantName, tenantPhone, tenantEmail, propertyAddress, unitName, moveOutDate } = data;

  const moveOutDateFormatted = new Date(moveOutDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Send SMS notification if phone available
  if (tenantPhone) {
    try {
      await sendSms({
        to: tenantPhone,
        body: `Hi ${tenantName.split(" ")[0]}, this confirms your move-out date of ${moveOutDateFormatted} from ${unitName} at ${propertyAddress}. Please ensure the unit is cleaned and all personal belongings removed by this date. A move-out inspection will be scheduled.`,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error("[MoveOutFlow] SMS send error:", error);
    }
  }

  // Send email notification if email available
  if (tenantEmail) {
    try {
      await sendEmail({
        to: tenantEmail,
        subject: "Move-Out Confirmation",
        text: `Dear ${tenantName},\n\nThis confirms your scheduled move-out date of ${moveOutDateFormatted} from ${unitName} at ${propertyAddress}.\n\nPlease ensure the following before your move-out date:\n- All personal belongings are removed\n- The unit is cleaned (swept, mopped, wiped down)\n- All keys and access devices are returned\n- Forwarding address is provided for deposit return\n\nA move-out inspection will be conducted on or after your move-out date. Any damages beyond normal wear and tear will be deducted from your security deposit.\n\nPer North Carolina law, you will receive a security deposit disposition notice within 30 days of your move-out date.\n\nPlease contact us if you have any questions.\n\nBest regards,\nProperty Management`,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error("[MoveOutFlow] Email send error:", error);
    }
  }

  // Log the notification event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "MOVE_OUT_NOTICE_SENT",
      description: `Move-out notice sent to ${tenantName} for ${moveOutDateFormatted}`,
      metadata: { moveOutDate, unitName, propertyAddress },
    },
    tenantId,
    propertyId,
  });
}

async function handleDispositionNotice(data: DepositDispositionData) {
  const { tenantId, propertyId, tenantName, tenantEmail, depositAmount, deductions, refundAmount, noticeId } = data;

  // Update notice status to SENT
  await prisma.notice.update({
    where: { id: noticeId },
    data: { status: "SENT", sentAt: new Date() },
  });

  // Send email if available
  if (tenantEmail) {
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const deductionList = deductions.length > 0
      ? deductions.map((d) => `- ${d.description}: $${d.amount.toFixed(2)}`).join("\n")
      : "None";

    try {
      await sendEmail({
        to: tenantEmail,
        subject: "Security Deposit Disposition Notice",
        text: `Dear ${tenantName},\n\nPlease find below your security deposit disposition:\n\nDeposit Amount: $${depositAmount.toFixed(2)}\n\nDeductions:\n${deductionList}\n\nTotal Deductions: $${totalDeductions.toFixed(2)}\n\n${refundAmount > 0 ? `Refund Amount: $${refundAmount.toFixed(2)}` : refundAmount < 0 ? `Amount Owed: $${Math.abs(refundAmount).toFixed(2)}` : "No refund due."}\n\nThis notice is provided in accordance with North Carolina General Statutes Section 42-52.\n\nIf you have questions or wish to dispute any deductions, please contact us in writing within 30 days.\n\nBest regards,\nProperty Management`,
        tenantId,
        propertyId,
      });
    } catch (error) {
      console.error("[MoveOutFlow] Disposition email error:", error);
    }
  }

  // Log the disposition notice event
  await createEvent({
    type: "NOTICE",
    payload: {
      noticeId,
      noticeType: "DEPOSIT_DISPOSITION" as const,
      sentVia: tenantEmail ? "EMAIL" as const : "MAIL" as const,
      content: `Deposit: $${depositAmount.toFixed(2)}, Refund: $${refundAmount.toFixed(2)}`,
    },
    tenantId,
    propertyId,
  });
}

async function handleGroupChatRemove(data: GroupChatRemoveData) {
  const { tenantId, propertyId, tenantName } = data;

  // Send announcement to remaining tenants
  try {
    const { sendGroupSms } = await import("@/lib/integrations/twilio");
    await sendGroupSms({
      propertyId,
      body: `${tenantName} has moved out. Please update your contacts accordingly.`,
    });
  } catch (error) {
    console.error("[MoveOutFlow] Group SMS removal error:", error);
  }

  // Log the group chat removal event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "GROUP_CHAT_REMOVED",
      description: `${tenantName} removed from property group chat`,
      metadata: { tenantId, propertyId },
    },
    tenantId,
    propertyId,
  });
}
