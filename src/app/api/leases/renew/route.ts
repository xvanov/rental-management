import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth-context";
import { createEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { leaseId, startDate, endDate, rentAmount, content } = body;

    if (!leaseId) {
      return NextResponse.json(
        { error: "leaseId is required" },
        { status: 400 }
      );
    }

    // Fetch the existing lease with all details
    const existingLease = await prisma.lease.findFirst({
      where: {
        id: leaseId,
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        clauses: true,
        template: true,
      },
    });

    if (!existingLease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    // Can only renew ACTIVE or EXPIRED leases
    if (!["ACTIVE", "EXPIRED"].includes(existingLease.status)) {
      return NextResponse.json(
        { error: `Cannot renew a ${existingLease.status} lease. Only ACTIVE or EXPIRED leases can be renewed.` },
        { status: 400 }
      );
    }

    // Calculate defaults for the new lease
    const oldEndDate = existingLease.endDate;
    const oldStartDate = existingLease.startDate;

    // Default start: day after old lease ends (or today if no end date)
    let newStartDate: Date;
    if (startDate) {
      newStartDate = new Date(startDate);
    } else if (oldEndDate) {
      newStartDate = new Date(oldEndDate);
      newStartDate.setDate(newStartDate.getDate() + 1);
    } else {
      newStartDate = new Date();
    }

    // Default end: same term length as original
    let newEndDate: Date | null = null;
    if (endDate) {
      newEndDate = new Date(endDate);
    } else if (oldEndDate && oldStartDate) {
      const termMs = oldEndDate.getTime() - oldStartDate.getTime();
      newEndDate = new Date(newStartDate.getTime() + termMs);
    }

    // Default rent: same as original
    const newRentAmount = rentAmount != null ? parseFloat(rentAmount) : existingLease.rentAmount;

    // Default content: copy from original, updating rent if changed
    let newContent = content || existingLease.content;
    if (!content && newRentAmount && existingLease.rentAmount && newRentAmount !== existingLease.rentAmount) {
      // Replace old rent amount with new in the content
      const oldRentStr = `$${existingLease.rentAmount.toFixed(2)}`;
      const newRentStr = `$${newRentAmount.toFixed(2)}`;
      newContent = newContent.replace(new RegExp(oldRentStr.replace("$", "\\$"), "g"), newRentStr);
    }

    // Determine version
    const previousLeases = await prisma.lease.count({
      where: {
        tenantId: existingLease.tenantId,
        unitId: existingLease.unitId,
      },
    });

    // Create the renewal lease
    const renewedLease = await prisma.lease.create({
      data: {
        tenantId: existingLease.tenantId,
        unitId: existingLease.unitId,
        templateId: existingLease.templateId,
        content: newContent,
        rentAmount: newRentAmount,
        startDate: newStartDate,
        endDate: newEndDate,
        version: previousLeases + 1,
        status: "DRAFT",
      },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: { select: { id: true, address: true, city: true, state: true } } } },
      },
    });

    // Copy clauses from the original lease, updating rent metadata
    if (existingLease.clauses.length > 0) {
      for (const clause of existingLease.clauses) {
        let metadata = clause.metadata as Record<string, unknown> | null;

        // Update rent-related clause metadata
        if (clause.type === "RENT" && metadata && newRentAmount) {
          metadata = { ...metadata, amount: newRentAmount };
        }

        await prisma.leaseClause.create({
          data: {
            leaseId: renewedLease.id,
            type: clause.type,
            content: clause.content,
            metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
          },
        });
      }
    }

    // Log event
    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: renewedLease.id,
        action: "RENEWED",
        previousLeaseId: existingLease.id,
        previousVersion: existingLease.version,
        version: renewedLease.version,
      },
      tenantId: existingLease.tenantId || undefined,
      propertyId: existingLease.unit?.propertyId,
    });

    return NextResponse.json(renewedLease, { status: 201 });
  } catch (error) {
    console.error("Failed to renew lease:", error);
    return NextResponse.json(
      { error: "Failed to renew lease" },
      { status: 500 }
    );
  }
}
