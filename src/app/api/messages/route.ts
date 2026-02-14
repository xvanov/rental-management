import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logMessageEvent } from "@/lib/events";
import { sendSms } from "@/lib/integrations/twilio";
import { sendEmail } from "@/lib/integrations/sendgrid";
import { sendFacebookMessage, isFacebookConfigured } from "@/lib/integrations/facebook";
import { getAuthContext } from "@/lib/auth-context";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const channel = searchParams.get("channel");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    if (tenantId) {
      // Verify tenant belongs to this org
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
        select: { id: true },
      });
      if (!tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }

      // Get conversation messages for a specific tenant
      const where: Record<string, unknown> = { tenantId };
      if (channel) where.channel = channel;

      const messages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: "asc" },
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      });

      return NextResponse.json(messages);
    }

    // Get conversation list (grouped by tenant with latest message)
    const conversations = await prisma.tenant.findMany({
      where: {
        messages: { some: {} },
        unit: { property: { organizationId: ctx.organizationId } },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            messages: unreadOnly
              ? { where: { read: false, direction: "INBOUND" } }
              : true,
          },
        },
        unit: {
          include: {
            property: { select: { id: true, address: true } },
          },
        },
      },
      orderBy: {
        messages: { _count: "desc" },
      },
    });

    // Sort by latest message date
    const sorted = conversations.sort((a, b) => {
      const aDate = a.messages[0]?.createdAt ?? new Date(0);
      const bDate = b.messages[0]?.createdAt ?? new Date(0);
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    // Get unread counts per tenant
    const unreadCounts = await prisma.message.groupBy({
      by: ["tenantId"],
      where: { read: false, direction: "INBOUND", tenant: { unit: { property: { organizationId: ctx.organizationId } } } },
      _count: { id: true },
    });

    const unreadMap = new Map(
      unreadCounts.map((u) => [u.tenantId, u._count.id])
    );

    const result = sorted.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      phone: tenant.phone,
      email: tenant.email,
      unit: tenant.unit,
      lastMessage: tenant.messages[0] ?? null,
      unreadCount: unreadMap.get(tenant.id) ?? 0,
      totalMessages: tenant._count.messages,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { tenantId, channel, content } = body;

    if (!tenantId || !channel || !content) {
      return NextResponse.json(
        { error: "tenantId, channel, and content are required" },
        { status: 400 }
      );
    }

    if (!["SMS", "EMAIL", "FACEBOOK"].includes(channel)) {
      return NextResponse.json(
        { error: "Invalid channel. Must be SMS, EMAIL, or FACEBOOK" },
        { status: 400 }
      );
    }

    // Get tenant info for event logging (scoped to org)
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, unit: { property: { organizationId: ctx.organizationId } } },
      select: { id: true, phone: true, email: true, unitId: true, unit: { select: { propertyId: true } } },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Implement channel switching rule: if phone is available, default to SMS
    const effectiveChannel = tenant.phone && channel !== "EMAIL" ? "SMS" : channel;

    // If SMS channel and Twilio is configured, send via Twilio
    if (effectiveChannel === "SMS" && tenant.phone && process.env.TWILIO_ACCOUNT_SID) {
      const result = await sendSms({
        to: tenant.phone,
        body: content,
        tenantId,
        propertyId: tenant.unit?.propertyId,
      });

      // Fetch the message with tenant info for response
      const messageWithTenant = await prisma.message.findUnique({
        where: { id: result.message.id },
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      });

      return NextResponse.json(messageWithTenant, { status: 201 });
    }

    // If EMAIL channel and SendGrid is configured, send via SendGrid
    if (effectiveChannel === "EMAIL" && tenant.email && process.env.SENDGRID_API_KEY) {
      const subject = body.subject ?? "Message from Rental Ops";
      const result = await sendEmail({
        to: tenant.email,
        subject,
        text: content,
        html: body.html,
        tenantId,
        propertyId: tenant.unit?.propertyId,
      });

      // Fetch the message with tenant info for response
      const messageWithTenant = await prisma.message.findUnique({
        where: { id: result.message.id },
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      });

      return NextResponse.json(messageWithTenant, { status: 201 });
    }

    // If FACEBOOK channel and Facebook is configured, send via Messenger
    if (effectiveChannel === "FACEBOOK" && isFacebookConfigured()) {
      // Need tenant's facebookId to send via Messenger
      const tenantWithFb = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { facebookId: true },
      });

      if (tenantWithFb?.facebookId) {
        const result = await sendFacebookMessage({
          recipientId: tenantWithFb.facebookId,
          text: content,
          tenantId,
          propertyId: tenant.unit?.propertyId,
        });

        const messageWithTenant = await prisma.message.findUnique({
          where: { id: result.message.id },
          include: {
            tenant: {
              select: { id: true, firstName: true, lastName: true, phone: true, email: true },
            },
          },
        });

        return NextResponse.json(messageWithTenant, { status: 201 });
      }
    }

    // Fallback: create message record without sending (for unconfigured integrations)
    const message = await prisma.message.create({
      data: {
        tenantId,
        channel: effectiveChannel,
        direction: "OUTBOUND",
        content,
        metadata: { sentBy: "operator" },
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
      },
    });

    // Log as immutable event
    await logMessageEvent(
      {
        messageId: message.id,
        channel: effectiveChannel,
        direction: "OUTBOUND",
        content,
        to: effectiveChannel === "SMS" ? tenant.phone ?? undefined : tenant.email ?? undefined,
      },
      {
        tenantId,
        propertyId: tenant.unit?.propertyId,
      }
    );

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Failed to send message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
