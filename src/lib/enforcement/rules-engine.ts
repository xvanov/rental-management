/**
 * Enforcement rules engine - determines what enforcement actions to take
 * based on lease clauses, payment history, and notice history.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnforcementContext {
  tenantId: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  tenantName: string;
  tenantPhone: string | null;
  tenantEmail: string | null;
  rentAmount: number;
  dueDay: number;
  gracePeriodDays: number;
  lateFeeAmount: number;
  lateFeeType: "fixed" | "percentage";
  propertyAddress: string;
  materialBreachDay: number | null;
}

export interface EnforcementAction {
  type: "RENT_REMINDER" | "LATE_NOTICE" | "LATE_FEE" | "VIOLATION_NOTICE" | "ESCALATION" | "MATERIAL_BREACH";
  tenantId: string;
  leaseId: string;
  propertyId: string;
  description: string;
  context: EnforcementContext;
  period: string; // YYYY-MM
}

// ─── Rules Engine ───────────────────────────────────────────────────────────

/**
 * Evaluate all active leases and determine what enforcement actions are needed.
 * Returns a list of actions that should be taken.
 * Optionally scoped to a specific organization.
 */
export async function evaluateEnforcementRules(
  options?: { organizationId?: string }
): Promise<EnforcementAction[]> {
  const actions: EnforcementAction[] = [];
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get all active leases with their clauses, tenant, and unit
  const activeLeases = await prisma.lease.findMany({
    where: {
      status: "ACTIVE",
      ...(options?.organizationId
        ? { unit: { property: { organizationId: options.organizationId } } }
        : {}),
    },
    include: {
      clauses: true,
      tenant: true,
      unit: { include: { property: true } },
    },
  });

  for (const lease of activeLeases) {
    if (!lease.tenant || !lease.unit) continue;

    const context = buildEnforcementContext(lease);
    if (!context) continue;

    // Check if rent reminders are needed (3 days before and 1 day before)
    const reminderActions = await checkRentReminders(context, now, currentPeriod);
    actions.push(...reminderActions);

    // Check if late notices are needed (after grace period)
    const lateActions = await checkLateRent(context, now, currentPeriod);
    actions.push(...lateActions);

    // Check for escalation of existing notices
    const escalationActions = await checkEscalation(context, now);
    actions.push(...escalationActions);

    // Check for material breach (eviction warning)
    const breachActions = await checkMaterialBreach(context, now, currentPeriod);
    actions.push(...breachActions);
  }

  return actions;
}

/**
 * Build enforcement context from a lease with its relations.
 */
function buildEnforcementContext(lease: {
  id: string;
  rentAmount: number | null;
  clauses: Array<{ type: string; metadata: Prisma.JsonValue }>;
  tenant: { id: string; firstName: string; lastName: string; phone: string | null; email: string | null };
  unit: { id: string; property: { id: string; address: string } };
}): EnforcementContext | null {
  const rentAmount = lease.rentAmount ?? 0;
  if (rentAmount <= 0) return null;

  // Extract clause data
  let dueDay = 1;
  let gracePeriodDays = 5;
  let lateFeeAmount = 50;
  let lateFeeType: "fixed" | "percentage" = "fixed";
  let materialBreachDay: number | null = null;

  for (const clause of lease.clauses) {
    const meta = clause.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    switch (clause.type) {
      case "RENT_DUE_DATE":
        dueDay = (meta.dueDay as number) ?? 1;
        break;
      case "GRACE_PERIOD":
        gracePeriodDays = (meta.days as number) ?? 5;
        break;
      case "LATE_FEE":
        lateFeeAmount = (meta.amount as number) ?? 50;
        lateFeeType = (meta.type as "fixed" | "percentage") ?? "fixed";
        break;
      case "MATERIAL_BREACH":
        materialBreachDay = (meta.breachDay as number) ?? 10;
        break;
    }
  }

  // Pre-compute dollar amount for percentage-based late fees
  if (lateFeeType === "percentage") {
    lateFeeAmount = rentAmount * (lateFeeAmount / 100);
  }

  return {
    tenantId: lease.tenant.id,
    leaseId: lease.id,
    propertyId: lease.unit.property.id,
    unitId: lease.unit.id,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
    tenantPhone: lease.tenant.phone,
    tenantEmail: lease.tenant.email,
    rentAmount,
    dueDay,
    gracePeriodDays,
    lateFeeAmount,
    lateFeeType,
    propertyAddress: lease.unit.property.address,
    materialBreachDay,
  };
}

/**
 * Check if rent reminders should be sent (3 days before and 1 day before due date).
 */
