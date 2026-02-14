import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createEvent } from "@/lib/events";
import {
  enqueueDispositionNotice,
  enqueueGroupChatRemove,
  startMoveOutFlowWorker,
  getDepositAmount,
  getDepositReturnDeadline,
  generateDispositionNoticeContent,
} from "@/lib/jobs/move-out-flow";
import { getAuthContext } from "@/lib/auth-context";

// ─── POST: Generate and send deposit disposition notice ──────────────────────

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, deductions, moveOutDate } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    if (!moveOutDate) {
      return NextResponse.json({ error: "moveOutDate is required" }, { status: 400 });
    }

    // Validate deductions array
    if (!deductions || !Array.isArray(deductions)) {
      return NextResponse.json({ error: "deductions array is required" }, { status: 400 });
    }

    for (const d of deductions) {
      if (!d.description || typeof d.amount !== "number" || d.amount < 0) {
        return NextResponse.json(
          { error: "Each deduction must have a description and non-negative amount" },
          { status: 400 }
        );
      }
    }

    // Fetch tenant, scoped to org
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      include: {
        unit: { include: { property: true } },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (!tenant.unit) {
      return NextResponse.json({ error: "Tenant is not assigned to a unit" }, { status: 400 });
    }

    // Check if disposition already sent
    const existingDisposition = await prisma.notice.findFirst({
      where: {
        tenantId,
        type: "DEPOSIT_DISPOSITION",
        status: { not: "DRAFT" },
      },
    });

    if (existingDisposition) {
      return NextResponse.json(
        { error: "Deposit disposition has already been sent", sentAt: existingDisposition.sentAt },
        { status: 409 }
      );
    }

    const depositAmount = await getDepositAmount(tenantId);
    const totalDeductions = deductions.reduce((sum: number, d: { amount: number }) => sum + d.amount, 0);
    const refundAmount = depositAmount - totalDeductions;
    const jurisdiction = tenant.unit.property.jurisdiction;
    const deadline = getDepositReturnDeadline(moveOutDate, jurisdiction);
    const propertyAddress = `${tenant.unit.property.address}, ${tenant.unit.property.city}, ${tenant.unit.property.state}`;
    const tenantName = `${tenant.firstName} ${tenant.lastName}`;

    // Generate disposition notice content
    const noticeContent = generateDispositionNoticeContent({
      tenantName,
      propertyAddress,
      moveOutDate,
      depositAmount,
      deductions,
      refundAmount,
      deadline,
    });

    // Create the disposition notice record
    const notice = await prisma.notice.create({
      data: {
        tenantId,
        type: "DEPOSIT_DISPOSITION",
        status: "DRAFT",
        content: noticeContent,
      },
    });

    // Apply deposit credit to ledger (return of deposit)
    if (depositAmount > 0) {
      const lastEntry = await prisma.ledgerEntry.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });

      const currentBalance = lastEntry?.balance ?? 0;

      // Record the deposit application as a credit
      await prisma.ledgerEntry.create({
        data: {
          tenantId,
          type: "CREDIT",
          amount: -depositAmount,
          description: `Security deposit applied to account`,
          period: new Date().toISOString().slice(0, 7),
          balance: currentBalance - depositAmount,
        },
      });
    }

    // Start worker and enqueue disposition notice sending
    startMoveOutFlowWorker();
    await enqueueDispositionNotice({
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
      unitId: tenant.unitId!,
      tenantName,
      tenantEmail: tenant.email,
      propertyAddress,
      depositAmount,
      deductions,
      refundAmount,
      noticeId: notice.id,
    });

    // Update unit status to VACANT
    await prisma.unit.update({
      where: { id: tenant.unitId! },
      data: { status: "VACANT" },
    });

    // Deactivate tenant
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        active: false,
        unitId: null,
      },
    });

    // Schedule group chat removal
    await enqueueGroupChatRemove({
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
      tenantName,
    });

    // Log completion event
    await createEvent({
      type: "SYSTEM",
      payload: {
        action: "MOVE_OUT_COMPLETED",
        description: `Move-out completed for ${tenantName}. Deposit: $${depositAmount.toFixed(2)}, Refund: $${refundAmount.toFixed(2)}`,
        metadata: {
          depositAmount,
          totalDeductions,
          refundAmount,
          noticeId: notice.id,
          moveOutDate,
          deadline: deadline.toISOString(),
        },
      },
      tenantId: tenant.id,
      propertyId: tenant.unit.propertyId,
    });

    return NextResponse.json({
      success: true,
      message: `Deposit disposition notice created and queued for delivery`,
      noticeId: notice.id,
      depositAmount,
      totalDeductions,
      refundAmount,
      deadline: deadline.toISOString(),
    }, { status: 201 });
  } catch (error) {
    console.error("[MoveOut/Disposition] POST error:", error);
    return NextResponse.json({ error: "Failed to generate disposition notice" }, { status: 500 });
  }
}

// ─── GET: Get disposition notice status ──────────────────────────────────────

export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    // Verify tenant belongs to org
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    const notice = await prisma.notice.findFirst({
      where: {
        tenantId,
        type: "DEPOSIT_DISPOSITION",
      },
      orderBy: { createdAt: "desc" },
    });

    if (!notice) {
      return NextResponse.json({ exists: false });
    }

    const depositAmount = await getDepositAmount(tenantId);

    return NextResponse.json({
      exists: true,
      noticeId: notice.id,
      status: notice.status,
      content: notice.content,
      sentAt: notice.sentAt,
      createdAt: notice.createdAt,
      depositAmount,
    });
  } catch (error) {
    console.error("[MoveOut/Disposition] GET error:", error);
    return NextResponse.json({ error: "Failed to get disposition data" }, { status: 500 });
  }
}
