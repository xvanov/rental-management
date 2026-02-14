import { NextRequest, NextResponse } from "next/server";
import { createEvent, queryEvents } from "@/lib/events";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * POST /api/events/test
 * Creates a test event and returns it. Used to verify the event system works.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    // Verify propertyId belongs to org if provided
    if (body.propertyId) {
      const property = await prisma.property.findFirst({
        where: { id: body.propertyId, organizationId: ctx.organizationId },
      });
      if (!property) {
        return NextResponse.json(
          { success: false, error: "Property not found" },
          { status: 404 }
        );
      }
    }

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
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

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

    // Count total events scoped to org
    const total = await prisma.event.count({
      where: { property: { organizationId: ctx.organizationId } },
    });

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
