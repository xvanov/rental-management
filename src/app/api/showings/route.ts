import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { getQueue } from "@/lib/jobs";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {
      property: { organizationId: ctx.organizationId },
    };

    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate);
    }

    const showings = await prisma.showing.findMany({
      where,
      include: {
        property: {
          select: { id: true, address: true, city: true },
        },
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(showings);
  } catch (error) {
    console.error("Failed to fetch showings:", error);
    return NextResponse.json(
      { error: "Failed to fetch showings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { propertyId, date, attendeeName, attendeePhone, attendeeEmail, notes } = body;

    if (!propertyId || !date) {
      return NextResponse.json(
        { error: "propertyId and date are required" },
        { status: 400 }
      );
    }

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id: propertyId, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const showing = await prisma.showing.create({
      data: {
        propertyId,
        date: new Date(date),
        attendeeName: attendeeName || null,
        attendeePhone: attendeePhone || null,
        attendeeEmail: attendeeEmail || null,
        notes: notes || null,
      },
      include: {
        property: {
          select: { id: true, address: true, city: true },
        },
      },
    });

    // Log as immutable event
    await createEvent({
      type: "SHOWING",
      payload: {
        showingId: showing.id,
        action: "SCHEDULED",
        date: showing.date.toISOString(),
        attendeeName: showing.attendeeName || undefined,
      },
      propertyId,
    });

    // Schedule a reminder job 1 hour before the showing
    const showingDate = new Date(date);
    const reminderTime = new Date(showingDate.getTime() - 60 * 60 * 1000); // 1 hour before
    const now = new Date();

    if (reminderTime > now) {
      const delay = reminderTime.getTime() - now.getTime();
      const showingQueue = getQueue("showings");
      await showingQueue.add(
        "showing-reminder",
        {
          showingId: showing.id,
          propertyId,
          attendeeName: showing.attendeeName,
          attendeePhone: showing.attendeePhone,
          date: showing.date.toISOString(),
        },
        { delay, jobId: `reminder-${showing.id}` }
      );
    }

    return NextResponse.json(showing, { status: 201 });
  } catch (error) {
    console.error("Failed to create showing:", error);
    return NextResponse.json(
      { error: "Failed to create showing" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, status, notes } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["SCHEDULED", "CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Verify showing belongs to org via property
    const existing = await prisma.showing.findFirst({
      where: { id, property: { organizationId: ctx.organizationId } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Showing not found" },
        { status: 404 }
      );
    }

    const showing = await prisma.showing.update({
      where: { id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: {
        property: {
          select: { id: true, address: true, city: true },
        },
      },
    });

    // Log status change as event
    await createEvent({
      type: "SHOWING",
      payload: {
        showingId: showing.id,
        action: status as "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED",
        date: showing.date.toISOString(),
        attendeeName: showing.attendeeName || undefined,
      },
      propertyId: showing.propertyId,
    });

    return NextResponse.json(showing);
  } catch (error) {
    console.error("Failed to update showing:", error);
    return NextResponse.json(
      { error: "Failed to update showing" },
      { status: 500 }
    );
  }
}
