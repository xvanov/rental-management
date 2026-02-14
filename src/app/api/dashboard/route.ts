import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const orgId = ctx.organizationId;

    // Reusable scope fragments
    const propScope = { organizationId: orgId };
    const unitScope = { property: propScope };
    const tenantScope = { unit: unitScope };
    const tenantDeepScope = { tenant: tenantScope };

    // ─── Key Metrics ──────────────────────────────────────────────────────
    const [
      propertyCount,
      unitCount,
      occupiedUnits,
      activeTenants,
      unreadMessages,
      pendingApplications,
      upcomingShowings,
      activeNotices,
      recentEvents,
      properties,
      ledgerBalance,
      pendingTaskCount,
      pendingTasks,
    ] = await Promise.all([
      // Total properties
      prisma.property.count({ where: propScope }),

      // Total units
      prisma.unit.count({ where: unitScope }),

      // Occupied units
      prisma.unit.count({ where: { status: "OCCUPIED", ...unitScope } }),

      // Active tenants
      prisma.tenant.count({ where: { active: true, ...tenantScope } }),

      // Unread messages
      prisma.message.count({
        where: { read: false, direction: "INBOUND", ...tenantDeepScope },
      }),

      // Pending applications
      prisma.application.count({
        where: {
          status: { in: ["PENDING", "UNDER_REVIEW"] },
          ...tenantDeepScope,
        },
      }),

      // Upcoming showings (next 7 days)
      prisma.showing.findMany({
        where: {
          date: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          property: propScope,
        },
        include: {
          property: { select: { address: true } },
        },
        orderBy: { date: "asc" },
        take: 5,
      }),

      // Active enforcement notices
      prisma.notice.findMany({
        where: {
          status: { in: ["DRAFT", "SENT"] },
          ...tenantDeepScope,
        },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),

      // Recent events (last 10)
      prisma.event.findMany({
        where: { property: propScope },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          tenant: { select: { firstName: true, lastName: true } },
        },
      }),

      // Properties with units for summary cards
      prisma.property.findMany({
        where: propScope,
        include: {
          units: {
            include: {
              tenants: {
                where: { active: true },
                select: { id: true },
              },
            },
          },
        },
      }),

      // Outstanding balances: sum of latest ledger entries per tenant
      prisma.ledgerEntry.groupBy({
        by: ["tenantId"],
        where: tenantDeepScope,
        _max: { createdAt: true },
      }),

      // Pending task count
      prisma.task.count({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] }, property: propScope },
      }),

      // Top 10 pending tasks
      prisma.task.findMany({
        where: { status: { in: ["PENDING", "IN_PROGRESS"] }, property: propScope },
        include: {
          property: { select: { id: true, address: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 10,
      }),
    ]);

    // Calculate outstanding balance from most recent ledger entries
    let outstandingBalance = 0;
    if (ledgerBalance.length > 0) {
      const latestEntries = await prisma.ledgerEntry.findMany({
        where: {
          OR: ledgerBalance.map((entry) => ({
            tenantId: entry.tenantId,
            createdAt: entry._max.createdAt ?? undefined,
          })),
        },
        select: { balance: true },
      });
      outstandingBalance = latestEntries.reduce(
        (sum, entry) => sum + entry.balance,
        0
      );
    }

    // Calculate monthly revenue from active leases
    const activeLeases = await prisma.lease.findMany({
      where: { status: "ACTIVE", unit: unitScope },
      select: { rentAmount: true },
    });
    const monthlyRevenue = activeLeases.reduce(
      (sum, lease) => sum + (lease.rentAmount ?? 0),
      0
    );

    // Calculate occupancy rate
    const occupancyRate = unitCount > 0 ? Math.round((occupiedUnits / unitCount) * 100) : 0;

    // Build property summary cards
    const propertySummaries = properties.map((property) => {
      const totalUnits = property.units.length;
      const occupied = property.units.filter(
        (u) => u.status === "OCCUPIED"
      ).length;
      const tenantCount = property.units.reduce(
        (sum, u) => sum + u.tenants.length,
        0
      );
      return {
        id: property.id,
        address: property.address,
        city: property.city,
        state: property.state,
        totalUnits,
        occupiedUnits: occupied,
        occupancyRate: totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0,
        tenantCount,
      };
    });

    // Build action items
    const actionItems: Array<{
      type: string;
      label: string;
      count: number;
      href: string;
      priority: "high" | "medium" | "low";
    }> = [];

    if (unreadMessages > 0) {
      actionItems.push({
        type: "messages",
        label: "Unread messages",
        count: unreadMessages,
        href: "/dashboard/inbox",
        priority: "high",
      });
    }

    if (pendingApplications > 0) {
      actionItems.push({
        type: "applications",
        label: "Pending applications",
        count: pendingApplications,
        href: "/dashboard/applications",
        priority: "high",
      });
    }

    if (activeNotices.length > 0) {
      actionItems.push({
        type: "enforcement",
        label: "Active enforcement notices",
        count: activeNotices.length,
        href: "/dashboard/enforcement",
        priority: "medium",
      });
    }

    if (upcomingShowings.length > 0) {
      actionItems.push({
        type: "showings",
        label: "Upcoming showings",
        count: upcomingShowings.length,
        href: "/dashboard/calendar",
        priority: "low",
      });
    }

    // Overdue payments: tenants with positive balance
    if (outstandingBalance > 0) {
      actionItems.push({
        type: "payments",
        label: "Outstanding balances",
        count: ledgerBalance.length,
        href: "/dashboard/payments",
        priority: "high",
      });
    }

    if (pendingTaskCount > 0) {
      actionItems.push({
        type: "tasks",
        label: "Pending tasks",
        count: pendingTaskCount,
        href: "/dashboard/tasks",
        priority: "medium",
      });
    }

    return NextResponse.json({
      metrics: {
        propertyCount,
        unitCount,
        occupiedUnits,
        occupancyRate,
        activeTenants,
        monthlyRevenue,
        outstandingBalance,
        unreadMessages,
      },
      actionItems,
      upcomingShowings: upcomingShowings.map((s) => ({
        id: s.id,
        date: s.date,
        attendeeName: s.attendeeName,
        attendeePhone: s.attendeePhone,
        status: s.status,
        property: s.property?.address,
      })),
      enforcementDeadlines: activeNotices.map((n) => ({
        id: n.id,
        type: n.type,
        status: n.status,
        tenantName: n.tenant
          ? `${n.tenant.firstName} ${n.tenant.lastName}`
          : "Unknown",
        createdAt: n.createdAt,
      })),
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        type: e.type,
        tenantName: e.tenant
          ? `${e.tenant.firstName} ${e.tenant.lastName}`
          : null,
        createdAt: e.createdAt,
        payload: e.payload,
      })),
      propertySummaries,
      tasks: pendingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        source: t.source,
        dueDate: t.dueDate,
        property: t.property?.address ?? null,
        propertyId: t.propertyId,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
