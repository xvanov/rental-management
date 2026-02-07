/**
 * Add Kalin as a test tenant
 * Run with: npx tsx scripts/add-kalin-tenant.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (.env.local takes priority)
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding Kalin as a test tenant...');

  // First, check existing properties and units
  const properties = await prisma.property.findMany({
    include: { units: true }
  });

  console.log('Existing properties:', properties.length);

  for (const prop of properties) {
    console.log(`  - ${prop.address} (${prop.units.length} units)`);
  }

  // Get a unit from King Arthur Ct if it exists, otherwise use the first unit
  let unit = await prisma.unit.findFirst({
    where: { property: { address: { contains: 'King Arthur' } } },
    include: { property: true }
  });

  if (!unit) {
    unit = await prisma.unit.findFirst({
      include: { property: true }
    });
  }

  if (!unit) {
    console.error('No units found!');
    return;
  }

  // Check if Kalin already exists
  const existingTenant = await prisma.tenant.findFirst({
    where: { email: 'ivanovkalin7@gmail.com' }
  });

  if (existingTenant) {
    console.log('Tenant already exists:', existingTenant.firstName, existingTenant.lastName);
    console.log('Updating email if needed...');
    await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: { email: 'ivanovkalin7@gmail.com' }
    });
    return;
  }

  // Create the tenant
  const tenant = await prisma.tenant.create({
    data: {
      firstName: 'Kalin',
      lastName: 'Ivanov',
      email: 'ivanovkalin7@gmail.com',
      phone: null,
      unit: { connect: { id: unit.id } },
      active: true,
    }
  });

  console.log('Created tenant:', tenant.firstName, tenant.lastName);
  console.log('Email:', tenant.email);
  console.log('Assigned to unit:', unit.name, 'at', unit.property.address);
  console.log('Tenant ID:', tenant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
