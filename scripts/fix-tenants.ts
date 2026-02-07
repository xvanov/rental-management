import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  // Fix Underbrush - deactivate the duplicate Horlry tenant (has ledger entries)
  const horlry = await prisma.tenant.findFirst({
    where: { firstName: "Horlry", active: true },
  });
  if (horlry) {
    await prisma.tenant.update({
      where: { id: horlry.id },
      data: { active: false, deletedAt: new Date() },
    });
    console.log("Deactivated duplicate Horlry tenant");
  }

  // Show final state
  console.log("\n=== Final State ===\n");
  const properties = await prisma.property.findMany({
    include: {
      units: {
        include: { tenants: { where: { active: true } } },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { address: "asc" },
  });

  for (const p of properties) {
    const tenants = p.units.flatMap((u) => u.tenants);
    if (tenants.length === 0) continue;

    console.log(`\n${p.address}:`);
    let totalWeight = 0;
    for (const u of p.units) {
      for (const t of u.tenants) {
        const displayName = t.lastName
          ? `${t.firstName}+${t.lastName}`
          : t.firstName;
        console.log(`  ${u.name}: ${displayName} (weight: ${t.occupantCount})`);
        totalWeight += t.occupantCount;
      }
    }
    console.log(`  Total weight: ${totalWeight}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
