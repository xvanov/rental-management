import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";
import { readFileSync } from "fs";

const files = [
  { path: "data/downloaded-bills/duke-energy/api_fetch_latest.json", provider: "Duke Energy", type: "electric" },
  { path: "data/downloaded-bills/durham_latest.json", provider: "Durham Water", type: "water" },
  { path: "data/downloaded-bills/enbridge_latest.json", provider: "Enbridge Gas", type: "gas" },
  { path: "data/downloaded-bills/smud/api_fetch_latest.json", provider: "SMUD", type: "electric" },
  { path: "data/downloaded-bills/wake-electric/api_fetch_latest.json", provider: "Wake Electric", type: "electric" },
];

async function main() {
  const properties = await prisma.property.findMany({
    select: { id: true, address: true },
  });

  function matchProperty(addr: string) {
    const clean = addr.toLowerCase().replace(/,.*/, "").trim();
    // Normal: "123 Main St" or Reversed: "MAIN ST 123"
    const numMatch = clean.match(/^(\d+)\s*(\w+)/);
    if (numMatch) {
      return properties.find(
        (p) =>
          p.address.toLowerCase().includes(numMatch[1]) &&
          p.address.toLowerCase().includes(numMatch[2])
      );
    }
    const revMatch = clean.match(/^([a-z]+(?:\s+[a-z]+)*)\s+(\d+)/);
    if (revMatch) {
      return properties.find(
        (p) =>
          p.address.toLowerCase().includes(revMatch[2]) &&
          p.address.toLowerCase().includes(revMatch[1].split(" ")[0])
      );
    }
    return null;
  }

  let totalImported = 0;

  for (const f of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(f.path, "utf-8"));
    } catch {
      console.log(`${f.provider}: no file at ${f.path}`);
      continue;
    }

    const bills = [...(data.bills || []), ...(data.requires_attention || [])];
    let imported = 0;
    let skipped = 0;

    for (const bill of bills) {
      const addr = bill.service_address || bill.service_location || "";
      if (!addr || addr === "UNKNOWN" || addr.length < 5) {
        skipped++;
        continue;
      }

      const prop = matchProperty(addr);
      if (!prop) {
        skipped++;
        continue;
      }

      const periodEnd = bill.billing_period_end
        ? new Date(bill.billing_period_end)
        : bill.bill_date
          ? new Date(bill.bill_date)
          : null;
      if (!periodEnd || isNaN(periodEnd.getTime())) {
        skipped++;
        continue;
      }
      const period = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, "0")}`;

      const existing = await prisma.utilityBill.findFirst({
        where: { propertyId: prop.id, type: f.type, period, provider: f.provider },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.utilityBill.create({
        data: {
          propertyId: prop.id,
          provider: f.provider,
          type: f.type,
          amount: bill.amount_due,
          billingStart: bill.billing_period_start ? new Date(bill.billing_period_start) : new Date(),
          billingEnd: periodEnd!,
          period,
        },
      });
      imported++;
      console.log(`  ${f.provider}: ${prop.address} | ${period} | $${bill.amount_due}`);
    }

    totalImported += imported;
    console.log(`${f.provider}: ${imported} imported, ${skipped} skipped`);
  }

  console.log(`\nTotal new imports: ${totalImported}`);

  // Final March summary
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
