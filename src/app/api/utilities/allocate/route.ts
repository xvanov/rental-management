import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logSystemEvent } from "@/lib/events";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await req.json();
    const { billId } = body;

    if (!billId) {
      return NextResponse.json(
        { error: "billId is required" },
        { status: 400 }
      );
    }

    // Fetch the utility bill (scoped to org)
    const bill = await prisma.utilityBill.findFirst({
      where: { id: billId, property: { organizationId: ctx.organizationId } },
      include: { property: true },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Utility bill not found" },
        { status: 404 }
      );
    }

    if (bill.allocated) {
      return NextResponse.json(
        { error: "This bill has already been allocated" },
        { status: 400 }
      );
    }

    // Find all active tenants in this property (tenants assigned to units in this property, scoped to org)
    const activeTenants = await prisma.tenant.findMany({
      where: {
        active: true,
        unit: {
          propertyId: bill.propertyId,
          property: { organizationId: ctx.organizationId },
          status: "OCCUPIED",
        },
      },
      include: {
        unit: true,
      },
    });

    if (activeTenants.length === 0) {
      return NextResponse.json(
        { error: "No active tenants found in this property to allocate to" },
        { status: 400 }
      );
    }

    // Equal split allocation
    const splitAmount = Math.round((bill.amount / activeTenants.length) * 100) / 100;

    // Handle rounding: first tenant gets the remainder
    const remainder = Math.round((bill.amount - splitAmount * activeTenants.length) * 100) / 100;

    const results = [];

    for (let i = 0; i < activeTenants.length; i++) {
      const tenant = activeTenants[i];
      const tenantAmount = i === 0 ? splitAmount + remainder : splitAmount;

      // Get current balance for running balance
      const latestLedger = await prisma.ledgerEntry.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: "desc" },
      });

      const currentBalance = latestLedger?.balance ?? 0;
      const newBalance = currentBalance + tenantAmount;

      // Create ledger entry
      const entry = await prisma.ledgerEntry.create({
        data: {
          tenantId: tenant.id,
          type: "UTILITY",
          amount: tenantAmount,
          description: `${bill.provider} ${bill.type} - ${bill.period} (1/${activeTenants.length} split)`,
          period: bill.period,
          balance: newBalance,
        },
      });

      results.push({
        tenantId: tenant.id,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        amount: tenantAmount,
        entryId: entry.id,
      });
    }

    // Mark bill as allocated
    await prisma.utilityBill.update({
      where: { id: billId },
      data: { allocated: true },
    });

    // Log system event
    await logSystemEvent({
      action: "utility_allocated",
      description: `${bill.provider} ${bill.type} bill of $${bill.amount} for ${bill.period} split equally among ${activeTenants.length} tenants`,
      metadata: {
        billId: bill.id,
        propertyId: bill.propertyId,
        totalAmount: bill.amount,
        tenantCount: activeTenants.length,
        perTenantAmount: splitAmount,
      },
    });

    return NextResponse.json({
      success: true,
      bill: {
        id: bill.id,
        provider: bill.provider,
        type: bill.type,
        amount: bill.amount,
        period: bill.period,
      },
      allocation: {
        method: "equal_split",
        tenantCount: activeTenants.length,
        perTenantAmount: splitAmount,
        results,
      },
    });
  } catch (error) {
    console.error("Failed to allocate utility bill:", error);
    return NextResponse.json(
      { error: "Failed to allocate utility bill" },
      { status: 500 }
    );
  }
}