async function checkRentReminders(
  context: EnforcementContext,
  now: Date,
  period: string
): Promise<EnforcementAction[]> {
  const actions: EnforcementAction[] = [];
  const dayOfMonth = now.getDate();
  const daysUntilDue = context.dueDay - dayOfMonth;

  // Only send reminders if rent is not yet paid for this period
  const hasPaid = await hasRentBeenPaid(context.tenantId, period, context.rentAmount);
  if (hasPaid) return actions;

  // Check if a reminder was already sent today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const existingReminder = await prisma.event.findFirst({
    where: {
      tenantId: context.tenantId,
      type: "SYSTEM",
      createdAt: { gte: todayStart, lt: todayEnd },
      payload: {
        path: ["action"],
        equals: "RENT_REMINDER",
      },
    },
  });

  if (existingReminder) return actions;

  // Send reminders 3 days before and 1 day before
  if (daysUntilDue === 3 || daysUntilDue === 1) {
    actions.push({
      type: "RENT_REMINDER",
      tenantId: context.tenantId,
      leaseId: context.leaseId,
      propertyId: context.propertyId,
      description: `Rent reminder: $${context.rentAmount} due in ${daysUntilDue} day(s) on the ${context.dueDay}${getOrdinal(context.dueDay)}`,
      context,
      period,
    });
  }

  return actions;
}

/**
 * Check if rent is past due after grace period and a late notice should be issued.
 */
async function checkLateRent(
  context: EnforcementContext,
  now: Date,
  period: string
): Promise<EnforcementAction[]> {
  const actions: EnforcementAction[] = [];
  const dayOfMonth = now.getDate();
  const deadlineDay = context.dueDay + context.gracePeriodDays;

  // Only check after grace period has passed
  if (dayOfMonth <= deadlineDay) return actions;

  // Check if rent has been paid
  const hasPaid = await hasRentBeenPaid(context.tenantId, period, context.rentAmount);
  if (hasPaid) return actions;

  // Check if we already issued a late notice for this period
  const existingNotice = await prisma.notice.findFirst({
    where: {
      tenantId: context.tenantId,
      type: "LATE_RENT",
      createdAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
      },
    },
  });

  if (existingNotice) return actions;

  actions.push({
    type: "LATE_NOTICE",
    tenantId: context.tenantId,
    leaseId: context.leaseId,
    propertyId: context.propertyId,
    description: `Late rent notice: $${context.rentAmount} was due on the ${context.dueDay}${getOrdinal(context.dueDay)}, grace period of ${context.gracePeriodDays} days has expired`,
    context,
    period,
  });

  return actions;
}

/**
 * Check if existing notices need escalation (unresolved after 10 days → violation,
 * unresolved after 20 days → eviction warning).
 */
