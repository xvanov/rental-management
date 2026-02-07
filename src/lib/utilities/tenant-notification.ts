/**
 * Utility bill notification service.
 * Sends SMS notifications to tenants with their utility share amounts.
 */

import { sendSms, normalizePhone } from "@/lib/integrations/twilio";
import {
  calculatePropertyUtilityShares,
  type TenantUtilityShare,
} from "./tenant-split-calculator";
import { prisma } from "@/lib/db";

export interface NotificationResult {
  tenantId: string;
  tenantName: string;
  phone: string;
  success: boolean;
  error?: string;
  twilioSid?: string;
  amount: number;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Validate phone number format (basic E.164 validation).
 */
function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // E.164 format: + followed by 10-15 digits
  return /^\+[1-9]\d{9,14}$/.test(normalized);
}

export interface PropertyNotificationSummary {
  propertyId: string;
  propertyAddress: string;
  period: string;
  totalAmount: number;
  notifications: NotificationResult[];
  sent: number;
  failed: number;
}

/**
 * Format currency for display in SMS.
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Format the utility breakdown message for a tenant.
 */
function formatUtilityMessage(
  tenantName: string,
  share: TenantUtilityShare,
  propertyAddress: string,
  period: string
): string {
  const [year, month] = period.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString(
    "en-US",
    { month: "long" }
  );

  let message = `Hi ${tenantName.split(" ")[0]},\n\n`;
  message += `Your utility charges for ${monthName} ${year} at ${propertyAddress}:\n\n`;

  // List each utility type
  const billsByType: Record<string, number> = {};
  for (const bill of share.bills) {
    if (!billsByType[bill.type]) {
      billsByType[bill.type] = 0;
    }
    billsByType[bill.type] += bill.tenantShare;
  }

  for (const [type, amount] of Object.entries(billsByType)) {
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    message += `${typeName}: ${formatCurrency(amount)}\n`;
  }

  message += `\nTotal: ${formatCurrency(share.calculatedAmount)}`;

  if (share.proRatedFactor < 1) {
    message += `\n(Pro-rated: ${Math.round(share.proRatedFactor * 100)}% of month)`;
  }

  return message;
}

export interface SendNotificationOptions {
  dryRun?: boolean;
  skipDuplicateCheck?: boolean;
}

/**
 * Check if a utility notification was already sent for this tenant/period.
 */
async function wasNotificationAlreadySent(
  tenantId: string,
  period: string
): Promise<boolean> {
  const existing = await prisma.message.findFirst({
    where: {
      tenantId,
      channel: "SMS",
      direction: "OUTBOUND",
      content: { contains: `utility charges for` },
      metadata: {
        path: ["period"],
        equals: period,
      },
    },
  });
  return !!existing;
}

/**
 * Send utility notifications to all tenants at a property for a given period.
 */
