import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const search = searchParams.get("search");

    if (id) {
      const tenant = await prisma.tenant.findUnique({
        where: { id },
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

    const where: Record<string, unknown> = { active: true };

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
    const body = await request.json();
    const { firstName, lastName, email, phone, unitId } = body;

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required" },
        { status: 400 }
      );
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