async function checkEscalation(
  context: EnforcementContext,
  now: Date
): Promise<EnforcementAction[]> {
  const actions: EnforcementAction[] = [];
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Get sent but unresolved notices for this tenant
  const unresolvedNotices = await prisma.notice.findMany({
    where: {
      tenantId: context.tenantId,
      status: { in: ["SENT", "SERVED"] },
      type: "LATE_RENT",
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  for (const notice of unresolvedNotices) {
    const daysSinceSent = Math.floor(
      (now.getTime() - notice.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if rent was paid since the notice was issued
    const hasPaid = await hasRentBeenPaid(context.tenantId, currentPeriod, context.rentAmount);
    if (hasPaid) continue;

    // After 10 days with no resolution, escalate to lease violation
    if (daysSinceSent >= 10) {
      const existingViolation = await prisma.notice.findFirst({
        where: {
          tenantId: context.tenantId,
          type: "LEASE_VIOLATION",
          createdAt: { gte: notice.createdAt },
        },
      });

      if (!existingViolation) {
        actions.push({
          type: "ESCALATION",
          tenantId: context.tenantId,
          leaseId: context.leaseId,
          propertyId: context.propertyId,
          description: `Escalation: Late rent notice unresolved for ${daysSinceSent} days, issuing lease violation notice`,
          context,
          period: currentPeriod,
        });
      }
    }
  }

  return actions;
}

/**
 * Check if material breach threshold has been met (rent unpaid by breach day).
 * Issues EVICTION_WARNING notice if no existing one for this period.
 */
async function checkMaterialBreach(
  context: EnforcementContext,
  now: Date,
  period: string
): Promise<EnforcementAction[]> {
  const actions: EnforcementAction[] = [];

  if (!context.materialBreachDay) return actions;

  const dayOfMonth = now.getDate();
  if (dayOfMonth < context.materialBreachDay) return actions;

  // Check if rent has been paid
  const hasPaid = await hasRentBeenPaid(context.tenantId, period, context.rentAmount);
  if (hasPaid) return actions;

  // Check if we already issued an eviction warning for this period
  const existingWarning = await prisma.notice.findFirst({
    where: {
      tenantId: context.tenantId,
      type: "EVICTION_WARNING",
      createdAt: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
      },
    },
  });

  if (existingWarning) return actions;

  actions.push({
    type: "MATERIAL_BREACH",
    tenantId: context.tenantId,
    leaseId: context.leaseId,
    propertyId: context.propertyId,
    description: `Material breach: rent of $${context.rentAmount.toFixed(2)} unpaid by the ${context.materialBreachDay}${getOrdinal(context.materialBreachDay)}. Issuing eviction warning.`,
    context,
    period,
  });

  return actions;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function hasRentBeenPaid(tenantId: string, period: string, rentAmount: number): Promise<boolean> {
  const payments = await prisma.ledgerEntry.findMany({
    where: {
      tenantId,
      period,
      type: "PAYMENT",
    },
  });

  const totalPaid = payments.reduce((sum, p) => sum + Math.abs(p.amount), 0);
  return totalPaid >= rentAmount;
}

function getOrdinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Generate the content for a late rent notice.
 */
export function generateLateRentNoticeContent(context: EnforcementContext, period: string): string {
  const [year, month] = period.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-US", { month: "long" });

  return `NOTICE OF LATE RENT PAYMENT

To: ${context.tenantName}
Property: ${context.propertyAddress}
Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Dear ${context.tenantName},

This notice is to inform you that your rent payment for ${monthName} ${year} in the amount of $${context.rentAmount.toFixed(2)} was due on the ${context.dueDay}${getOrdinal(context.dueDay)} of the month and has not been received.

Per your lease agreement, a grace period of ${context.gracePeriodDays} day(s) was provided, which has now expired.

A late fee of $${context.lateFeeAmount.toFixed(2)} has been applied to your account.

Please remit payment of $${(context.rentAmount + context.lateFeeAmount).toFixed(2)} (rent + late fee) immediately to avoid further action.

Failure to pay within 10 days may result in a formal lease violation notice and potential eviction proceedings.

Sincerely,
Property Management`;
}

/**
 * Generate the content for an eviction warning notice (material breach).
 * References NC General Statutes Chapter 42.
 */
export function generateEvictionWarningContent(context: EnforcementContext, period: string): string {
  const [year, month] = period.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-US", { month: "long" });
  const totalOwed = context.rentAmount + context.lateFeeAmount;

  return `NOTICE OF MATERIAL BREACH AND EVICTION WARNING

To: ${context.tenantName}
Property: ${context.propertyAddress}
Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Dear ${context.tenantName},

NOTICE IS HEREBY GIVEN that you are in material breach of your lease agreement due to non-payment of rent for ${monthName} ${year}.

OUTSTANDING BALANCE: $${totalOwed.toFixed(2)}
- Rent Due: $${context.rentAmount.toFixed(2)}
- Late Fee: $${context.lateFeeAmount.toFixed(2)}

Pursuant to North Carolina General Statutes Chapter 42, Article 3 (G.S. 42-25.6 et seq.), you are hereby notified that failure to pay the full outstanding balance within TEN (10) DAYS of this notice will result in the initiation of summary ejectment proceedings.

YOUR RIGHTS:
- You have the right to cure this breach by paying the full amount owed within 10 days.
- You have the right to seek legal counsel.
- You may contact the North Carolina Bar Association Lawyer Referral Service.

If payment is not received in full by ${new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}, legal proceedings will be initiated.

This notice is being provided in compliance with North Carolina law and does not waive any rights of the landlord under the lease agreement or applicable law.

Sincerely,
Property Management`;
}

/**
 * Generate the content for a lease violation notice with payment plan.
 */
export function generateViolationNoticeContent(context: EnforcementContext, period: string, totalOwed: number): string {
  const [year, month] = period.split("-");
  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString("en-US", { month: "long" });

  return `NOTICE OF LEASE VIOLATION

To: ${context.tenantName}
Property: ${context.propertyAddress}
Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}

Dear ${context.tenantName},

This is a formal notice that you are in violation of your lease agreement due to non-payment of rent for ${monthName} ${year}.

OUTSTANDING BALANCE: $${totalOwed.toFixed(2)}

This amount includes:
- Rent: $${context.rentAmount.toFixed(2)}
- Late Fee: $${context.lateFeeAmount.toFixed(2)}

PAYMENT PLAN OPTION:
To avoid further legal action, you may arrange a payment plan by contacting your property manager within 5 business days of this notice.

IMPORTANT: If payment or a payment arrangement is not received within 10 days of this notice, formal eviction proceedings may be initiated in accordance with North Carolina General Statutes Chapter 42.

This notice is provided in compliance with Durham County, NC requirements.

Sincerely,
Property Management`;
}
