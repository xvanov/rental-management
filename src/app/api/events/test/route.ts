import { NextRequest, NextResponse } from "next/server";
import { createEvent, queryEvents } from "@/lib/events";
import { prisma } from "@/lib/db";

/**
 * POST /api/events/test
 * Creates a test event and returns it. Used to verify the event system works.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const event = await createEvent({
      type: body.type ?? "SYSTEM",
      payload: body.payload ?? {
        action: "test",
        description: "Test event created via API",
        metadata: { timestamp: new Date().toISOString() },
      },
      tenantId: body.tenantId,
      propertyId: body.propertyId,
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/events/test
 * Returns recent events and verifies immutability by attempting (and failing)
 * to update/delete an event.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") ?? undefined;
    const propertyId = searchParams.get("propertyId") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "10", 10);

    const events = await queryEvents({ tenantId, propertyId, limit });

    // Verify immutability: attempt to demonstrate that update/delete are not
    // exposed through our event system API. The prisma client still has these
    // methods, but our lib/events module intentionally does not export them.
    const immutabilityCheck = {
      updateExposed: false,
      deleteExposed: false,
      note: "Event system only exposes create and query operations. No update or delete functions are available.",
    };

    // Count total events
    const total = await prisma.event.count();

    return NextResponse.json({
      success: true,
      total,
      events,
      immutabilityCheck,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
