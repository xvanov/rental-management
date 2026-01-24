import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const period = searchParams.get("period");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.LedgerEntryWhereInput = {};

    if (tenantId) where.tenantId = tenantId;
    if (period) where.period = period;
    if (type) where.type = type as Prisma.EnumLedgerEntryTypeFilter["equals"];

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          tenant: {
            include: {
              unit: { include: { property: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.ledgerEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total });
  } catch (error) {
    console.error("Failed to fetch ledger entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch ledger entries" },
      { status: 500 }
    );
  }
}

// POST - Create a manual ledger entry (for utilities, credits, deductions)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, type, amount, description, period } = body;

    if (!tenantId || !type || amount === undefined) {
      return NextResponse.json(
        { error: "tenantId, type, and amount are required" },
        { status: 400 }
      );
    }

    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Get current balance
    const latestLedger = await prisma.ledgerEntry.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    const currentBalance = latestLedger?.balance ?? 0;
    const newBalance = currentBalance + parseFloat(amount);

    const entry = await prisma.ledgerEntry.create({
      data: {
        tenantId,
        type,
        amount: parseFloat(amount),
        description: description || null,
        period: period || formatPeriod(new Date()),
        balance: newBalance,
      },
      include: {
        tenant: {
          include: { unit: { include: { property: true } } },
        },
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Failed to create ledger entry:", error);
    return NextResponse.json(
      { error: "Failed to create ledger entry" },
      { status: 500 }
    );
  }
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
