import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateCourtPacketPdf, CourtPacketData } from "@/lib/pdf/court-packet";
import { createEvent } from "@/lib/events";

/**
 * GET /api/court-packet?tenantId=xxx&startDate=...&endDate=...
 * Generates a court-ready PDF packet for a tenant.
 * Includes: lease, ledger, notices, communications, event timeline.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        unit: {
          include: {
            property: {
              select: { id: true, address: true, city: true, state: true, zip: true },
            },
          },
        },
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }

    // Fetch the active or most recent lease
    const lease = await prisma.lease.findFirst({
      where: { tenantId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    // Build date filter for messages and events
    const dateFilter: { gte?: Date; lte?: Date } | undefined =
      startDate || endDate
        ? {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          }
        : undefined;

    // Fetch ledger entries
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: {
        tenantId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Fetch notices
    const notices = await prisma.notice.findMany({
      where: {
        tenantId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Fetch messages
    const messages = await prisma.message.findMany({
      where: {
        tenantId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    // Fetch events
    const events = await prisma.event.findMany({
      where: {
        tenantId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const packetData: CourtPacketData = {
      tenant: {
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        phone: tenant.phone,
        unit: tenant.unit
          ? {
              name: tenant.unit.name,
              property: {
                address: tenant.unit.property.address,
                city: tenant.unit.property.city,
                state: tenant.unit.property.state,
                zip: tenant.unit.property.zip,
              },
            }
          : null,
      },
      lease: lease
        ? {
            content: lease.content,
            status: lease.status,
            startDate: lease.startDate.toISOString(),
            endDate: lease.endDate?.toISOString() || null,
            rentAmount: lease.rentAmount,
            version: lease.version,
            signedAt: lease.signedAt?.toISOString() || null,
          }
        : null,
      ledger: ledgerEntries.map((e) => ({
        date: e.createdAt.toISOString(),
        period: e.period,
        type: e.type,
        description: e.description,
        amount: e.amount,
        balance: e.balance,
      })),
      notices: notices.map((n) => ({
        type: n.type,
        status: n.status,
        content: n.content,
        sentAt: n.sentAt?.toISOString() || null,
        servedAt: n.servedAt?.toISOString() || null,
        proofOfService: n.proofOfService,
        createdAt: n.createdAt.toISOString(),
      })),
      messages: messages.map((m) => ({
        channel: m.channel,
        direction: m.direction,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      events: events.map((e) => ({
        type: e.type,
        payload: e.payload as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
      dateRange: {
        start: startDate,
        end: endDate,
      },
      generatedAt: new Date().toISOString(),
    };

    // Generate PDF
    const pdfBuffer = await generateCourtPacketPdf(packetData);

    // Log court packet generation as an event
    await createEvent({
      type: "SYSTEM",
      tenantId,
      propertyId: tenant.unit?.property?.id || undefined,
      payload: {
        action: "COURT_PACKET_GENERATED",
        description: "Court evidence packet generated",
        metadata: {
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          dateRange: { start: startDate, end: endDate },
          documentCounts: {
            lease: lease ? 1 : 0,
            ledgerEntries: ledgerEntries.length,
            notices: notices.length,
            messages: messages.length,
            events: events.length,
          },
        },
      },
    });

    const tenantName = `${tenant.firstName}_${tenant.lastName}`.replace(/\s+/g, "_");
    const filename = `court_packet_${tenantName}_${new Date().toISOString().split("T")[0]}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("Failed to generate court packet:", error);
    return NextResponse.json(
      { error: "Failed to generate court packet" },
      { status: 500 }
    );
  }
}
