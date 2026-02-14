import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAvailableSlots, isCalendarConfigured } from "@/lib/integrations/google-calendar";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
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

    // Default to next 7 days if no dates provided
    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate
      ? new Date(endDate)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Get existing showings for this property in the date range
    const existingShowings = await prisma.showing.findMany({
      where: {
        propertyId,
        date: { gte: start, lte: end },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      select: { date: true },
    });

    let slots: Array<{ start: string; end: string }>;

    if (isCalendarConfigured()) {
      // Get available slots from Google Calendar
      const available = await getAvailableSlots(start, end);
      slots = available.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      }));
    } else {
      // Generate default slots (9 AM - 6 PM, 30-min intervals) without calendar check
      slots = [];
      const current = new Date(start);
      current.setHours(0, 0, 0, 0);

      while (current <= end) {
        if (current >= new Date()) {
          for (let hour = 9; hour < 18; hour++) {
            for (let min = 0; min < 60; min += 30) {
              const slotStart = new Date(current);
              slotStart.setHours(hour, min, 0, 0);

              if (slotStart > new Date()) {
                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + 30);

                slots.push({
                  start: slotStart.toISOString(),
                  end: slotEnd.toISOString(),
                });
              }
            }
          }
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Remove slots that already have showings scheduled
    const bookedTimes = new Set(
      existingShowings.map((s) => s.date.toISOString())
    );

    const availableSlots = slots.filter(
      (slot) => !bookedTimes.has(slot.start)
    );

    return NextResponse.json({
      propertyId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      slots: availableSlots,
      calendarIntegrated: isCalendarConfigured(),
    });
  } catch (error) {
    console.error("Failed to fetch availability:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
