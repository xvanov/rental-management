import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const period = searchParams.get("period");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const where: Prisma.UtilityBillWhereInput = {};

    if (propertyId) where.propertyId = propertyId;
    if (period) where.period = period;
    if (type) where.type = type;

    const [bills, total] = await Promise.all([
      prisma.utilityBill.findMany({
        where,
        include: {
          property: true,
        },
        orderBy: { billingEnd: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.utilityBill.count({ where }),
    ]);

    return NextResponse.json({ bills, total });
  } catch (error) {
    console.error("Failed to fetch utility bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch utility bills" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { propertyId, provider, type, amount, billingStart, billingEnd, period } = body;

    if (!propertyId || !provider || !type || amount === undefined || !billingStart || !billingEnd) {
      return NextResponse.json(
        { error: "propertyId, provider, type, amount, billingStart, and billingEnd are required" },
        { status: 400 }
      );
    }

    if (parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: "Amount must be positive" },
        { status: 400 }
      );
    }

    // Validate property exists
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    // Derive period from billingEnd if not provided
    const billEnd = new Date(billingEnd);
    const derivedPeriod = period || `${billEnd.getFullYear()}-${String(billEnd.getMonth() + 1).padStart(2, "0")}`;

    const bill = await prisma.utilityBill.create({
      data: {
        propertyId,
        provider,
        type,
        amount: parseFloat(amount),
        billingStart: new Date(billingStart),
        billingEnd: billEnd,
        period: derivedPeriod,
      },
      include: {
        property: true,
      },
    });

    return NextResponse.json(bill, { status: 201 });
  } catch (error) {
    console.error("Failed to create utility bill:", error);
    return NextResponse.json(
      { error: "Failed to create utility bill" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await prisma.utilityBill.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete utility bill:", error);
    return NextResponse.json(
      { error: "Failed to delete utility bill" },
      { status: 500 }
    );
  }
}
