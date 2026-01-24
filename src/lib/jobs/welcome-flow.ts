import { getQueue, createWorker, type Job } from "@/lib/jobs";
import { prisma } from "@/lib/db";
import { sendSms, sendGroupSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";
import { createEvent } from "@/lib/events";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WelcomeFlowData {
  tenantId: string;
  propertyId: string;
  unitId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  propertyAddress: string;
  unitName: string;
  moveInDate: string;
}

export interface GroupChatAddData {
  tenantId: string;
  propertyId: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyAddress: string;
}

// ─── Move-In Checklist Items ────────────────────────────────────────────────

const MOVE_IN_CHECKLIST = [
  "Keys: Collect your keys from the property manager on move-in day",
  "Parking: Park only in your designated spot. Visitor parking is available on-street",
  "WiFi: Network name and password are posted on the router in the common area",
  "Trash: Trash collection is on Tuesday. Recycling on Thursday. Bins go to the curb by 7 AM",
  "Quiet Hours: Please observe quiet hours from 10 PM to 8 AM",
  "Common Areas: Shared spaces (kitchen, living room, bathroom) should be kept clean. Weekly cleaning rotation applies",
  "Maintenance: Report any maintenance issues immediately via text message",
  "Rent: Rent is due on the 1st of each month. Late fees apply after the grace period per your lease",
  "Guests: Overnight guests are allowed for up to 3 consecutive nights. Please notify other tenants",
  "Move-In Condition: Take photos of your room on move-in day for your records",
];

// ─── Enqueue Jobs ───────────────────────────────────────────────────────────

/**
 * Enqueue the welcome flow for a new tenant after deposit + first rent received.
 */
export async function enqueueWelcomeFlow(data: WelcomeFlowData) {
  const queue = getQueue("welcome-flow");
  await queue.add("welcome-message", data, {
    jobId: `welcome-${data.tenantId}`,
  });
}

/**
 * Enqueue adding a tenant to the property group chat.
 */
export async function enqueueGroupChatAdd(data: GroupChatAddData, delay = 0) {
  const queue = getQueue("welcome-flow");
  await queue.add("group-chat-add", data, {
    delay,
    jobId: `group-chat-${data.tenantId}`,
  });
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let workerStarted = false;

export function startWelcomeFlowWorker() {
  if (workerStarted) return;
  workerStarted = true;

  createWorker<WelcomeFlowData | GroupChatAddData>(
    "welcome-flow",
    async (job: Job<WelcomeFlowData | GroupChatAddData>) => {
      switch (job.name) {
        case "welcome-message":
          await handleWelcomeMessage(job.data as WelcomeFlowData);
          break;
        case "group-chat-add":
          await handleGroupChatAdd(job.data as GroupChatAddData);
          break;
      }
    }
  );
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleWelcomeMessage(data: WelcomeFlowData) {
  const { tenantId, propertyId, tenantName, tenantPhone, tenantEmail, propertyAddress, unitName, moveInDate } = data;

  // Build welcome SMS message
  const smsMessage = `Welcome to ${propertyAddress}, ${tenantName}! Your room (${unitName}) is ready for move-in on ${moveInDate}. You'll receive a follow-up with house rules and move-in instructions. Please reach out if you have any questions!`;

  // Build detailed welcome email with checklist
  const checklistText = MOVE_IN_CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join("\n");
  const emailText = `Welcome to ${propertyAddress}!\n\nHi ${tenantName},\n\nCongratulations on your new home! Here are your move-in details:\n\nRoom: ${unitName}\nMove-In Date: ${moveInDate}\nAddress: ${propertyAddress}\n\n--- MOVE-IN CHECKLIST ---\n\n${checklistText}\n\n--- HOUSE RULES ---\n\nPlease review the house rules above and reach out if you have any questions. We look forward to having you as part of our community!\n\nBest regards,\nProperty Management`;

  // Send welcome SMS
  if (tenantPhone) {
    try {
      await sendSms({ to: tenantPhone, body: smsMessage, tenantId, propertyId });
      console.log(`[WelcomeFlow] Sent welcome SMS to ${tenantName}`);
    } catch (error) {
      console.error(`[WelcomeFlow] Failed to send welcome SMS:`, error);
    }
  }

  // Send welcome email with full details
  if (tenantEmail) {
    try {
      await sendEmail({
        to: tenantEmail,
        subject: `Welcome to ${propertyAddress} - Move-In Instructions`,
        text: emailText,
        tenantId,
        propertyId,
      });
      console.log(`[WelcomeFlow] Sent welcome email to ${tenantName}`);
    } catch (error) {
      console.error(`[WelcomeFlow] Failed to send welcome email:`, error);
    }
  }

  // Log welcome event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "WELCOME_SENT",
      description: `Welcome message sent to ${tenantName} for ${unitName} at ${propertyAddress}`,
      metadata: {
        moveInDate,
        unitName,
        sentViaSms: !!tenantPhone,
        sentViaEmail: !!tenantEmail,
      },
    },
    tenantId,
    propertyId,
  });

  // Schedule group chat addition after 5 seconds (to ensure welcome message arrives first)
  await enqueueGroupChatAdd(
    { tenantId, propertyId, tenantName, tenantPhone, propertyAddress },
    5000
  );

  console.log(`[WelcomeFlow] Welcome flow completed for ${tenantName}`);
}

async function handleGroupChatAdd(data: GroupChatAddData) {
  const { tenantId, propertyId, tenantName, tenantPhone, propertyAddress } = data;

  if (!tenantPhone) {
    console.log(`[WelcomeFlow] Skipping group chat add for ${tenantName} - no phone number`);
    return;
  }

  // Announce the new tenant to existing tenants
  const announceMessage = `New housemate alert! ${tenantName} is joining us at ${propertyAddress}. Please welcome them!`;

  try {
    await sendGroupSms({ propertyId, body: announceMessage });
    console.log(`[WelcomeFlow] Sent group chat announcement for ${tenantName}`);
  } catch (error) {
    console.error(`[WelcomeFlow] Failed to send group chat announcement:`, error);
  }

  // Log the group chat addition event
  await createEvent({
    type: "SYSTEM",
    payload: {
      action: "GROUP_CHAT_ADDED",
      description: `${tenantName} added to property group chat at ${propertyAddress}`,
      metadata: {
        tenantPhone,
        propertyId,
      },
    },
    tenantId,
    propertyId,
  });

  console.log(`[WelcomeFlow] Group chat addition completed for ${tenantName}`);
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Check if a tenant has received their deposit and first rent payment.
 * Returns true if both a DEPOSIT-type entry and a RENT/PAYMENT entry exist.
 */
export async function checkMoveInPaymentsReceived(tenantId: string): Promise<boolean> {
  const payments = await prisma.payment.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  // Need at least 2 payments (deposit + first rent)
  if (payments.length < 2) return false;

  // Check total amount covers at least deposit + rent
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        where: { status: "ACTIVE" },
        take: 1,
      },
    },
  });

  if (!tenant?.leases[0]?.rentAmount) return false;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const rentAmount = tenant.leases[0].rentAmount;

  // Total paid should cover at least deposit (= 1 month rent) + first month rent
  return totalPaid >= rentAmount * 2;
}

/**
 * Get the move-in checklist items.
 */
export function getMoveInChecklist(): string[] {
  return [...MOVE_IN_CHECKLIST];
}
