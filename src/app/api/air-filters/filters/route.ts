import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { configId, dimensions, label } = body;

    if (!configId || !dimensions) {
      return NextResponse.json(
        { error: "configId and dimensions are required" },
        { status: 400 }
      );
    }

    // Verify config belongs to org via config -> property chain
    const config = await prisma.airFilterConfig.findFirst({
      where: { id: configId, property: { organizationId: ctx.organizationId } },
    });
    if (!config) {
      return NextResponse.json(
        { error: "Config not found in your organization" },
        { status: 404 }
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
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, dimensions, label } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Filter id is required" },
        { status: 400 }
      );
    }

    // Verify filter belongs to org via filter -> config -> property chain
    const existing = await prisma.airFilter.findFirst({
      where: { id, config: { property: { organizationId: ctx.organizationId } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Filter not found in your organization" },
        { status: 404 }
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
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Filter id is required" },
        { status: 400 }
      );
    }

    // Verify filter belongs to org via filter -> config -> property chain
    const existing = await prisma.airFilter.findFirst({
      where: { id, config: { property: { organizationId: ctx.organizationId } } },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Filter not found in your organization" },
        { status: 404 }
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
