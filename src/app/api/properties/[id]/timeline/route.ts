import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";
import { getEventsByProperty } from "@/lib/events";
import { EventType } from "@/generated/prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { id } = await params;

    // Verify property belongs to org
    const property = await prisma.property.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as EventType | null;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const events = await getEventsByProperty(id, {
      type: type ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("Failed to fetch property timeline:", error);
    return NextResponse.json(
      { error: "Failed to fetch property timeline" },
      { status: 500 }
    );
  }
}
