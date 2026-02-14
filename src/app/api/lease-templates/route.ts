import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const template = await prisma.leaseTemplate.findFirst({
        where: { id, organizationId: ctx.organizationId },
        include: { leases: { select: { id: true, status: true } } },
      });

      if (!template) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(template);
    }

    const templates = await prisma.leaseTemplate.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { leases: true } },
      },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Failed to fetch lease templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch lease templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { name, content, description, jurisdiction } = body;

    if (!name || !content) {
      return NextResponse.json(
        { error: "Name and content are required" },
        { status: 400 }
      );
    }

    const template = await prisma.leaseTemplate.create({
      data: { name, content, description, jurisdiction, organizationId: ctx.organizationId },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Failed to create lease template:", error);
    return NextResponse.json(
      { error: "Failed to create lease template" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, name, content, description, jurisdiction } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Template id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.leaseTemplate.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description;
    if (jurisdiction !== undefined) updateData.jurisdiction = jurisdiction;

    const template = await prisma.leaseTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(template);
  } catch (error) {
    console.error("Failed to update lease template:", error);
    return NextResponse.json(
      { error: "Failed to update lease template" },
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
        { error: "Template id is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.leaseTemplate.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { _count: { select: { leases: true } } },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (existing._count.leases > 0) {
      return NextResponse.json(
        { error: "Cannot delete template with existing leases" },
        { status: 400 }
      );
    }

    await prisma.leaseTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete lease template:", error);
    return NextResponse.json(
      { error: "Failed to delete lease template" },
      { status: 500 }
    );
  }
}
