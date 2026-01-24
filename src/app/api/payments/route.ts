import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logPaymentEvent } from "@/lib/events";
import { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const method = searchParams.get("method");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.PaymentWhereInput = {};

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (propertyId) {
      where.tenant = { unitId: { not: null }, unit: { propertyId } };
    }

    if (method) {
      where.method = method as Prisma.EnumPaymentMethodFilter["equals"];
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          tenant: {
            include: {
              unit: {
                include: { property: true },
              },
            },
          },
        },
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({ payments, total });
  } catch (error) {
    console.error("Failed to fetch payments:", error);
    return NextResponse.json(
      { error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, amount, method, date, note } = body;

    if (!tenantId || !amount || !method || !date) {
      return NextResponse.json(
        { error: "tenantId, amount, method, and date are required" },
        { status: 400 }
      );
    }

    // Validate amount is positive
    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { unit: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Create the payment
    const payment = await prisma.payment.create({
      data: {
        tenantId,
        amount: parseFloat(amount),
        method,
        date: new Date(date),
        note: note || null,
      },
      include: {
        tenant: {
          include: { unit: { include: { property: true } } },
        },
      },
    });

    // Get the current balance from the latest ledger entry
    const latestLedger = await prisma.ledgerEntry.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    const currentBalance = latestLedger?.balance ?? 0;
    const newBalance = currentBalance - parseFloat(amount);

    // Create a PAYMENT ledger entry (reduces balance)
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        type: "PAYMENT",
        amount: -parseFloat(amount),
        description: `Payment via ${method}${note ? `: ${note}` : ""}`,
        period: formatPeriod(new Date(date)),
        balance: newBalance,
      },
    });

    // Log immutable payment event
    await logPaymentEvent(
      {
        paymentId: payment.id,
        amount: parseFloat(amount),
        method,
        date: new Date(date).toISOString(),
        note: note || undefined,
      },
      {
        tenantId,
        propertyId: tenant.unit?.propertyId || undefined,
      }
    );

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error("Failed to create payment:", error);
    return NextResponse.json(
      { error: "Failed to create payment" },
      { status: 500 }
    );
  }
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
