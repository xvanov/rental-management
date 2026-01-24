import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const properties = await prisma.property.findMany({
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
    const body = await request.json();
    const { address, city, state, zip, jurisdiction } = body;

    if (!address || !city || !state || !zip || !jurisdiction) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const property = await prisma.property.create({
      data: { address, city, state, zip, jurisdiction },
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
