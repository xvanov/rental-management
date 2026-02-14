import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // F7: Use env vars for test data with defaults
  const testAddress = process.env.TEST_PROPERTY_ADDRESS || "8424 Eagle View Dr";
  const testCity = process.env.TEST_PROPERTY_CITY || "Durham";
  const testState = process.env.TEST_PROPERTY_STATE || "NC";
  const testZip = process.env.TEST_PROPERTY_ZIP || "27713";
  const testPhone = process.env.TEST_PHONE_NUMBER || "+12132932712";
  const testFirstName = process.env.TEST_TENANT_FIRST_NAME || "K";
  const testLastName = process.env.TEST_TENANT_LAST_NAME || "Owner";

  // Check if property already exists
  let property = await prisma.property.findFirst({
    where: {
      address: { contains: testAddress.split(" ").slice(0, 3).join(" "), mode: "insensitive" },
    },
    include: { units: true },
  });

  if (!property) {
    // Find or create default org for test scripts
    let org = await prisma.organization.findFirst();
    if (!org) {
      org = await prisma.organization.create({ data: { name: "Test Organization" } });
    }
    // Create the property with a single unit
    property = await prisma.property.create({
      data: {
        organizationId: org.id,
        address: testAddress,
        city: testCity,
        state: testState,
        zip: testZip,
        jurisdiction: `${testCity} County`,
        units: {
          create: [
            { name: "Main Unit", status: "OCCUPIED", rentAmount: 1500 },
          ],
        },
      },
      include: { units: true },
    });
    console.log(`Created property: ${property.address}`);
  } else {
    console.log(`Property already exists: ${property.address}`);
    // Check if property has units, if not create one
    if (property.units.length === 0) {
      const unit = await prisma.unit.create({
        data: {
          name: "Main Unit",
          status: "OCCUPIED",
          rentAmount: 1500,
          propertyId: property.id,
        },
      });
      property.units = [unit];
      console.log(`Created unit: ${unit.name}`);
    }
  }

  const unit = property.units[0];

  // Check if tenant already exists
  let tenant = await prisma.tenant.findFirst({
    where: {
      phone: testPhone,
    },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        firstName: testFirstName,
        lastName: testLastName,
        phone: testPhone,
        unitId: unit.id,
        active: true,
        occupantCount: 1,
        moveInDate: new Date(),
      },
    });
    console.log(`Created tenant: ${tenant.firstName} ${tenant.lastName} (${tenant.phone})`);
  } else {
    // Update tenant to be assigned to this unit if not already
    if (tenant.unitId !== unit.id) {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { unitId: unit.id },
      });
      console.log(`Updated tenant unit assignment`);
    }
    console.log(`Tenant already exists: ${tenant.firstName} ${tenant.lastName}`);
  }

  // Make sure unit is marked as occupied
  await prisma.unit.update({
    where: { id: unit.id },
    data: { status: "OCCUPIED" },
  });

  console.log(`\nSetup complete!`);
  console.log(`Property: ${property.address}, ${property.city}, ${property.state} ${property.zip}`);
  console.log(`Unit: ${unit.name}`);
  console.log(`Tenant: ${tenant.firstName} ${tenant.lastName} - ${tenant.phone}`);
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