export async function sendPropertyUtilityNotifications(
  propertyId: string,
  period: string,
  options: SendNotificationOptions = {}
): Promise<PropertyNotificationSummary | null> {
  const { dryRun = false, skipDuplicateCheck = false } = options;

  // Calculate utility shares
  const summary = await calculatePropertyUtilityShares(propertyId, period);

  if (!summary || summary.tenantShares.length === 0) {
    return null;
  }

  // Get all tenant phone numbers in parallel
  const tenantPhones = await prisma.tenant.findMany({
    where: { id: { in: summary.tenantShares.map((s) => s.tenantId) } },
    select: { id: true, phone: true },
  });
  const phoneMap = new Map(tenantPhones.map((t) => [t.id, t.phone]));

  // Process notifications in parallel
  const notificationPromises = summary.tenantShares.map(async (share): Promise<NotificationResult> => {
    const phone = phoneMap.get(share.tenantId);

    // No phone number
    if (!phone) {
      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone: "",
        success: false,
        error: "No phone number on file",
        amount: share.calculatedAmount,
      };
    }

    // Validate phone number (F5)
    if (!isValidPhoneNumber(phone)) {
      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone,
        success: false,
        error: "Invalid phone number format",
        amount: share.calculatedAmount,
      };
    }

    // Skip if amount is zero
    if (share.calculatedAmount <= 0) {
      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone,
        success: true,
        skipped: true,
        skipReason: "Zero amount",
        amount: 0,
      };
    }

    // Check for duplicate (F3)
    if (!skipDuplicateCheck) {
      const alreadySent = await wasNotificationAlreadySent(share.tenantId, period);
      if (alreadySent) {
        return {
          tenantId: share.tenantId,
          tenantName: share.tenantName,
          phone,
          success: true,
          skipped: true,
          skipReason: "Already sent for this period",
          amount: share.calculatedAmount,
        };
      }
    }

    const message = formatUtilityMessage(
      share.tenantName,
      share,
      summary.propertyAddress,
      period
    );

    // Dry run mode (F10)
    if (dryRun) {
      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone,
        success: true,
        skipped: true,
        skipReason: "Dry run - message not sent",
        amount: share.calculatedAmount,
      };
    }

    try {
      const result = await sendSms({
        to: phone,
        body: message,
        tenantId: share.tenantId,
        propertyId: summary.propertyId,
      });

      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone,
        success: true,
        twilioSid: result.twilioSid,
        amount: share.calculatedAmount,
      };
    } catch (error) {
      return {
        tenantId: share.tenantId,
        tenantName: share.tenantName,
        phone,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        amount: share.calculatedAmount,
      };
    }
  });

  const notifications = await Promise.all(notificationPromises);

  // Log notification event (F8)
  if (!dryRun) {
    await prisma.event.create({
      data: {
        type: "SYSTEM",
        propertyId: summary.propertyId,
        payload: {
          action: "utility_notification_sent",
          period,
          sent: notifications.filter((n) => n.success && !n.skipped).length,
          failed: notifications.filter((n) => !n.success).length,
          skipped: notifications.filter((n) => n.skipped).length,
        },
      },
    });
  }

  return {
    propertyId: summary.propertyId,
    propertyAddress: summary.propertyAddress,
    period,
    totalAmount: summary.totalBillAmount,
    notifications,
    sent: notifications.filter((n) => n.success && !n.skipped).length,
    failed: notifications.filter((n) => !n.success).length,
  };
}

/**
 * Send utility notifications to all tenants across all properties for a given period.
 */
export async function sendAllUtilityNotifications(
  period: string,
  options: SendNotificationOptions = {}
): Promise<PropertyNotificationSummary[]> {
  // Get all properties with bills for this period
  const properties = await prisma.property.findMany({
    where: {
      utilityBills: {
        some: { period },
      },
    },
    select: { id: true },
  });

  const results: PropertyNotificationSummary[] = [];

  for (const property of properties) {
    const result = await sendPropertyUtilityNotifications(property.id, period, options);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

/**
 * Send a test notification to a specific phone number.
 * Useful for testing the SMS integration without affecting real tenants.
 */
export async function sendTestUtilityNotification(
  phone: string,
  propertyId?: string,
  period?: string
): Promise<{ success: boolean; error?: string; twilioSid?: string; message?: string }> {
  // Use current period if not specified
  const targetPeriod =
    period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  let message: string;

  if (propertyId) {
    // Try to get real data
    const summary = await calculatePropertyUtilityShares(propertyId, targetPeriod);

    if (summary && summary.tenantShares.length > 0) {
      const share = summary.tenantShares[0];
      message = formatUtilityMessage(
        "Test User",
        share,
        summary.propertyAddress,
        targetPeriod
      );
    } else {
      // Create sample message
      message = createSampleMessage(targetPeriod);
    }
  } else {
    message = createSampleMessage(targetPeriod);
  }

  try {
    const result = await sendSms({
      to: phone,
      body: message,
    });

    return {
      success: true,
      twilioSid: result.twilioSid,
      message,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message,
    };
  }
}

function createSampleMessage(period: string): string {
  const [year, month] = period.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString(
    "en-US",
    { month: "long" }
  );

  return `Hi there,

Your utility charges for ${monthName} ${year}:

Electric: $45.00
Gas: $22.50
Water: $18.75

Total: $86.25

This is a test message from your rental management system.`;
}
