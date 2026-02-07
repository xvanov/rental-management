import { config } from "dotenv";
import { PrismaClient, UnitStatus } from "../src/generated/prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

async function main() {
  // Move Ridge Rd tenants from Windsong to actual Ridge Rd
  const windsong = await prisma.property.findFirst({
    where: { address: { contains: "Windsong" } },
    include: { units: { include: { tenants: true } } },
  });

  const ridgeRd = await prisma.property.findFirst({
    where: { address: { contains: "Ridge Rd" } },
    include: { units: true },
  });

  // Move King Arthur tenants from Commonwealth to actual King Arthur
  const commonwealth = await prisma.property.findFirst({
    where: { address: { contains: "Commonwealth" } },
    include: { units: { include: { tenants: true } } },
  });

  const kingArthur = await prisma.property.findFirst({
    where: { address: { contains: "King Arthur" } },
    include: { units: true },
  });

  if (!ridgeRd || !kingArthur) {
    console.log("Ridge Rd:", ridgeRd?.address);
    console.log("King Arthur:", kingArthur?.address);
    console.log("Cannot proceed - missing properties");
    return;
  }

  console.log("\n=== Moving Tenants ===\n");

  // Move Windsong tenants to Ridge Rd
  if (windsong && windsong.units.length > 0) {
    console.log(`Moving tenants from ${windsong.address} to ${ridgeRd.address}`);

    // Create units on Ridge Rd
    for (let i = 0; i < windsong.units.length; i++) {
      const sourceUnit = windsong.units[i];
      const unitName = `Room ${i + 1}`;

      // Check if unit exists
      let targetUnit = ridgeRd.units.find((u) => u.name === unitName);
      if (!targetUnit) {
        targetUnit = await prisma.unit.create({
          data: {
            name: unitName,
            propertyId: ridgeRd.id,
            status: UnitStatus.OCCUPIED,
          },
        });
        console.log(`  Created unit ${unitName} on Ridge Rd`);
      }

      // Move tenants
      for (const tenant of sourceUnit.tenants) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { unitId: targetUnit.id },
        });
        console.log(`  Moved ${tenant.firstName} to ${ridgeRd.address} ${unitName}`);
      }

      // Mark source unit as vacant
      await prisma.unit.update({
        where: { id: sourceUnit.id },
        data: { status: UnitStatus.VACANT },
      });
    }

    // Delete empty Windsong units
    for (const unit of windsong.units) {
      await prisma.unit.delete({ where: { id: unit.id } });
    }
    console.log(`  Deleted empty units from ${windsong.address}`);
  }

  // Move Commonwealth tenants to King Arthur
  if (commonwealth && commonwealth.units.length > 0) {
    console.log(`\nMoving tenants from ${commonwealth.address} to ${kingArthur.address}`);

    // Create units on King Arthur
    for (let i = 0; i < commonwealth.units.length; i++) {
      const sourceUnit = commonwealth.units[i];
      const unitName = `Room ${i + 1}`;

      // Check if unit exists
      let targetUnit = kingArthur.units.find((u) => u.name === unitName);
      if (!targetUnit) {
        targetUnit = await prisma.unit.create({
          data: {
            name: unitName,
            propertyId: kingArthur.id,
            status: UnitStatus.OCCUPIED,
          },
        });
        console.log(`  Created unit ${unitName} on King Arthur`);
      }

      // Move tenants
      for (const tenant of sourceUnit.tenants) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { unitId: targetUnit.id },
        });
        console.log(`  Moved ${tenant.firstName} to ${kingArthur.address} ${unitName}`);
      }

      // Mark source unit as vacant
      await prisma.unit.update({
        where: { id: sourceUnit.id },
        data: { status: UnitStatus.VACANT },
      });
    }

    // Delete empty Commonwealth units
    for (const unit of commonwealth.units) {
      await prisma.unit.delete({ where: { id: unit.id } });
    }
    console.log(`  Deleted empty units from ${commonwealth.address}`);
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
