import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, propertyId, rentAmount } = body;

    if (!name || !propertyId) {
      return NextResponse.json(
        { error: "Name and propertyId are required" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.create({
      data: {
        name,
        propertyId,
        rentAmount: rentAmount ? parseFloat(rentAmount) : null,
      },
      include: {
        tenants: {
          where: { active: true },
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    console.error("Failed to create unit:", error);
    return NextResponse.json(
      { error: "Failed to create unit" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, status, rentAmount } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Unit ID is required" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(status !== undefined && { status }),
        ...(rentAmount !== undefined && {
          rentAmount: rentAmount ? parseFloat(rentAmount) : null,
        }),
      },
      include: {
        tenants: {
          where: { active: true },
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json(unit);
  } catch (error) {
    console.error("Failed to update unit:", error);
    return NextResponse.json(
      { error: "Failed to update unit" },
      { status: 500 }
    );
  }
}
