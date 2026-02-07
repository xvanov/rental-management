import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const providers = await prisma.utilityProvider.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("Failed to fetch utility providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch utility providers" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, description, website, phone } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "name and type are required" },
        { status: 400 }
      );
    }

    const validTypes = ["electric", "gas", "water", "internet", "trash", "sewer", "other"];
    if (!validTypes.includes(type.toLowerCase())) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const provider = await prisma.utilityProvider.create({
      data: {
        name,
        type: type.toLowerCase(),
        description: description || null,
        website: website || null,
        phone: phone || null,
      },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error) {
    console.error("Failed to create utility provider:", error);
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "A provider with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create utility provider" },
      { status: 500 }
    );
  }
}
