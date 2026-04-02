import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/db";

async function main() {
  console.log("Cleaning up all E2E test data...\n");

  // Find test orgs
  const testOrgs = await prisma.organization.findMany({
    where: { name: { startsWith: "E2E Test" } },
    select: { id: true, name: true },
  });
  console.log(`Found ${testOrgs.length} E2E Test org(s)`);

  for (const org of testOrgs) {
    const properties = await prisma.property.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    });
    const propertyIds = properties.map((p) => p.id);

    const units = await prisma.unit.findMany({
      where: { propertyId: { in: propertyIds } },
      select: { id: true },
    });
    const unitIds = units.map((u) => u.id);

    const tenants = await prisma.tenant.findMany({
      where: { unitId: { in: unitIds } },
      select: { id: true },
    });
    const tenantIds = tenants.map((t) => t.id);

    const leases = await prisma.lease.findMany({
      where: { unitId: { in: unitIds } },
      select: { id: true },
    });
    const leaseIds = leases.map((l) => l.id);

    if (tenantIds.length > 0) {
      await prisma.event.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.notice.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.messageMedia.deleteMany({ where: { message: { tenantId: { in: tenantIds } } } });
      await prisma.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.application.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.cleaningAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
      console.log(`  Deleted records for ${tenantIds.length} tenants`);
    }
    if (leaseIds.length > 0) {
      await prisma.signingToken.deleteMany({ where: { leaseId: { in: leaseIds } } });
      await prisma.lease.deleteMany({ where: { id: { in: leaseIds } } });
      console.log(`  Deleted ${leaseIds.length} leases`);
    }
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    if (propertyIds.length > 0) {
      await prisma.event.deleteMany({ where: { propertyId: { in: propertyIds } } });
      await prisma.showing.deleteMany({ where: { propertyId: { in: propertyIds } } });
      await prisma.listing.deleteMany({ where: { propertyId: { in: propertyIds } } });
      await prisma.facebookConversation.deleteMany({ where: { propertyId: { in: propertyIds } } });
      await prisma.task.deleteMany({ where: { propertyId: { in: propertyIds } } });
      console.log(`  Deleted records for ${propertyIds.length} properties`);
    }
    if (unitIds.length > 0) {
      await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
    }
    if (propertyIds.length > 0) {
      await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
    }
    await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    console.log(`  Deleted org: ${org.name}`);
  }

  // Orphaned tenants
  const orphanTenants = await prisma.tenant.findMany({
    where: { firstName: "E2E Test" },
    select: { id: true },
  });
  if (orphanTenants.length > 0) {
    const ids = orphanTenants.map((t) => t.id);
    await prisma.event.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.notice.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.messageMedia.deleteMany({ where: { message: { tenantId: { in: ids } } } });
    await prisma.message.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.application.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.cleaningAssignment.deleteMany({ where: { tenantId: { in: ids } } });
    const leases = await prisma.lease.findMany({ where: { tenantId: { in: ids } }, select: { id: true } });
    if (leases.length > 0) {
      await prisma.signingToken.deleteMany({ where: { leaseId: { in: leases.map((l) => l.id) } } });
      await prisma.lease.deleteMany({ where: { tenantId: { in: ids } } });
    }
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${ids.length} orphaned E2E Test tenants`);
  }

  // Facebook conversations
  const deleted = await prisma.facebookConversation.deleteMany({
    where: { senderPsid: { startsWith: "e2e_psid_" } },
  });
  if (deleted.count > 0) {
    console.log(`Deleted ${deleted.count} E2E Facebook conversations`);
  }

  // Messages from test PSIDs
  await prisma.message.deleteMany({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["senderId"], string_starts_with: "e2e_psid_" },
    },
  });

  // Orphaned test media
  const mediaDeleted = await prisma.messageMedia.deleteMany({
    where: { messageId: null },
  });
  if (mediaDeleted.count > 0) {
    console.log(`Deleted ${mediaDeleted.count} orphaned media records`);
  }

  console.log("\nDone!");
  await prisma.$disconnect();
}

main().catch(console.error);
