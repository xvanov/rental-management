import { config } from "dotenv";
import { PrismaClient, UnitStatus } from "../src/generated/prisma/client";

// Load env files
config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

// Tenant data for each property
const propertyTenants: Record<string, { name: string; weight: number }[]> = {
  // Beretania (3448 BERETANIA WAY)
  "BERETANIA": [
    { name: "Rafael+Alexa", weight: 2.0 },
    { name: "Oswaldo", weight: 1.0 },
    { name: "Adonis", weight: 1.0 },
    { name: "Vicente+esposa", weight: 2.0 },
    { name: "Anayeli", weight: 1.0 },
    { name: "Ana", weight: 1.0 },
  ],
  // Ridge Rd (4171 WINDSONG ST)
  "WINDSONG": [
    { name: "Ephraim", weight: 1.0 },
    { name: "Jose+Aurelia", weight: 1.0 },
    { name: "Rafael", weight: 1.0 },
    { name: "Lars", weight: 1.0 },
    { name: "Xavier", weight: 1.0 },
    { name: "Aaron", weight: 1.0 },
  ],
  // King Arthur (7613 COMMONWEALTH DR)
  "COMMONWEALTH": [
    { name: "Anna", weight: 1.0 },
    { name: "James", weight: 1.0 },
    { name: "William", weight: 1.0 },
    { name: "Cameron", weight: 1.0 },
    { name: "Musa", weight: 1.0 },
    { name: "Christopher", weight: 1.0 },
  ],
  // Howard
  "HOWARD": [
    { name: "Cindy", weight: 1.0 },
    { name: "Amy", weight: 1.0 },
    { name: "Ikea", weight: 1.0 },
    { name: "Latasha", weight: 1.0 },
    { name: "Tenzin", weight: 1.0 },
  ],
  // Appling
  "APPLING": [
    { name: "Jay", weight: 2.0 },
    { name: "David Landry", weight: 1.0 },
    { name: "Jorge+Elizabeth", weight: 2.0 },
    { name: "Deja", weight: 1.0 },
    { name: "Marvin", weight: 1.0 },
  ],
  // Underbrush
  "UNDERBRUSH": [
    { name: "Sergey", weight: 1.0 },
    { name: "Mark", weight: 1.0 },
    { name: "Alex", weight: 1.0 },
    { name: "Daniel", weight: 1.0 },
    { name: "Jennifer", weight: 1.0 },
    { name: "Horley", weight: 1.0 },
  ],
};

async function main() {
  // First, list existing properties
  const properties = await prisma.property.findMany({
    include: { units: { include: { tenants: true } } },
  });

  console.log("\n=== Existing Properties ===\n");
  for (const p of properties) {
    console.log(`Property: ${p.address} (${p.id})`);
    console.log(`  Units: ${p.units.length}`);
    for (const u of p.units) {
      console.log(`    - ${u.name}: ${u.tenants.length} tenants`);
    }
  }

  // Match properties to tenant data
  const propertyMapping: { property: typeof properties[0]; key: string }[] = [];

  for (const property of properties) {
    const addr = property.address.toUpperCase();
    for (const key of Object.keys(propertyTenants)) {
      if (addr.includes(key)) {
        propertyMapping.push({ property, key });
        break;
      }
    }
  }

  console.log("\n=== Adding Tenants ===\n");

  for (const { property, key } of propertyMapping) {
    const tenants = propertyTenants[key];
    console.log(`\nProperty: ${property.address} (${key})`);
    console.log(`  Need ${tenants.length} units/tenants`);

    // Get or create units
    let units = property.units.sort((a, b) => a.name.localeCompare(b.name));

    // Create missing units
    while (units.length < tenants.length) {
      const unitNum = units.length + 1;
      const unit = await prisma.unit.create({
        data: {
          name: `Room ${unitNum}`,
          propertyId: property.id,
          status: UnitStatus.OCCUPIED,
        },
        include: { tenants: true },
      });
      units.push(unit);
      console.log(`  Created unit: ${unit.name}`);
    }

    // Rename units to be numbered if needed
    for (let i = 0; i < tenants.length; i++) {
      const unit = units[i];
      const expectedName = `Room ${i + 1}`;

      if (unit.name !== expectedName) {
        await prisma.unit.update({
          where: { id: unit.id },
          data: { name: expectedName },
        });
        console.log(`  Renamed unit "${unit.name}" to "${expectedName}"`);
      }
    }

    // Add tenants
    for (let i = 0; i < tenants.length; i++) {
      const tenantData = tenants[i];
      const unit = units[i];

      // Check if tenant already exists in this unit
      const existingTenant = unit.tenants.find(
        (t) => t.firstName === tenantData.name.split("+")[0]
      );

      if (existingTenant) {
        // Update occupant count if different
        if (existingTenant.occupantCount !== tenantData.weight) {
          await prisma.tenant.update({
            where: { id: existingTenant.id },
            data: { occupantCount: tenantData.weight },
          });
          console.log(`  Updated ${tenantData.name}: weight ${tenantData.weight}`);
        } else {
          console.log(`  Skipped ${tenantData.name} (already exists)`);
        }
      } else {
        // Create new tenant
        const nameParts = tenantData.name.split("+");
        const firstName = nameParts[0];
        const lastName = nameParts.length > 1 ? nameParts[1] : "";

        await prisma.tenant.create({
          data: {
            firstName,
            lastName,
            unitId: unit.id,
            occupantCount: tenantData.weight,
            active: true,
          },
        });
        console.log(`  Created tenant: ${tenantData.name} in Room ${i + 1} (weight: ${tenantData.weight})`);
      }

      // Update unit status to OCCUPIED
      await prisma.unit.update({
        where: { id: unit.id },
        data: { status: UnitStatus.OCCUPIED },
      });
    }
  }

  // Show final state
  console.log("\n=== Final State ===\n");
  const updatedProperties = await prisma.property.findMany({
    include: {
      units: {
        include: { tenants: { where: { active: true } } },
        orderBy: { name: "asc" },
      },
    },
  });

  for (const p of updatedProperties) {
    console.log(`\n${p.address}:`);
    let totalWeight = 0;
    for (const u of p.units) {
      for (const t of u.tenants) {
        const displayName = t.lastName ? `${t.firstName}+${t.lastName}` : t.firstName;
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
