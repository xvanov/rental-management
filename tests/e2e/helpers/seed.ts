import { prisma } from "@/lib/db";
import { state } from "./state";
import { createTestAuthHeader } from "./auth";

const E2E_PREFIX = "E2E Test";
const E2E_TEST_USER_EMAIL = "xvanov@gmail.com";

/**
 * Create all seed data needed for the test harness.
 * Uses a dedicated test user (xvanov@gmail.com) to avoid touching the production user.
 */
export async function seedTestData() {
  // 1. Organization
  let org = await prisma.organization.findFirst({
    where: { name: `${E2E_PREFIX} Org` },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: `${E2E_PREFIX} Org` },
    });
  }
  state.organizationId = org.id;

  // 2. Use the dedicated test user — never touch the production user
  let user = await prisma.user.findFirst({
    where: { email: E2E_TEST_USER_EMAIL },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: E2E_TEST_USER_EMAIL,
        name: `${E2E_PREFIX} User`,
      },
    });
  }

  // Save original org so cleanup can restore it
  state.originalOrgId = user.activeOrganizationId || "";

  // Point test user to the test org
  await prisma.user.update({
    where: { id: user.id },
    data: { activeOrganizationId: org.id },
  });
  state.userId = user.id;

  // 3. Organization membership (ADMIN)
  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    update: { role: "ADMIN" },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "ADMIN",
    },
  });

  // 4. Property
  let property = await prisma.property.findFirst({
    where: {
      organizationId: org.id,
      address: "123 E2E Test Street",
    },
  });
  if (!property) {
    property = await prisma.property.create({
      data: {
        organizationId: org.id,
        address: "123 E2E Test Street",
        city: "Durham",
        state: "NC",
        zip: "27701",
        jurisdiction: "Durham County, NC",
      },
    });
  }
  state.propertyId = property.id;

  // 5. Two units — one for peaceful tenant, one for eviction
  let unitA = await prisma.unit.findFirst({
    where: { propertyId: property.id, name: `${E2E_PREFIX} Room A` },
  });
  if (!unitA) {
    unitA = await prisma.unit.create({
      data: {
        propertyId: property.id,
        name: `${E2E_PREFIX} Room A`,
        status: "VACANT",
        rentAmount: 800,
      },
    });
  } else {
    await prisma.unit.update({
      where: { id: unitA.id },
      data: { status: "VACANT" },
    });
  }
  state.unitIdA = unitA.id;

  let unitB = await prisma.unit.findFirst({
    where: { propertyId: property.id, name: `${E2E_PREFIX} Room B` },
  });
  if (!unitB) {
    unitB = await prisma.unit.create({
      data: {
        propertyId: property.id,
        name: `${E2E_PREFIX} Room B`,
        status: "VACANT",
        rentAmount: 800,
      },
    });
  } else {
    await prisma.unit.update({
      where: { id: unitB.id },
      data: { status: "VACANT" },
    });
  }
  state.unitIdB = unitB.id;

  // 6. Auth header — uses the test user, not the production user
  state.testAuthHeader = createTestAuthHeader(user.id, org.id);

  console.log(`[E2E Seed] Org: ${org.id}`);
  console.log(`[E2E Seed] User: ${user.id} (${E2E_TEST_USER_EMAIL})`);
  console.log(`[E2E Seed] Property: ${property.id}`);
  console.log(`[E2E Seed] Unit A: ${unitA.id}, Unit B: ${unitB.id}`);
}
