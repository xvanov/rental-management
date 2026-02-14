import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import { resolveNoticesIfPaid } from "@/lib/enforcement/resolve-notices";

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json();
    const { paymentId, action } = body;

    if (!paymentId || !action) {
      return NextResponse.json(
        { error: "paymentId and action are required" },
        { status: 400 }
      );
    }

    if (!["confirm", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'confirm' or 'reject'" },
        { status: 400 }
      );
    }

    // Fetch the payment and verify org access
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        status: "PENDING",
        tenant: { unit: { property: { organizationId: ctx.organizationId } } },
      },
      include: {
        tenant: { include: { unit: true } },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Pending payment not found" },
        { status: 404 }
      );
    }

    if (action === "confirm") {
      // Update payment status to CONFIRMED
      const updated = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "CONFIRMED" },
      });

      // Update the ledger entry description to remove [Pending]
      await prisma.ledgerEntry.updateMany({
        where: {
          tenantId: payment.tenantId,
          type: "PAYMENT",
          description: { contains: "[Pending]" },
          amount: -payment.amount,
        },
        data: {
          description: `Payment via ${payment.method}${payment.note ? `: ${payment.note}` : ""}`,
        },
      });

      // Auto-resolve outstanding notices if rent+fees are now fully paid
      const period = formatPeriod(payment.date);
      const resolved = await resolveNoticesIfPaid(payment.tenantId, period);

      return NextResponse.json({ ...updated, noticesResolved: resolved.resolved });
    } else {
      // Reject: update status and reverse ledger entry
      const updated = await prisma.payment.update({
        where: { id: paymentId },
        data: { status: "REJECTED" },
      });

      // Find and reverse the ledger entry
      const ledgerEntry = await prisma.ledgerEntry.findFirst({
        where: {
          tenantId: payment.tenantId,
          type: "PAYMENT",
          description: { contains: "[Pending]" },
          amount: -payment.amount,
        },
        orderBy: { createdAt: "desc" },
      });

      if (ledgerEntry) {
        // Get current balance
        const latestLedger = await prisma.ledgerEntry.findFirst({
          where: { tenantId: payment.tenantId },
          orderBy: { createdAt: "desc" },
        });

        const currentBalance = latestLedger?.balance ?? 0;

        // Create reversal entry
        await prisma.ledgerEntry.create({
          data: {
            tenantId: payment.tenantId,
            type: "CREDIT",
            amount: payment.amount,
            description: `Reversed: rejected ${payment.method} payment`,
            period: formatPeriod(payment.date),
            balance: currentBalance + payment.amount,
          },
        });
      }

      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error("Failed to confirm/reject payment:", error);
    return NextResponse.json(
      { error: "Failed to update payment" },
      { status: 500 }
    );
  }
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
