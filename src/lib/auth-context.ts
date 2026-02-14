import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { OrgRole } from "@/generated/prisma/client";

export interface AuthContext {
  userId: string;
  organizationId: string;
  orgRole: OrgRole;
}

/**
 * Get the authenticated user's organization context.
 * Returns AuthContext on success, or a NextResponse error (401/403).
 */
export async function getAuthContext(): Promise<AuthContext | NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.organizationId || !session.user.orgRole) {
    return NextResponse.json(
      { error: "No organization. Please create or join an organization." },
      { status: 403 }
    );
  }

  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    orgRole: session.user.orgRole,
  };
}

/**
 * Same as getAuthContext but also requires ADMIN role.
 */
export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  if (ctx.orgRole !== "ADMIN") {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }

  return ctx;
}

/**
 * Prisma where-clause fragments for scoping queries by organization.
 * Use these to filter data to the current user's organization.
 */
export const orgScope = {
  /** Property: { organizationId } */
  property: (orgId: string) => ({ organizationId: orgId }),

  /** Unit → Property: { property: { organizationId } } */
  unit: (orgId: string) => ({ property: { organizationId: orgId } }),

  /** Tenant → Unit → Property */
  tenant: (orgId: string) => ({
    unit: { property: { organizationId: orgId } },
  }),

  /** Lease → Unit → Property */
  lease: (orgId: string) => ({
    unit: { property: { organizationId: orgId } },
  }),

  /** Payment → Tenant → Unit → Property */
  payment: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),

  /** LedgerEntry → Tenant → Unit → Property */
  ledger: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),

  /** Message → Tenant → Unit → Property */
  message: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),

  /** Notice → Tenant → Unit → Property */
  notice: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),

  /** Application → Tenant → Unit → Property */
  application: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),

  /** Showing → Property */
  showing: (orgId: string) => ({
    property: { organizationId: orgId },
  }),

  /** Task → Property */
  task: (orgId: string) => ({
    property: { organizationId: orgId },
  }),

  /** Event → Property */
  event: (orgId: string) => ({
    property: { organizationId: orgId },
  }),

  /** UtilityBill → Property */
  utilityBill: (orgId: string) => ({
    property: { organizationId: orgId },
  }),

  /** CleaningAssignment → Unit → Property */
  cleaning: (orgId: string) => ({
    unit: { property: { organizationId: orgId } },
  }),

  /** AirFilterConfig → Property */
  airFilter: (orgId: string) => ({
    property: { organizationId: orgId },
  }),

  /** LeaseTemplate: { organizationId } (direct) */
  leaseTemplate: (orgId: string) => ({ organizationId: orgId }),

  /** TenantDocument → Tenant → Unit → Property */
  tenantDocument: (orgId: string) => ({
    tenant: { unit: { property: { organizationId: orgId } } },
  }),
};
