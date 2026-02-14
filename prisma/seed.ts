import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create or find a seed organization
  let org = await prisma.organization.findFirst({ where: { name: "Seed Organization" } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: "Seed Organization" } });
    console.log(`Created organization: ${org.name}`);
  }

  // Create a sample property
  const property = await prisma.property.create({
    data: {
      organizationId: org.id,
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
      organizationId: org.id,
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

  // Seed utility providers
  const utilityProviders = [
    {
      name: "Durham Water",
      type: "water",
      description: "Water & sewer services",
      website: "https://billpay.onlinebiller.com/ebpp/durhamub/Login/Index",
      phone: "(919) 560-4381",
    },
    {
      name: "Duke Energy",
      type: "electric",
      description: "Electric service",
      website: "https://www.duke-energy.com/sign-in",
      phone: "(800) 452-2777",
    },
    {
      name: "Enbridge Gas",
      type: "gas",
      description: "Natural gas service",
      website: "https://account.dominionenergync.com",
      phone: "(800) 752-7504",
    },
    {
      name: "Wake Electric",
      type: "electric",
      description: "Electric cooperative",
      website: "https://wemc.smarthub.coop/Login.html",
      phone: "(919) 863-6300",
    },
    {
      name: "Graham Utilities",
      type: "water",
      description: "Water, sewer & refuse (City of Graham)",
      website: "https://wipp.edmundsassoc.com/Wipp/?wippid=GRAM",
      phone: "(336) 570-6700",
    },
    {
      name: "Spectrum",
      type: "internet",
      description: "Internet service",
      website: "https://www.spectrum.net",
      phone: "(855) 757-7328",
    },
    {
      name: "Xfinity",
      type: "internet",
      description: "Internet service (Comcast)",
      website: "https://www.xfinity.com",
      phone: "(800) 934-6489",
    },
  ];

  for (const provider of utilityProviders) {
    await prisma.utilityProvider.upsert({
      where: { name: provider.name },
      update: {
        type: provider.type,
        description: provider.description,
        website: provider.website,
        phone: provider.phone,
      },
      create: provider,
    });
  }

  console.log(`Seeded ${utilityProviders.length} utility providers`);

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
