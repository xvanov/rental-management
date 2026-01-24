import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logCleaningEvent } from "@/lib/events";
import { generateWeeklyAssignments, validateCleaningPhotos, validatePhotoData } from "@/lib/cleaning/schedule";
import { enqueueCleaningReminder } from "@/lib/jobs/cleaning";

// GET - List cleaning assignments with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const tenantId = searchParams.get("tenantId");
    const propertyId = searchParams.get("propertyId");
    const weekOf = searchParams.get("weekOf");
    const token = searchParams.get("token");

    // Public access by token (for tenant submission page)
    if (token) {
      const assignment = await prisma.cleaningAssignment.findUnique({
        where: { token },
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true } },
          unit: { include: { property: { select: { id: true, address: true, city: true } } } },
        },
      });

      if (!assignment) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      return NextResponse.json(assignment);
    }

    // Build where clause
    const where: Prisma.CleaningAssignmentWhereInput = {};

    if (status && status !== "all") {
      where.status = status as Prisma.CleaningAssignmentWhereInput["status"];
    }

    if (tenantId) {
      where.tenantId = tenantId;
    }

    if (propertyId) {
      where.unit = { propertyId };
    }

    if (weekOf) {
      where.weekOf = new Date(weekOf);
    }

    const assignments = await prisma.cleaningAssignment.findMany({
      where,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        unit: { include: { property: { select: { id: true, address: true } } } },
      },
      orderBy: { weekOf: "desc" },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("Error fetching cleaning assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch cleaning assignments" },
      { status: 500 }
    );
  }
}

// POST - Create assignments or submit photos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Generate weekly assignments for all properties
    if (action === "generate") {
      const weekOf = body.weekOf ? new Date(body.weekOf) : undefined;
      const created = await generateWeeklyAssignments(weekOf);

      // Schedule reminders for each assignment (Sunday morning)
      for (const assignment of created) {
        const fullAssignment = await prisma.cleaningAssignment.findUnique({
          where: { id: assignment.assignmentId },
          include: {
            tenant: true,
            unit: { include: { property: true } },
          },
        });

        if (fullAssignment) {
          await enqueueCleaningReminder({
            assignmentId: fullAssignment.id,
            tenantId: fullAssignment.tenantId,
            propertyId: fullAssignment.unit.propertyId,
            tenantName: `${fullAssignment.tenant.firstName} ${fullAssignment.tenant.lastName}`,
            tenantPhone: fullAssignment.tenant.phone,
            tenantEmail: fullAssignment.tenant.email,
            weekOf: fullAssignment.weekOf.toISOString(),
            token: fullAssignment.token,
          });
        }
      }

      return NextResponse.json({ created, count: created.length }, { status: 201 });
    }

    // Submit photos for an assignment (by token)
    if (action === "submit") {
      const { token, photos } = body;

      if (!token) {
        return NextResponse.json({ error: "Token is required" }, { status: 400 });
      }

      if (!photos || !validatePhotoData(photos)) {
        return NextResponse.json(
          { error: "Photos must be an array of { name, dataUrl } objects" },
          { status: 400 }
        );
      }

      const assignment = await prisma.cleaningAssignment.findUnique({
        where: { token },
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      });

      if (!assignment) {
        return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
      }

      if (assignment.status !== "PENDING") {
        return NextResponse.json(
          { error: `Assignment is already ${assignment.status.toLowerCase()}` },
          { status: 400 }
        );
      }

      // Validate photos
      const validation = await validateCleaningPhotos(photos);

      // Store photo metadata (without full data URLs to save space)
      const photoMetadata = photos.map((p) => ({
        name: p.name,
        submittedAt: new Date().toISOString(),
      }));

      if (validation.passed) {
        // Update assignment as submitted
        await prisma.cleaningAssignment.update({
          where: { id: assignment.id },
          data: {
            status: "SUBMITTED",
            photos: photoMetadata as unknown as Prisma.InputJsonValue,
            notes: validation.notes,
          },
        });

        await logCleaningEvent(
          {
            assignmentId: assignment.id,
            action: "SUBMITTED",
            photoCount: photos.length,
          },
          {
            tenantId: assignment.tenantId,
            propertyId: assignment.unit.propertyId,
          }
        );

        return NextResponse.json({
          success: true,
          status: "SUBMITTED",
          message: validation.notes,
        });
      } else {
        // Submission doesn't meet requirements
        return NextResponse.json({
          success: false,
          status: "REJECTED",
          message: validation.notes,
        });
      }
    }

    // Manual assignment creation
    const { tenantId, unitId, weekOf: manualWeekOf } = body;

    if (!tenantId || !unitId) {
      return NextResponse.json(
        { error: "tenantId and unitId are required" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId }, include: { property: true } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const assignment = await prisma.cleaningAssignment.create({
      data: {
        tenantId,
        unitId,
        weekOf: manualWeekOf ? new Date(manualWeekOf) : new Date(),
        status: "PENDING",
      },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: { select: { id: true, address: true } } } },
      },
    });

    await logCleaningEvent(
      { assignmentId: assignment.id, action: "ASSIGNED" },
      { tenantId, propertyId: unit.propertyId }
    );

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    console.error("Error in cleaning assignments POST:", error);
    return NextResponse.json(
      { error: "Failed to process cleaning assignment" },
      { status: 500 }
    );
  }
}

// PATCH - Update assignment status (validate, fail, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const assignment = await prisma.cleaningAssignment.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: { include: { property: true } },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const updateData: Prisma.CleaningAssignmentUpdateInput = {};

    if (status) {
      updateData.status = status;

      if (status === "VALIDATED") {
        updateData.validatedAt = new Date();
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updated = await prisma.cleaningAssignment.update({
      where: { id },
      data: updateData,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: { select: { id: true, address: true } } } },
      },
    });

    // Log event based on status change
    if (status === "VALIDATED") {
      await logCleaningEvent(
        {
          assignmentId: id,
          action: "VALIDATED",
          photoCount: Array.isArray(assignment.photos) ? (assignment.photos as unknown[]).length : 0,
        },
        { tenantId: assignment.tenantId, propertyId: assignment.unit.propertyId }
      );
    } else if (status === "FAILED") {
      await logCleaningEvent(
        { assignmentId: id, action: "FAILED" },
        { tenantId: assignment.tenantId, propertyId: assignment.unit.propertyId }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating cleaning assignment:", error);
    return NextResponse.json(
      { error: "Failed to update cleaning assignment" },
      { status: 500 }
    );
  }
}
