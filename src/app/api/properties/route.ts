import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const properties = await prisma.property.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        units: {
          include: {
            tenants: {
              where: { active: true },
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(properties);
  } catch (error) {
    console.error("Failed to fetch properties:", error);
    return NextResponse.json(
      { error: "Failed to fetch properties" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { address, city, state, zip, jurisdiction } = body;

    if (!address || !city || !state || !zip || !jurisdiction) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const property = await prisma.property.create({
      data: { address, city, state, zip, jurisdiction, organizationId: ctx.organizationId },
      include: { units: true },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error("Failed to create property:", error);
    return NextResponse.json(
      { error: "Failed to create property" },
      { status: 500 }
    );
  }
}
