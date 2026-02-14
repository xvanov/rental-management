import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * GET /api/ledger/export
 * Export ledger entries as CSV or JSON (PDF handled client-side).
 * Query params: tenantId, format (csv|json), startDate, endDate
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const format = searchParams.get("format") || "csv";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId is required" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { unit: { include: { property: true } } },
    });

    if (!tenant || tenant.unit?.property?.organizationId !== ctx.organizationId) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    const where: { tenantId: string; createdAt?: { gte?: Date; lte?: Date } } = { tenantId };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const entries = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    if (format === "csv") {
      const csvRows = [
        ["Date", "Period", "Type", "Description", "Amount", "Balance"].join(","),
        ...entries.map((entry) =>
          [
            new Date(entry.createdAt).toLocaleDateString(),
            entry.period || "",
            entry.type,
            `"${(entry.description || "").replace(/"/g, '""')}"`,
            entry.amount.toFixed(2),
            entry.balance.toFixed(2),
          ].join(",")
        ),
      ];

      const csv = csvRows.join("\n");
      const tenantName = `${tenant.firstName}_${tenant.lastName}`.replace(/\s+/g, "_");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="ledger_${tenantName}_${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // JSON format with summary
    const totalCharges = entries
      .filter((e) => e.amount > 0)
      .reduce((sum, e) => sum + e.amount, 0);
    const totalPayments = entries
      .filter((e) => e.amount < 0)
      .reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const currentBalance = entries.length > 0 ? entries[entries.length - 1].balance : 0;

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: `${tenant.firstName} ${tenant.lastName}`,
        unit: tenant.unit?.name,
        property: tenant.unit?.property?.address,
      },
      summary: {
        totalCharges,
        totalPayments,
        currentBalance,
        entryCount: entries.length,
      },
      entries: entries.map((entry) => ({
        date: entry.createdAt,
        period: entry.period,
        type: entry.type,
        description: entry.description,
        amount: entry.amount,
        balance: entry.balance,
      })),
    });
  } catch (error) {
    console.error("Failed to export ledger:", error);
    return NextResponse.json(
      { error: "Failed to export ledger" },
      { status: 500 }
    );
  }
}
