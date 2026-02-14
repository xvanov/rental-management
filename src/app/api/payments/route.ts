import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logPaymentEvent } from "@/lib/events";
import { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth-context";
import { resolveNoticesIfPaid } from "@/lib/enforcement/resolve-notices";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const method = searchParams.get("method");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.PaymentWhereInput = {
      tenant: { unit: { property: { organizationId: ctx.organizationId } } },
    };

    if (status) {
      where.status = status as Prisma.EnumPaymentStatusFilter["equals"];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (propertyId) {
      where.tenant = {
        ...where.tenant as Prisma.TenantWhereInput,
        unitId: { not: null },
        unit: { propertyId, property: { organizationId: ctx.organizationId } },
      };
    }

    if (method) {
      where.method = method as Prisma.EnumPaymentMethodFilter["equals"];
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [payments, total, pendingCount] = await Promise.all([
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
      prisma.payment.count({
        where: {
          status: "PENDING",
          tenant: { unit: { property: { organizationId: ctx.organizationId } } },
        },
      }),
    ]);

    return NextResponse.json({ payments, total, pendingCount });
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
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

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

    // Verify tenant exists and belongs to the user's organization
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
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

    // Auto-resolve outstanding notices if rent+fees are now fully paid
    const period = formatPeriod(new Date(date));
    await resolveNoticesIfPaid(tenantId, period);

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
