import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { configId, dimensions, label } = body;

    if (!configId || !dimensions) {
      return NextResponse.json(
        { error: "configId and dimensions are required" },
        { status: 400 }
      );
    }

    const filter = await prisma.airFilter.create({
      data: {
        configId,
        dimensions,
        label: label || null,
      },
    });

    return NextResponse.json(filter, { status: 201 });
  } catch (error) {
    console.error("Failed to create air filter:", error);
    return NextResponse.json(
      { error: "Failed to create air filter" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, dimensions, label } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Filter id is required" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (dimensions !== undefined) data.dimensions = dimensions;
    if (label !== undefined) data.label = label || null;

    const filter = await prisma.airFilter.update({
      where: { id },
      data,
    });

    return NextResponse.json(filter);
  } catch (error) {
    console.error("Failed to update air filter:", error);
    return NextResponse.json(
      { error: "Failed to update air filter" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Filter id is required" },
        { status: 400 }
      );
    }

    await prisma.airFilter.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete air filter:", error);
    return NextResponse.json(
      { error: "Failed to delete air filter" },
      { status: 500 }
    );
  }
}
