import { prisma } from "@/lib/db";
import { state } from "./state";
import { unlinkSync, existsSync } from "fs";
import path from "path";

/**
 * Delete all test data created during the E2E run.
 * Always runs — cleans up both current-run data and any leftover from previous runs.
 * Deletes in reverse dependency order to respect foreign key constraints.
 */
export async function cleanupTestData() {
  console.log("[E2E Cleanup] Removing test data...");

  try {
    // ── 0. Restore user's original org before deleting the test org ───
    const userId = state.userId;
    const originalOrgId = state.originalOrgId;
    if (userId && originalOrgId) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeOrganizationId: originalOrgId },
      });
      console.log(`[E2E Cleanup] Restored user ${userId} to org ${originalOrgId}`);
    }

    // ── 1. Clean up current run by org ID ─────────────────────────────
    const orgId = state.organizationId;
    if (orgId) {
      await cleanupOrg(orgId);
    }

    // ── 2. Clean up any orphaned E2E data from previous runs ──────────
    await cleanupOrphans();

    // ── 3. Clean up the state file ────────────────────────────────────
    const stateFile = path.join(__dirname, "..", ".e2e-state.json");
    if (existsSync(stateFile)) {
      unlinkSync(stateFile);
    }

    console.log("[E2E Cleanup] Done");
  } catch (error) {
    console.error("[E2E Cleanup] Error during cleanup:", error);
  }
}

async function cleanupOrg(orgId: string) {
  const properties = await prisma.property.findMany({
    where: { organizationId: orgId },
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

  // Delete in reverse dependency order
  if (tenantIds.length > 0) {
    await prisma.event.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notice.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.messageMedia.deleteMany({ where: { message: { tenantId: { in: tenantIds } } } });
    await prisma.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.application.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.cleaningAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  }

  if (leaseIds.length > 0) {
    await prisma.signingToken.deleteMany({ where: { leaseId: { in: leaseIds } } });
    await prisma.lease.deleteMany({ where: { id: { in: leaseIds } } });
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
  }

  if (unitIds.length > 0) {
    await prisma.unit.deleteMany({ where: { id: { in: unitIds } } });
  }

  if (propertyIds.length > 0) {
    await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
  }

  await prisma.organizationMember.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
}

/**
 * Find and delete orphaned E2E test data from previous runs that didn't clean up.
 * Identifies test data by the "E2E Test" prefix in names.
 */
async function cleanupOrphans() {
  // Find any leftover E2E Test orgs
  const testOrgs = await prisma.organization.findMany({
    where: { name: { startsWith: "E2E Test" } },
    select: { id: true },
  });

  for (const org of testOrgs) {
    console.log(`[E2E Cleanup] Cleaning up orphaned org: ${org.id}`);
    await cleanupOrg(org.id);
  }

  // Find any leftover E2E Test tenants not attached to a test org
  const orphanTenants = await prisma.tenant.findMany({
    where: { firstName: "E2E Test" },
    select: { id: true },
  });

  if (orphanTenants.length > 0) {
    const orphanIds = orphanTenants.map((t) => t.id);
    console.log(`[E2E Cleanup] Cleaning up ${orphanIds.length} orphaned tenants`);

    await prisma.event.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.notice.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.ledgerEntry.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.payment.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.messageMedia.deleteMany({ where: { message: { tenantId: { in: orphanIds } } } });
    await prisma.message.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.application.deleteMany({ where: { tenantId: { in: orphanIds } } });
    await prisma.cleaningAssignment.deleteMany({ where: { tenantId: { in: orphanIds } } });

    const orphanLeases = await prisma.lease.findMany({
      where: { tenantId: { in: orphanIds } },
      select: { id: true },
    });
    if (orphanLeases.length > 0) {
      await prisma.signingToken.deleteMany({ where: { leaseId: { in: orphanLeases.map((l) => l.id) } } });
      await prisma.lease.deleteMany({ where: { tenantId: { in: orphanIds } } });
    }

    await prisma.tenant.deleteMany({ where: { id: { in: orphanIds } } });
  }

  // Clean up orphaned media uploads from tests
  const orphanMedia = await prisma.messageMedia.findMany({
    where: { messageId: null, fileName: { contains: "test" } },
    select: { id: true },
  });
  if (orphanMedia.length > 0) {
    await prisma.messageMedia.deleteMany({
      where: { id: { in: orphanMedia.map((m) => m.id) } },
    });
  }

  // Clean up Facebook conversations with test PSIDs
  await prisma.facebookConversation.deleteMany({
    where: { senderPsid: { startsWith: "e2e_psid_" } },
  });

  // Clean up messages from test PSIDs
  await prisma.message.deleteMany({
    where: {
      channel: "FACEBOOK",
      metadata: { path: ["senderId"], string_starts_with: "e2e_psid_" },
    },
  });
}
