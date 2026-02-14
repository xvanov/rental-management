import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { prisma } from "../src/lib/db";
import { logPaymentEvent } from "../src/lib/events";
import {
  parseVenmoHistory,
  parseCashAppHistory,
  parsePayPalHistory,
  parseZelleHistory,
} from "../src/lib/payment-import/parsers";
import {
  matchPaymentsToTenants,
  getMatchReport,
} from "../src/lib/payment-import/matching";
import type { ParsedPayment, MatchedPayment } from "../src/lib/payment-import/types";
import * as path from "path";

const DATA_DIR = path.join(__dirname, "../data/payment-history");

async function parseAllSources(): Promise<ParsedPayment[]> {
  console.log("Parsing payment history from all sources...\n");

  const venmo = await parseVenmoHistory(path.join(DATA_DIR, "venmo_history.txt"));
  console.log(`  Venmo:   ${venmo.length} payments`);

  const cashapp = await parseCashAppHistory(path.join(DATA_DIR, "cashapp_history.csv"));
  console.log(`  CashApp: ${cashapp.length} payments`);

  const paypal = await parsePayPalHistory([
    path.join(DATA_DIR, "paypal-2024.csv"),
    path.join(DATA_DIR, "paypal-2025.csv"),
    path.join(DATA_DIR, "paypal-2026.csv"),
  ]);
  console.log(`  PayPal:  ${paypal.length} payments`);

  const zelle = await parseZelleHistory(path.join(DATA_DIR, "bank-statement.txt"));
  console.log(`  Zelle:   ${zelle.length} payments`);

  const all = [...venmo, ...cashapp, ...paypal, ...zelle];
  console.log(`\n  Total:   ${all.length} payments\n`);

  return all;
}

async function checkDuplicates(payments: MatchedPayment[]): Promise<{
  newPayments: MatchedPayment[];
  duplicateCount: number;
}> {
  let duplicateCount = 0;
  const newPayments: MatchedPayment[] = [];

  for (const payment of payments) {
    const existing = await prisma.payment.findUnique({
      where: {
        externalId_method: {
          externalId: payment.externalId,
          method: payment.method,
        },
      },
    });

    if (existing) {
      duplicateCount++;
    } else {
      newPayments.push(payment);
    }
  }

  return { newPayments, duplicateCount };
}

function formatPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function commitPayments(payments: MatchedPayment[]): Promise<number> {
  let created = 0;

  for (const payment of payments) {
    if (!payment.tenantId) continue;

    try {
      // Create payment record
      const newPayment = await prisma.payment.create({
        data: {
          tenantId: payment.tenantId,
          amount: payment.amount,
          method: payment.method,
          date: payment.date,
          note: payment.note,
          externalId: payment.externalId,
          status: "CONFIRMED",
          source: "HISTORICAL_IMPORT",
        },
      });

      // Create ledger entry
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
          description: `[Import] Payment via ${payment.method}${payment.note ? `: ${payment.note}` : ""}`,
          period: formatPeriod(payment.date),
          balance: newBalance,
        },
      });

      // Get tenant's property for event
      const tenant = await prisma.tenant.findUnique({
        where: { id: payment.tenantId },
        include: { unit: true },
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

      if (created % 50 === 0) {
        console.log(`  ... created ${created} payments so far`);
      }
    } catch (error) {
      console.error(
        `  Failed to create payment: ${payment.senderName} $${payment.amount} (${payment.externalId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return created;
}

async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");
  const showAll = args.includes("--all");

  console.log("=== Payment History Import ===\n");

  // Step 1: Parse all sources
  const parsed = await parseAllSources();

  // Step 2: Match to tenants
  console.log("Matching payments to tenants...");
  const matched = await matchPaymentsToTenants(parsed);
  const report = await getMatchReport(matched);

  console.log(`\n--- Match Report ---`);
  console.log(`  Matched:   ${report.matched}`);
  console.log(`  Unmatched: ${report.unmatched}`);
  console.log(`  By confidence:`);
  for (const [level, count] of Object.entries(report.byConfidence)) {
    console.log(`    ${level}: ${count}`);
  }

  if (report.unmatchedNames.length > 0) {
    console.log(`\n  Unmatched sender names:`);
    for (const name of report.unmatchedNames.sort()) {
      const count = matched.filter(
        (p) => p.senderName === name && p.matchConfidence === "unmatched"
      ).length;
      const total = matched
        .filter((p) => p.senderName === name && p.matchConfidence === "unmatched")
        .reduce((sum, p) => sum + p.amount, 0);
      console.log(`    "${name}" — ${count} payments, $${total.toFixed(2)} total`);
    }
  }

  // Show matched payments by tenant
  if (showAll) {
    console.log(`\n--- All Matched Payments ---`);
    const byTenant = new Map<string, MatchedPayment[]>();
    for (const p of matched) {
      const key = p.tenantName || `[UNMATCHED: ${p.senderName}]`;
      if (!byTenant.has(key)) byTenant.set(key, []);
      byTenant.get(key)!.push(p);
    }

    for (const [tenant, payments] of [...byTenant.entries()].sort()) {
      const total = payments.reduce((sum, p) => sum + p.amount, 0);
      console.log(`\n  ${tenant} (${payments.length} payments, $${total.toFixed(2)} total):`);
      for (const p of payments.sort((a, b) => a.date.getTime() - b.date.getTime())) {
        console.log(
          `    ${p.date.toISOString().split("T")[0]} | $${p.amount.toFixed(2).padStart(10)} | ${p.method.padEnd(7)} | ${p.note || "-"}`
        );
      }
    }
  }

  // Step 3: Check for duplicates
  const matchedWithTenant = matched.filter((p) => p.tenantId);
  console.log(`\nChecking for duplicates among ${matchedWithTenant.length} matched payments...`);
  const { newPayments, duplicateCount } = await checkDuplicates(matchedWithTenant);
  console.log(`  New:        ${newPayments.length}`);
  console.log(`  Duplicates: ${duplicateCount}`);

  if (!shouldCommit) {
    console.log("\n--- DRY RUN ---");
    console.log("No changes were made. Use --commit to import payments.");
    console.log(`Would create ${newPayments.length} payment records.`);
  } else {
    console.log(`\n--- Committing ${newPayments.length} payments ---`);
    const created = await commitPayments(newPayments);
    console.log(`\nDone! Created ${created} payment records.`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Import failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
