import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";

async function main() {
  const prop = await prisma.property.findFirst({
    where: { address: { contains: "North" } },
  });

  if (!prop) {
    console.log("Property not found");
    process.exit(1);
  }

  // The Graham bill is for billing period 02/01-02/28, billing date 03/01, due 03/18.
  // The period is "2026-03" based on billing date (March).
  // Current charges: $89.78 (water+sewer+stormwater+refuse+recycling)

  // Check if already exists
  const existing = await prisma.utilityBill.findFirst({
    where: {
      propertyId: prop.id,
      provider: "Graham Utilities",
      period: "2026-03",
    },
  });

  if (existing) {
    console.log(`Already exists: Graham Utilities | ${prop.address} | 2026-03 | $${existing.amount}`);
  } else {
    await prisma.utilityBill.create({
      data: {
        propertyId: prop.id,
        provider: "Graham Utilities",
        type: "water",
        amount: 89.78,
        billingStart: new Date("2026-02-01"),
        billingEnd: new Date("2026-02-28"),
        period: "2026-03",
      },
    });
    console.log(`Imported: Graham Utilities | ${prop.address} | 2026-03 | $89.78`);
  }

  // Final March count
  const marchBills = await prisma.utilityBill.findMany({
    where: { period: "2026-03" },
    include: { property: { select: { address: true } } },
    orderBy: [{ provider: "asc" }, { property: { address: "asc" } }],
  });

  console.log(`\n=== All March 2026 bills (${marchBills.length}) ===`);
  let lastProv = "";
  for (const b of marchBills) {
    if (b.provider !== lastProv) {
      console.log(`\n${b.provider}:`);
      lastProv = b.provider;
    }
    console.log(`  ${b.property?.address} | $${b.amount}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
