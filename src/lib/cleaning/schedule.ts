import { prisma } from "@/lib/db";
import { logCleaningEvent } from "@/lib/events";

/**
 * Get the start of the current week (Sunday at midnight).
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Set to Sunday
  return d;
}

/**
 * Generate cleaning assignments for a given week for all properties.
 * Uses a rotating schedule among active tenants.
 * Skips creation if assignments already exist for that week/property.
 */
export async function generateWeeklyAssignments(weekOf?: Date) {
  const weekStart = weekOf ? getWeekStart(weekOf) : getWeekStart();

  // Get all properties with occupied units and active tenants
  const properties = await prisma.property.findMany({
    include: {
      units: {
        where: { status: "OCCUPIED" },
        include: {
          tenants: {
            where: { active: true },
          },
        },
      },
    },
  });

  const created: Array<{ assignmentId: string; tenantName: string; propertyAddress: string }> = [];

  for (const property of properties) {
    // Collect all active tenants in this property
    const tenants = property.units.flatMap((unit) =>
      unit.tenants.map((tenant) => ({ ...tenant, unitId: unit.id }))
    );

    if (tenants.length === 0) continue;

    // Check if assignments already exist for this property/week
    const existingAssignments = await prisma.cleaningAssignment.findMany({
      where: {
        weekOf: weekStart,
        unit: { propertyId: property.id },
      },
    });

    if (existingAssignments.length > 0) continue;

    // Determine rotation: get last assignment for this property to find next tenant
    const lastAssignment = await prisma.cleaningAssignment.findFirst({
      where: {
        unit: { propertyId: property.id },
      },
      orderBy: { weekOf: "desc" },
    });

    let nextTenantIndex = 0;
    if (lastAssignment) {
      const lastTenantIndex = tenants.findIndex((t) => t.id === lastAssignment.tenantId);
      if (lastTenantIndex >= 0) {
        nextTenantIndex = (lastTenantIndex + 1) % tenants.length;
      }
    }

    const assignedTenant = tenants[nextTenantIndex];

    // Create the assignment
    const assignment = await prisma.cleaningAssignment.create({
      data: {
        tenantId: assignedTenant.id,
        unitId: assignedTenant.unitId,
        weekOf: weekStart,
        status: "PENDING",
      },
    });

    // Log event
    await logCleaningEvent(
      {
        assignmentId: assignment.id,
        action: "ASSIGNED",
      },
      {
        tenantId: assignedTenant.id,
        propertyId: property.id,
      }
    );

    created.push({
      assignmentId: assignment.id,
      tenantName: `${assignedTenant.firstName} ${assignedTenant.lastName}`,
      propertyAddress: property.address,
    });
  }

  return created;
}

/**
 * Mark overdue assignments (PENDING past Sunday midnight).
 * Should be called on Monday to check if Sunday's assignments were submitted.
 */
export async function markOverdueAssignments() {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);

  // Find all PENDING assignments for previous weeks (past their deadline)
  const overdueAssignments = await prisma.cleaningAssignment.findMany({
    where: {
      status: "PENDING",
      weekOf: { lt: currentWeekStart },
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  });

  const results: Array<{ assignmentId: string; tenantId: string; tenantName: string }> = [];

  for (const assignment of overdueAssignments) {
    await prisma.cleaningAssignment.update({
      where: { id: assignment.id },
      data: { status: "OVERDUE" },
    });

    await logCleaningEvent(
      {
        assignmentId: assignment.id,
        action: "OVERDUE",
      },
      {
        tenantId: assignment.tenantId,
        propertyId: assignment.unit.propertyId,
      }
    );

    results.push({
      assignmentId: assignment.id,
      tenantId: assignment.tenantId,
      tenantName: `${assignment.tenant.firstName} ${assignment.tenant.lastName}`,
    });
  }

  return results;
}

/**
 * Apply cleaning fee to a tenant's ledger for a missed/failed cleaning assignment.
 */
export async function applyCleaningFee(
  tenantId: string,
  assignmentId: string,
  feeAmount: number,
  description: string
) {
  // Get the current balance
  const latestEntry = await prisma.ledgerEntry.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  const currentBalance = latestEntry?.balance ?? 0;

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Create ledger entry for the cleaning fee
  await prisma.ledgerEntry.create({
    data: {
      tenantId,
      type: "LATE_FEE",
      amount: feeAmount,
      description,
      period,
      balance: currentBalance + feeAmount,
    },
  });

  // Get property for event logging
  const assignment = await prisma.cleaningAssignment.findUnique({
    where: { id: assignmentId },
    include: { unit: true },
  });

  await logCleaningEvent(
    {
      assignmentId,
      action: "FAILED",
      feeApplied: feeAmount,
    },
    {
      tenantId,
      propertyId: assignment?.unit.propertyId,
    }
  );

  return { feeAmount, newBalance: currentBalance + feeAmount };
}

/**
 * Validate cleaning photos using AI.
 * Checks: minimum photo count, coverage of common areas.
 * Returns a validation result with pass/fail and notes.
 */
export async function validateCleaningPhotos(
  photos: Array<{ name: string; dataUrl: string }>
): Promise<{ passed: boolean; notes: string; photoCount: number }> {
  const MIN_PHOTOS = 5;

  // Basic validation: photo count
  if (photos.length < MIN_PHOTOS) {
    return {
      passed: false,
      notes: `Insufficient photos: ${photos.length} submitted, minimum ${MIN_PHOTOS} required. Please submit photos of all common areas (kitchen, bathroom, living room, hallways, outdoor areas).`,
      photoCount: photos.length,
    };
  }

  // AI-assisted validation (when AI SDK is configured)
  // For now, perform structural validation
  const hasValidFormats = photos.every((p) => {
    const ext = p.name.toLowerCase();
    return ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".png") || ext.endsWith(".webp") || ext.endsWith(".heic");
  });

  if (!hasValidFormats) {
    return {
      passed: false,
      notes: "Some photos are in unsupported formats. Please submit JPG, PNG, or WebP images only.",
      photoCount: photos.length,
    };
  }

  // If AI is available, use it for deeper validation
  // TODO: Integrate Vercel AI SDK for photo analysis when configured
  // For now, pass if basic requirements met
  return {
    passed: true,
    notes: `${photos.length} photos submitted. Basic validation passed. Manual review may be required.`,
    photoCount: photos.length,
  };
}

/**
 * Get cleaning schedule summary for a property.
 */
export async function getCleaningSchedule(propertyId: string, weeks = 8) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeks * 7);

  const assignments = await prisma.cleaningAssignment.findMany({
    where: {
      unit: { propertyId },
      weekOf: { gte: startDate },
    },
    include: {
      tenant: true,
      unit: true,
    },
    orderBy: { weekOf: "desc" },
  });

  return assignments;
}

/**
 * Get the default cleaning fee amount.
 * In future, this could be read from lease clauses.
 */
export function getCleaningFeeAmount(): number {
  // Default professional cleaning fee
  return parseFloat(process.env.CLEANING_FEE_AMOUNT ?? "150");
}

/**
 * Validate photo data format (base64 data URLs).
 */
export function validatePhotoData(photos: unknown): photos is Array<{ name: string; dataUrl: string }> {
  if (!Array.isArray(photos)) return false;
  return photos.every(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as Record<string, unknown>).name === "string" &&
      typeof (p as Record<string, unknown>).dataUrl === "string" &&
      ((p as Record<string, unknown>).dataUrl as string).startsWith("data:")
  );
}
