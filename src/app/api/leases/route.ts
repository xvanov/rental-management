import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const tenantId = searchParams.get("tenantId");
    const status = searchParams.get("status");

    if (id) {
      const lease = await prisma.lease.findUnique({
        where: { id },
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          unit: { include: { property: true } },
          template: { select: { id: true, name: true } },
          clauses: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!lease) {
        return NextResponse.json(
          { error: "Lease not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(lease);
    }

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;

    const leases = await prisma.lease.findMany({
      where,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: { select: { id: true, address: true } } } },
        template: { select: { id: true, name: true } },
        _count: { select: { clauses: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(leases);
  } catch (error) {
    console.error("Failed to fetch leases:", error);
    return NextResponse.json(
      { error: "Failed to fetch leases" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, unitId, templateId, content, rentAmount, startDate, endDate } = body;

    if (!tenantId || !unitId || !content || !startDate) {
      return NextResponse.json(
        { error: "tenantId, unitId, content, and startDate are required" },
        { status: 400 }
      );
    }

    // Check for existing active lease on the same unit
    const existingActive = await prisma.lease.findFirst({
      where: {
        unitId,
        status: { in: ["ACTIVE", "PENDING_SIGNATURE"] },
      },
    });

    // Determine version (increment if tenant has previous leases for this unit)
    const previousLeases = await prisma.lease.count({
      where: { tenantId, unitId },
    });

    const lease = await prisma.lease.create({
      data: {
        tenantId,
        unitId,
        templateId: templateId || null,
        content,
        rentAmount: rentAmount ? parseFloat(rentAmount) : null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        version: previousLeases + 1,
        status: existingActive ? "DRAFT" : "DRAFT",
      },
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: true } },
      },
    });

    await createEvent({
      type: "LEASE",
      payload: {
        leaseId: lease.id,
        action: "CREATED",
        version: lease.version,
      },
      tenantId: lease.tenantId,
      propertyId: lease.unit.propertyId,
    });

    return NextResponse.json(lease, { status: 201 });
  } catch (error) {
    console.error("Failed to create lease:", error);
    return NextResponse.json(
      { error: "Failed to create lease" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, content, rentAmount, startDate, endDate, signedAt, signedDocumentUrl } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Lease id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.lease.findUnique({
      where: { id },
      include: { unit: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (content !== undefined) updateData.content = content;
    if (rentAmount !== undefined) updateData.rentAmount = rentAmount ? parseFloat(rentAmount) : null;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (signedAt !== undefined) updateData.signedAt = signedAt ? new Date(signedAt) : null;
    if (signedDocumentUrl !== undefined) updateData.signedDocumentUrl = signedDocumentUrl;


    // Handle status transitions
    if (status) {
      const validTransitions: Record<string, string[]> = {
        DRAFT: ["PENDING_SIGNATURE", "TERMINATED"],
        PENDING_SIGNATURE: ["ACTIVE", "DRAFT", "TERMINATED"],
        ACTIVE: ["EXPIRED", "TERMINATED"],
        EXPIRED: [],
        TERMINATED: [],
      };

      const allowed = validTransitions[existing.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 }
        );
      }

      updateData.status = status;

      if (status === "ACTIVE" && !existing.signedAt) {
        updateData.signedAt = new Date();
      }
    }

    const lease = await prisma.lease.update({
      where: { id },
      data: updateData,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { property: true } },
      },
    });

    // Log event for status changes
    if (status) {
      const actionMap: Record<string, "CREATED" | "SIGNED" | "RENEWED" | "TERMINATED" | "EXPIRED"> = {
        ACTIVE: "SIGNED",
        TERMINATED: "TERMINATED",
        EXPIRED: "EXPIRED",
        PENDING_SIGNATURE: "CREATED",
      };

      const action = actionMap[status] || "CREATED";

      await createEvent({
        type: "LEASE",
        payload: {
          leaseId: lease.id,
          action,
          version: lease.version,
        },
        tenantId: lease.tenantId,
        propertyId: lease.unit.propertyId,
      });
    }

    return NextResponse.json(lease);
  } catch (error) {
    console.error("Failed to update lease:", error);
    return NextResponse.json(
      { error: "Failed to update lease" },
      { status: 500 }
    );
  }
}
