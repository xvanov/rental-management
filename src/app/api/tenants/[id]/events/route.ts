import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const events = await prisma.event.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const total = await prisma.event.count({
      where: { tenantId: id },
    });

    return NextResponse.json({ events, total });
  } catch (error) {
    console.error("Failed to fetch tenant events:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenant events" },
      { status: 500 }
    );
  }
}
