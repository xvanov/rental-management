import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const count = await prisma.message.count({
      where: {
        direction: "INBOUND",
        read: false,
        tenant: { unit: { property: { organizationId: ctx.organizationId } } },
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Failed to fetch unread count:", error);
    return NextResponse.json({ count: 0 });
  }
}
