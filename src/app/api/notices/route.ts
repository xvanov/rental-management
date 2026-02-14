import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth-context";

/**
 * GET /api/notices - List notices with optional filters
 * Query params: tenantId, type, status, limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "50");
    const offset = parseInt(searchParams.get("offset") ?? "0");

    const where: Prisma.NoticeWhereInput = {
      tenant: { unit: { property: { organizationId: ctx.organizationId } } },
    };
    if (tenantId) where.tenantId = tenantId;
    if (type) where.type = type as Prisma.EnumNoticeTypeFilter;
    if (status) where.status = status as Prisma.EnumNoticeStatusFilter;

    const [notices, total] = await Promise.all([
      prisma.notice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          tenant: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              unitId: true,
              unit: {
                select: {
                  name: true,
                  property: { select: { id: true, address: true } },
                },
              },
            },
          },
        },
      }),
      prisma.notice.count({ where }),
    ]);

    return NextResponse.json({ notices, total });
  } catch (error) {
    console.error("Failed to fetch notices:", error);
    return NextResponse.json(
      { error: "Failed to fetch notices" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notices - Create a notice manually
 * Body: { tenantId, type, content, sendVia? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, type, content, sendVia } = body;

    if (!tenantId || !type || !content) {
      return NextResponse.json(
        { error: "tenantId, type, and content are required" },
        { status: 400 }
      );
    }

    const validTypes = ["LATE_RENT", "LEASE_VIOLATION", "EVICTION_WARNING", "DEPOSIT_DISPOSITION", "MOVE_OUT"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid notice type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify tenant exists and belongs to org
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const notice = await prisma.notice.create({
      data: {
        tenantId,
        type,
        status: "DRAFT",
        content,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Log notice creation event
    await createEvent({
      type: "NOTICE",
      payload: {
        noticeId: notice.id,
        noticeType: type,
        sentVia: sendVia,
        content: `Notice created: ${type}`,
      },
      tenantId,
    });

    return NextResponse.json(notice, { status: 201 });
  } catch (error) {
    console.error("Failed to create notice:", error);
    return NextResponse.json(
      { error: "Failed to create notice" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notices - Update notice status or proof of service
 * Body: { noticeId, status?, proofOfService? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { noticeId, status, proofOfService } = body;

    if (!noticeId) {
      return NextResponse.json(
        { error: "noticeId is required" },
        { status: 400 }
      );
    }

    // Verify notice belongs to org via tenant -> unit -> property
    const existing = await prisma.notice.findFirst({
      where: { id: noticeId, tenant: { unit: { property: { organizationId: ctx.organizationId } } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    }

    const updateData: Prisma.NoticeUpdateInput = {};

    if (status) {
      const validTransitions: Record<string, string[]> = {
        DRAFT: ["SENT"],
        SENT: ["SERVED", "ACKNOWLEDGED"],
        SERVED: ["ACKNOWLEDGED"],
      };

      const allowed = validTransitions[existing.status] ?? [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 }
        );
      }

      updateData.status = status;
      if (status === "SENT") updateData.sentAt = new Date();
      if (status === "SERVED") updateData.servedAt = new Date();
    }

    if (proofOfService) {
      updateData.proofOfService = proofOfService;
      if (!status) {
        updateData.status = "SERVED";
        updateData.servedAt = new Date();
      }
    }

    const updated = await prisma.notice.update({
      where: { id: noticeId },
      data: updateData,
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Log status change event
    await createEvent({
      type: "NOTICE",
      payload: {
        noticeId: updated.id,
        noticeType: updated.type as "LATE_RENT" | "LEASE_VIOLATION" | "EVICTION_WARNING" | "DEPOSIT_DISPOSITION" | "MOVE_OUT",
        sentVia: proofOfService ? "MAIL" : undefined,
        content: `Notice status updated to ${updated.status}${proofOfService ? " with proof of service" : ""}`,
      },
      tenantId: updated.tenantId,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update notice:", error);
    return NextResponse.json(
      { error: "Failed to update notice" },
      { status: 500 }
    );
  }
}
