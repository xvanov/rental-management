import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { prisma } from "../src/lib/db";
import { logSystemEvent } from "../src/lib/events";

const CUTOFF = new Date("2026-01-01T00:00:00Z");
const CUTOFF_PERIOD = "2026-01";

async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");

  console.log("=== Pre-2026 Financial Data Cleanup ===\n");

  // Count pre-2026 records
  const paymentsCount = await prisma.payment.count({
    where: { date: { lt: CUTOFF } },
  });

  const ledgerEntriesCount = await prisma.ledgerEntry.count({
    where: { period: { lt: CUTOFF_PERIOD } },
  });

  const eventsCount = await prisma.event.count({
    where: { type: "PAYMENT", createdAt: { lt: CUTOFF } },
  });

  console.log("Records found:");
  console.log(`  Payments:       ${paymentsCount}`);
  console.log(`  Ledger entries: ${ledgerEntriesCount}`);
  console.log(`  Payment events: ${eventsCount}`);

  if (!shouldCommit) {
    console.log("\n--- DRY RUN ---");
    console.log("No changes were made. Use --commit to delete records.");
    console.log(`Would delete ${paymentsCount} payments, ${ledgerEntriesCount} ledger entries, ${eventsCount} events.`);
  } else {
    console.log("\n--- Committing deletions ---");

    // Delete events first (no FK dependencies)
    const deletedEvents = await prisma.event.deleteMany({
      where: { type: "PAYMENT", createdAt: { lt: CUTOFF } },
    });
    console.log(`  Deleted ${deletedEvents.count} payment events`);

    // Delete ledger entries
    const deletedLedger = await prisma.ledgerEntry.deleteMany({
      where: { period: { lt: CUTOFF_PERIOD } },
    });
    console.log(`  Deleted ${deletedLedger.count} ledger entries`);

    // Delete payments
    const deletedPayments = await prisma.payment.deleteMany({
      where: { date: { lt: CUTOFF } },
    });
    console.log(`  Deleted ${deletedPayments.count} payments`);

    // Recalculate running balances on remaining ledger entries per tenant
    console.log("\n  Recalculating ledger balances...");

    const tenantIds = await prisma.ledgerEntry.findMany({
      select: { tenantId: true },
      distinct: ["tenantId"],
    });

    for (const { tenantId } of tenantIds) {
      const entries = await prisma.ledgerEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      });

      let balance = 0;
      for (const entry of entries) {
        balance += entry.amount;
        await prisma.ledgerEntry.update({
          where: { id: entry.id },
          data: { balance },
        });
      }
    }

    console.log(`  Recalculated balances for ${tenantIds.length} tenants`);

    // Log system event
    await logSystemEvent({
      action: "CLEANUP_PRE_2026",
      description: "Deleted pre-2026 financial data",
      metadata: {
        paymentsDeleted: deletedPayments.count,
        ledgerEntriesDeleted: deletedLedger.count,
        eventsDeleted: deletedEvents.count,
      },
    });

    console.log("\nDone! Cleanup complete.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Cleanup failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
