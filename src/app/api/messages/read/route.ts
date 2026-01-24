import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId is required" },
        { status: 400 }
      );
    }

    // Mark all inbound messages from this tenant as read
    const result = await prisma.message.updateMany({
      where: {
        tenantId,
        direction: "INBOUND",
        read: false,
      },
      data: { read: true },
    });

    return NextResponse.json({ marked: result.count });
  } catch (error) {
    console.error("Failed to mark messages as read:", error);
    return NextResponse.json(
      { error: "Failed to mark messages as read" },
      { status: 500 }
    );
  }
}
