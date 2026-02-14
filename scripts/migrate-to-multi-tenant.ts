/**
 * Migration script: Assign existing data to a default organization.
 *
 * Steps:
 * 1. Create a "Default Organization"
 * 2. Make the first user its ADMIN
 * 3. Set organizationId on all existing Properties and LeaseTemplates
 * 4. Set activeOrganizationId on the user
 *
 * Run with: npx tsx scripts/migrate-to-multi-tenant.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Check if any organization already exists
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log("Organization already exists, skipping migration.");
    console.log(`  Org: ${existingOrg.name} (${existingOrg.id})`);
    return;
  }

  // Find the first user
  const firstUser = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!firstUser) {
    console.log("No users found. Skipping migration — org will be created on first login.");
    return;
  }

  console.log(`Found user: ${firstUser.name ?? firstUser.email} (${firstUser.id})`);

  // Create default organization
  const org = await prisma.organization.create({
    data: {
      name: "Default Organization",
    },
  });
  console.log(`Created organization: ${org.name} (${org.id})`);

  // Make the first user an ADMIN member
  await prisma.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: firstUser.id,
      role: "ADMIN",
    },
  });
  console.log(`Added ${firstUser.name ?? firstUser.email} as ADMIN`);

  // Set activeOrganizationId on the user
  await prisma.user.update({
    where: { id: firstUser.id },
    data: { activeOrganizationId: org.id },
  });
  console.log(`Set activeOrganizationId on user`);

  // Assign all unassigned properties to this organization
  // Note: organizationId is now required, but this handles any pre-migration rows
  const propertyResult = await prisma.$executeRawUnsafe(
    `UPDATE "Property" SET "organizationId" = $1 WHERE "organizationId" IS NULL`,
    org.id
  );
  console.log(`Assigned ${propertyResult} properties to organization`);

  // Assign all lease templates to this organization
  const templateResult = await prisma.leaseTemplate.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`Assigned ${templateResult.count} lease templates to organization`);

  // Add any other users as members
  const otherUsers = await prisma.user.findMany({
    where: { id: { not: firstUser.id } },
  });

  for (const user of otherUsers) {
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "MEMBER",
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { activeOrganizationId: org.id },
    });
    console.log(`Added ${user.name ?? user.email} as MEMBER`);
  }

  console.log("\nMigration complete!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
