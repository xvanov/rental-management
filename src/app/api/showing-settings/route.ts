import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireAdmin } from "@/lib/auth-context";
import { getCalendarProvider } from "@/lib/calendar/provider";
import { DEFAULT_SHOWING_HOURS } from "@/lib/calendar/types";

/**
 * GET /api/showing-settings
 * Returns the current org's calendar provider, per-weekday hours, and
 * Google calendar ID (if provider is GOOGLE). Also runs a live config check
 * so the UI can show a connection status badge.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx instanceof NextResponse) return ctx;

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: {
      calendarProvider: true,
      showingHours: true,
      googleCalendarId: true,
    },
  });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const provider = await getCalendarProvider(ctx.organizationId);
  const configured = await provider.isConfigured();

  return NextResponse.json({
    calendarProvider: org.calendarProvider,
    showingHours: org.showingHours ?? DEFAULT_SHOWING_HOURS,
    googleCalendarId: org.googleCalendarId,
    hasGoogleCredentials: Boolean(process.env.GOOGLE_CALENDAR_CREDENTIALS),
    providerConfigured: configured,
  });
}

/**
 * PATCH /api/showing-settings
 * Update calendar provider, hours, or Google calendar ID. Admin only.
 */
export async function PATCH(request: NextRequest) {
  const ctx = await requireAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json()) as {
    calendarProvider?: "INTERNAL" | "GOOGLE";
    showingHours?: Record<string, { start: number; end: number }>;
    googleCalendarId?: string | null;
  };

  const data: Record<string, unknown> = {};

  if (body.calendarProvider) {
    if (!["INTERNAL", "GOOGLE"].includes(body.calendarProvider)) {
      return NextResponse.json(
        { error: "calendarProvider must be INTERNAL or GOOGLE" },
        { status: 400 }
      );
    }
    data.calendarProvider = body.calendarProvider;
  }

  if (body.showingHours !== undefined) {
    // Validate: each entry's end > start, hours in [0, 24].
    for (const [k, v] of Object.entries(body.showingHours)) {
      const day = Number(k);
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        return NextResponse.json(
          { error: `Invalid weekday key: ${k}` },
          { status: 400 }
        );
      }
      if (v.start < 0 || v.start > 24 || v.end < 0 || v.end > 24) {
        return NextResponse.json(
          { error: `Invalid hours for day ${k}: must be 0-24` },
          { status: 400 }
        );
      }
      if (v.end <= v.start) {
        return NextResponse.json(
          { error: `Day ${k}: end hour must be after start hour` },
          { status: 400 }
        );
      }
    }
    data.showingHours = body.showingHours;
  }

  if (body.googleCalendarId !== undefined) {
    data.googleCalendarId = body.googleCalendarId || null;
  }

  const updated = await prisma.organization.update({
    where: { id: ctx.organizationId },
    data,
    select: {
      calendarProvider: true,
      showingHours: true,
      googleCalendarId: true,
    },
  });

  const provider = await getCalendarProvider(ctx.organizationId);
  const configured = await provider.isConfigured();

  return NextResponse.json({
    ...updated,
    showingHours: updated.showingHours ?? DEFAULT_SHOWING_HOURS,
    providerConfigured: configured,
  });
}
