import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";

async function main() {
  // Check for any March 2026 utility bills
  const bills = await prisma.utilityBill.findMany({
    where: {
      OR: [
        { period: { contains: "2026-03" } },
        { billingStart: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") } },
      ],
    },
    include: { property: { select: { address: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log("March 2026 utility bills:", bills.length);
  for (const b of bills) {
    console.log(`  - ${b.property?.address} | ${b.provider} | ${b.type} | $${b.amount} | ${b.period}`);
  }

  // Check parsed bills tables for March
  const durham = await prisma.durhamWaterParsedBill.findMany({
    where: { billingPeriodStart: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") } },
  });
  const duke = await prisma.dukeEnergyParsedBill.findMany({
    where: { billingPeriodStart: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") } },
  });
  const enbridge = await prisma.enbridgeGasParsedBill.findMany({
    where: { billingPeriodStart: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") } },
  });

  console.log("\nParsed (not yet imported) bills for March:");
  console.log("  Durham Water:", durham.length);
  console.log("  Duke Energy:", duke.length);
  console.log("  Enbridge Gas:", enbridge.length);

  // Also check Feb bills in case March hasn't cycled yet
  const febBills = await prisma.utilityBill.findMany({
    where: {
      OR: [
        { period: { contains: "2026-02" } },
        { billingStart: { gte: new Date("2026-02-01"), lt: new Date("2026-03-01") } },
      ],
    },
    include: { property: { select: { address: true } } },
  });
  console.log("\nFeb 2026 utility bills (for reference):", febBills.length);

  // List all properties
  const props = await prisma.property.findMany({
    where: { organizationId: { not: undefined } },
    select: { id: true, address: true, city: true, organizationId: true },
    orderBy: { address: "asc" },
  });
  console.log("\nAll properties:");
  for (const p of props) {
    if (!p.address.includes("E2E Test")) {
      console.log(`  - ${p.address}, ${p.city}`);
    }
  }

  // Check what providers exist
  const providers = await prisma.utilityProvider.findMany({
    where: { active: true },
    select: { name: true, type: true },
  });
  console.log("\nActive utility providers:");
  for (const p of providers) {
    console.log(`  - ${p.name} (${p.type})`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
