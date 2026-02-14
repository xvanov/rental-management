import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { prisma } from "../src/lib/db";
import { logSystemEvent } from "../src/lib/events";

const OPENING_BALANCES: Record<string, number> = {
  "Christopher": 804.00,
  "Cameron": 1252.75,
  "Anna": 947.00,
};

async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");

  console.log("=== Set Opening Balances ===\n");

  if (!shouldCommit) {
    console.log("DRY RUN MODE (use --commit to apply changes)\n");
  }

  const affectedTenantIds: string[] = [];

  for (const [name, balance] of Object.entries(OPENING_BALANCES)) {
    console.log(`Processing ${name} — $${balance.toFixed(2)}...`);

    // Find tenant by first name (case-insensitive)
    const tenant = await prisma.tenant.findFirst({
      where: {
        firstName: { equals: name, mode: "insensitive" },
        deletedAt: null,
      },
    });

    if (!tenant) {
      console.warn(`  WARNING: Tenant "${name}" not found — skipping`);
      continue;
    }

    console.log(`  Found tenant: ${tenant.firstName} ${tenant.lastName} (${tenant.id})`);

    // Check if OPENING_BALANCE already exists for this tenant in 2026-01
    const existing = await prisma.ledgerEntry.findFirst({
      where: {
        tenantId: tenant.id,
        type: "OPENING_BALANCE",
        period: "2026-01",
      },
    });

    if (existing) {
      console.log(`  Already set — $${existing.amount.toFixed(2)} in period 2026-01 — skipping`);
      continue;
    }

    if (!shouldCommit) {
      console.log(`  Would create OPENING_BALANCE: $${balance.toFixed(2)} for period 2026-01`);
      continue;
    }

    // Create ledger entry
    await prisma.ledgerEntry.create({
      data: {
        tenantId: tenant.id,
        type: "OPENING_BALANCE",
        amount: balance,
        description: "Opening balance carried forward from pre-2026",
        period: "2026-01",
        balance: balance, // will be recalculated below
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    });

    console.log(`  Created OPENING_BALANCE: $${balance.toFixed(2)} for period 2026-01`);
    affectedTenantIds.push(tenant.id);
  }

  // Recalculate running balances for affected tenants
  if (shouldCommit && affectedTenantIds.length > 0) {
    console.log(`\nRecalculating running balances for ${affectedTenantIds.length} tenant(s)...`);

    for (const tenantId of affectedTenantIds) {
      const entries = await prisma.ledgerEntry.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      });

      let runningBalance = 0;
      for (const entry of entries) {
        runningBalance += entry.amount;
        await prisma.ledgerEntry.update({
          where: { id: entry.id },
          data: { balance: runningBalance },
        });
      }

      console.log(`  ${tenantId}: ${entries.length} entries, final balance $${runningBalance.toFixed(2)}`);
    }

    // Log system event
    await logSystemEvent({
      action: "OPENING_BALANCES_SET",
      description: `Set opening balances for ${affectedTenantIds.length} tenant(s)`,
      metadata: {
        tenantIds: affectedTenantIds,
        balances: OPENING_BALANCES,
      },
    });

    console.log(`\nDone! Created ${affectedTenantIds.length} opening balance entries.`);
  } else if (!shouldCommit) {
    console.log("\n--- DRY RUN ---");
    console.log("No changes were made. Use --commit to apply opening balances.");
  } else {
    console.log("\nNo new opening balances to create (all already set or tenants not found).");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
