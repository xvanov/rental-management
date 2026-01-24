import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";

// ─── POST: Submit move-out inspection ────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tenantId, notes, photos, deductions } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    // Validate tenant exists and has a terminated/active lease
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        unit: { include: { property: true } },
        leases: { where: { status: { in: ["ACTIVE", "TERMINATED"] } }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (!tenant.unit) {
      return NextResponse.json({ error: "Tenant is not assigned to a unit" }, { status: 400 });
    }

    // Validate photos if provided
    const photoMetadata: Array<{ name: string; submittedAt: string }> = [];
    if (photos && Array.isArray(photos)) {
      for (const photo of photos) {
        if (!photo.name) {
          return NextResponse.json({ error: "Each photo must have a name" }, { status: 400 });
        }
        photoMetadata.push({
          name: photo.name,
          submittedAt: new Date().toISOString(),
        });
      }
    }

    // Validate deductions if provided
    const validatedDeductions: Array<{ description: string; amount: number }> = [];
    if (deductions && Array.isArray(deductions)) {
      for (const deduction of deductions) {
        if (!deduction.description || typeof deduction.amount !== "number" || deduction.amount < 0) {
          return NextResponse.json(
            { error: "Each deduction must have a description and non-negative amount" },
            { status: 400 }
          );
        }
        validatedDeductions.push({
          description: deduction.description,
          amount: deduction.amount,
        });
      }
    }

    // Check if inspection was already completed
    const existingInspection = await prisma.event.findFirst({
      where: {
        tenantId,
        type: "INSPECTION",
        payload: { path: ["inspectionType"], equals: "MOVE_OUT" },
      },
    });

    if (existingInspection) {
      return NextResponse.json(
        { error: "Move-out inspection has already been completed", completedAt: existingInspection.createdAt },
        { status: 409 }
      );
    }

    // Log the inspection event
    await createEvent({
      type: "INSPECTION",
      payload: {
        inspectionType: "MOVE_OUT",
        notes: notes ?? null,
        photos: photoMetadata.map((p) => p.name),
        deductions: validatedDeductions,
      },
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
    });

    // If there are deductions from inspection, add them to ledger
    if (validatedDeductions.length > 0) {
      // Get current balance
      const lastEntry = await prisma.ledgerEntry.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });

      let runningBalance = lastEntry?.balance ?? 0;

      for (const deduction of validatedDeductions) {
        runningBalance += deduction.amount;
        await prisma.ledgerEntry.create({
          data: {
            tenantId,
            type: "DEDUCTION",
            amount: deduction.amount,
            description: `Move-out deduction: ${deduction.description}`,
            period: new Date().toISOString().slice(0, 7),
            balance: runningBalance,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Move-out inspection completed",
      photoCount: photoMetadata.length,
      deductionCount: validatedDeductions.length,
      totalDeductions: validatedDeductions.reduce((sum, d) => sum + d.amount, 0),
    }, { status: 201 });
  } catch (error) {
    console.error("[MoveOut/Inspection] POST error:", error);
    return NextResponse.json({ error: "Failed to submit inspection" }, { status: 500 });
  }
}

// ─── GET: Get inspection status for a tenant ─────────────────────────────────

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const inspectionEvent = await prisma.event.findFirst({
      where: {
        tenantId,
        type: "INSPECTION",
        payload: { path: ["inspectionType"], equals: "MOVE_OUT" },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!inspectionEvent) {
      return NextResponse.json({ completed: false });
    }

    const payload = inspectionEvent.payload as Record<string, unknown>;

    return NextResponse.json({
      completed: true,
      completedAt: inspectionEvent.createdAt,
      notes: payload.notes ?? null,
      photos: payload.photos ?? [],
      deductions: payload.deductions ?? [],
    });
  } catch (error) {
    console.error("[MoveOut/Inspection] GET error:", error);
    return NextResponse.json({ error: "Failed to get inspection data" }, { status: 500 });
  }
}
