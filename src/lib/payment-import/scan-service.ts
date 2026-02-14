/**
 * Shared payment email scanning service.
 * Used by both the scan-email API route and the payment-scan cron route.
 */

import { prisma } from "@/lib/db";
import { logPaymentEvent } from "@/lib/events";
import { scanAllAccounts } from "@/lib/payment-import/imap-client";
import { parsePaymentEmail } from "@/lib/payment-import/email-parsers";
import type { ParsedPayment } from "@/lib/payment-import/types";
import { matchPaymentsToTenants } from "@/lib/payment-import/matching";

export interface ScanResult {
  emailsScanned: number;
  paymentsParsed: number;
  created: number;
  duplicates: number;
  unmatched: number;
}

/**
 * Scan email accounts for payment notifications, parse them,
 * match to tenants, and create payment records.
 */
export async function scanAndCreatePayments(): Promise<ScanResult> {
  // Scan all configured email accounts
  const emails = await scanAllAccounts();

  if (emails.length === 0) {
    return { emailsScanned: 0, paymentsParsed: 0, created: 0, duplicates: 0, unmatched: 0 };
  }

  // Parse each email
  const parsedPayments: ParsedPayment[] = [];
  for (const email of emails) {
    try {
      const result = await parsePaymentEmail(email.from, email.raw);
      if (result) {
        parsedPayments.push(result);
      }
    } catch (error) {
      console.error(`Failed to parse email from ${email.from}:`, error);
    }
  }

  if (parsedPayments.length === 0) {
    return { emailsScanned: emails.length, paymentsParsed: 0, created: 0, duplicates: 0, unmatched: 0 };
  }

  // Match to tenants
  const matchedPayments = await matchPaymentsToTenants(parsedPayments);

  // Create payment records (skip duplicates)
  let created = 0;
  let duplicates = 0;

  for (const payment of matchedPayments) {
    // Check for duplicate by externalId + method
    const existing = await prisma.payment.findUnique({
      where: {
        externalId_method: {
          externalId: payment.externalId,
          method: payment.method,
        },
      },
    });

    if (existing) {
      duplicates++;
      continue;
    }

    if (!payment.tenantId) {
      console.log(
        `Unmatched email payment: ${payment.senderName} - $${payment.amount} via ${payment.method}`
      );
      continue;
    }

    // Get tenant's property for event logging
    const tenant = await prisma.tenant.findUnique({
      where: { id: payment.tenantId },
      include: { unit: true },
    });

    // Create payment with PENDING status
    const newPayment = await prisma.payment.create({
      data: {
        tenantId: payment.tenantId,
        amount: payment.amount,
        method: payment.method,
        date: payment.date,
        note: payment.note,
        externalId: payment.externalId,
        status: "PENDING",
        source: "EMAIL_IMPORT",
      },
    });

    // Get current balance and create ledger entry
    const latestLedger = await prisma.ledgerEntry.findFirst({
      where: { tenantId: payment.tenantId },
      orderBy: { createdAt: "desc" },
    });

    const currentBalance = latestLedger?.balance ?? 0;
    const newBalance = currentBalance - payment.amount;

    await prisma.ledgerEntry.create({
      data: {
        tenantId: payment.tenantId,
        type: "PAYMENT",
        amount: -payment.amount,
        description: `[Pending] Payment via ${payment.method}${payment.note ? `: ${payment.note}` : ""}`,
        period: formatPeriod(payment.date),
        balance: newBalance,
      },
    });

    // Log event
    await logPaymentEvent(
      {
        paymentId: newPayment.id,
        amount: payment.amount,
        method: payment.method,
        date: payment.date.toISOString(),
        note: payment.note || undefined,
      },
      {
        tenantId: payment.tenantId,
        propertyId: tenant?.unit?.propertyId || undefined,
      }
    );

    created++;
  }

  return {
    emailsScanned: emails.length,
    paymentsParsed: parsedPayments.length,
    created,
    duplicates,
    unmatched: matchedPayments.filter((p) => !p.tenantId).length,
  };
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
