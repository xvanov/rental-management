import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const search = searchParams.get("search");

    if (id) {
      const tenant = await prisma.tenant.findFirst({
        where: { id, unit: { property: { organizationId: ctx.organizationId } } },
        include: {
          unit: {
            include: {
              property: { select: { id: true, address: true, city: true, state: true } },
            },
          },
          leases: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          payments: {
            orderBy: { date: "desc" },
            take: 10,
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      return NextResponse.json(tenant);
    }

    const where: Record<string, unknown> = {
      active: true,
      unit: { property: { organizationId: ctx.organizationId } },
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const tenants = await prisma.tenant.findMany({
      where,
      include: {
        unit: {
          include: {
            property: { select: { id: true, address: true } },
          },
        },
        leases: {
          where: { status: "ACTIVE" },
          take: 1,
        },
        payments: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tenants);
  } catch (error) {
    console.error("Failed to fetch tenants:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenants" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { firstName, lastName, email, phone, unitId } = body;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
    }

    // Verify the unit belongs to the user's organization
    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: unitId, property: { organizationId: ctx.organizationId } },
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Unit not found in your organization" },
          { status: 404 }
        );
      }
    }

    const tenant = await prisma.tenant.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        unitId: unitId || null,
      },
      include: {
        unit: {
          include: {
            property: { select: { id: true, address: true } },
          },
        },
      },
    });

    return NextResponse.json(tenant, { status: 201 });
  } catch (error) {
    console.error("Failed to create tenant:", error);
    return NextResponse.json(
      { error: "Failed to create tenant" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { id, firstName, lastName, email, phone, unitId, occupantCount, moveInDate, moveOutDate, active } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Tenant ID is required" },
        { status: 400 }
      );
    }

    // Verify the tenant belongs to the user's organization
    const existingTenant = await prisma.tenant.findFirst({
      where: { id, unit: { property: { organizationId: ctx.organizationId } } },
    });
    if (!existingTenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // If unitId is being changed, verify the new unit belongs to the org
    if (unitId !== undefined && unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: unitId, property: { organizationId: ctx.organizationId } },
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Unit not found in your organization" },
          { status: 404 }
        );
      }
    }

    // Build update data - only include fields that are provided
    const updateData: Record<string, unknown> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (unitId !== undefined) updateData.unitId = unitId || null;
    if (occupantCount !== undefined) updateData.occupantCount = Math.max(1, parseInt(occupantCount) || 1);
    if (moveInDate !== undefined) updateData.moveInDate = moveInDate ? new Date(moveInDate) : null;
    if (moveOutDate !== undefined) updateData.moveOutDate = moveOutDate ? new Date(moveOutDate) : null;
    if (active !== undefined) updateData.active = active;

    const tenant = await prisma.tenant.update({
      where: { id },
      data: updateData,
      include: {
        unit: {
          include: {
            property: { select: { id: true, address: true } },
          },
        },
      },
    });

    return NextResponse.json(tenant);
  } catch (error) {
    console.error("Failed to update tenant:", error);
    return NextResponse.json(
      { error: "Failed to update tenant" },
      { status: 500 }
    );
  }
}
