import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireAdmin } from "@/lib/auth-context";

/**
 * GET /api/showing-blackouts
 * List all blackout time ranges for the current org, upcoming first.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const blackouts = await prisma.showingBlackout.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { start: "asc" },
  });

  return NextResponse.json(blackouts);
}

/**
 * POST /api/showing-blackouts
 * Add a new blackout range. Admin only.
 * Body: { start: ISO string, end: ISO string, reason?: string }
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json()) as {
    start: string;
    end: string;
    reason?: string;
  };

  if (!body.start || !body.end) {
    return NextResponse.json(
      { error: "start and end are required ISO timestamps" },
      { status: 400 }
    );
  }

  const start = new Date(body.start);
  const end = new Date(body.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json(
      { error: "start and end must be valid dates" },
      { status: 400 }
    );
  }
  if (end <= start) {
    return NextResponse.json(
      { error: "end must be after start" },
      { status: 400 }
    );
  }

  const blackout = await prisma.showingBlackout.create({
    data: {
      organizationId: ctx.organizationId,
      start,
      end,
      reason: body.reason?.trim() || null,
    },
  });
  return NextResponse.json(blackout, { status: 201 });
}

/**
 * DELETE /api/showing-blackouts?id=xxx
 * Remove a blackout. Admin only, scoped to this org.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await prisma.showingBlackout.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.showingBlackout.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
