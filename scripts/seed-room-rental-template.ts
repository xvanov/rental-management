/**
 * Seeds the Room Rental & Co-Living Agreement template into the database
 * Run with: npx tsx scripts/seed-room-rental-template.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables (.env.local takes priority)
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

import { PrismaClient } from '../src/generated/prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

// Template now uses UPPER_CASE markers directly (no conversion needed)
// All standard values are hardcoded in the template
// Only these variables remain: LESSOR_NAME, PROPERTY_ADDRESS, ROOM_NUMBER,
// LEASE_START_DATE, LEASE_END_DATE, MONTHLY_RENT, SECURITY_DEPOSIT,
// STATE_NAME, COUNTY_NAME

async function main() {
  console.log('Seeding Room Rental Agreement template...');

  // Read the markdown template
  const templatePath = path.join(__dirname, '../templates/lease/room-rental-agreement.md');

  if (!fs.existsSync(templatePath)) {
    console.error('Template file not found:', templatePath);
    process.exit(1);
  }

  const content = fs.readFileSync(templatePath, 'utf-8');

  // Check if template already exists
  const existing = await prisma.leaseTemplate.findFirst({
    where: { name: 'Room Rental & Co-Living Agreement' },
  });

  if (existing) {
    console.log('Template already exists, updating...');
    await prisma.leaseTemplate.update({
      where: { id: existing.id },
      data: {
        content,
        description: 'Comprehensive room rental agreement for co-living properties with house rules, maintenance duties, and bed bug protocol addenda.',
        jurisdiction: 'North Carolina',
      },
    });
    console.log('Template updated:', existing.id);
  } else {
    const template = await prisma.leaseTemplate.create({
      data: {
        name: 'Room Rental & Co-Living Agreement',
        content,
        description: 'Comprehensive room rental agreement for co-living properties with house rules, maintenance duties, and bed bug protocol addenda.',
        jurisdiction: 'North Carolina',
      },
    });
    console.log('Template created:', template.id);
  }

  console.log('Done!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
