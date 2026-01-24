import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a sample property
  const property = await prisma.property.create({
    data: {
      address: "123 Main Street",
      city: "Durham",
      state: "NC",
      zip: "27701",
      jurisdiction: "Durham County",
      units: {
        create: [
          { name: "Room A", status: "VACANT", rentAmount: 750 },
          { name: "Room B", status: "VACANT", rentAmount: 700 },
          { name: "Room C", status: "VACANT", rentAmount: 725 },
          { name: "Room D", status: "VACANT", rentAmount: 775 },
        ],
      },
    },
    include: { units: true },
  });

  console.log(`Created property: ${property.address}`);
  console.log(`Created ${property.units.length} units:`);
  for (const unit of property.units) {
    console.log(`  - ${unit.name} ($${unit.rentAmount}/mo)`);
  }

  // Create a second property
  const property2 = await prisma.property.create({
    data: {
      address: "456 Oak Avenue",
      city: "Durham",
      state: "NC",
      zip: "27705",
      jurisdiction: "Durham County",
      units: {
        create: [
          { name: "Room 1", status: "VACANT", rentAmount: 800 },
          { name: "Room 2", status: "VACANT", rentAmount: 800 },
          { name: "Room 3", status: "VACANT", rentAmount: 850 },
        ],
      },
    },
    include: { units: true },
  });

  console.log(`Created property: ${property2.address}`);
  console.log(`Created ${property2.units.length} units:`);
  for (const unit of property2.units) {
    console.log(`  - ${unit.name} ($${unit.rentAmount}/mo)`);
  }

  // Create a sample tenant assigned to the first unit
  const tenant = await prisma.tenant.create({
    data: {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      phone: "+19195551234",
      unitId: property.units[0].id,
    },
  });

  console.log(`Created tenant: ${tenant.firstName} ${tenant.lastName}`);

  // Update unit status to occupied
  await prisma.unit.update({
    where: { id: property.units[0].id },
    data: { status: "OCCUPIED" },
  });

  // Create a system event for the seed
  await prisma.event.create({
    data: {
      type: "SYSTEM",
      propertyId: property.id,
      payload: {
        action: "seed",
        message: "Database seeded with sample data",
      },
    },
  });

  console.log("Seed completed successfully.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
