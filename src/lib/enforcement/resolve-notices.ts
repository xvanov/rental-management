/**
 * Auto-resolve outstanding notices when payment fully covers rent+fees for a period.
 */

import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";

/**
 * Check if total payments cover total charges for a tenant's period,
 * and if so, auto-resolve outstanding LATE_RENT and EVICTION_WARNING notices.
 */
export async function resolveNoticesIfPaid(
  tenantId: string,
  period: string
): Promise<{ resolved: number; noticeIds: string[] }> {
  // Get all charges for this period (RENT + LATE_FEE + UTILITY)
  const charges = await prisma.ledgerEntry.findMany({
    where: {
      tenantId,
      period,
      type: { in: ["RENT", "LATE_FEE", "UTILITY"] },
    },
  });

  const totalCharges = charges.reduce((sum, e) => sum + e.amount, 0);
  if (totalCharges <= 0) return { resolved: 0, noticeIds: [] };

  // Get all payments for this period
  const payments = await prisma.ledgerEntry.findMany({
    where: {
      tenantId,
      period,
      type: "PAYMENT",
    },
  });

  const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);

  // Only resolve if fully paid
  if (totalPaid < totalCharges) return { resolved: 0, noticeIds: [] };

  // Find outstanding notices for this period
  const [year, month] = period.split("-").map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);

  const outstandingNotices = await prisma.notice.findMany({
    where: {
      tenantId,
      type: { in: ["LATE_RENT", "EVICTION_WARNING"] },
      status: { in: ["SENT", "SERVED"] },
      createdAt: { gte: periodStart, lte: periodEnd },
    },
  });

  if (outstandingNotices.length === 0) return { resolved: 0, noticeIds: [] };

  const resolvedIds: string[] = [];

  for (const notice of outstandingNotices) {
    await prisma.notice.update({
      where: { id: notice.id },
      data: { status: "ACKNOWLEDGED" },
    });

    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "NOTICE_AUTO_RESOLVED",
        description: `${notice.type} notice auto-resolved: payment received covering rent+fees for ${period}`,
        metadata: { noticeId: notice.id, noticeType: notice.type, period },
      },
      tenantId,
    });

    resolvedIds.push(notice.id);
  }

  console.log(`[Enforcement] Auto-resolved ${resolvedIds.length} notice(s) for tenant ${tenantId}, period ${period}`);

  return { resolved: resolvedIds.length, noticeIds: resolvedIds };
}
