import { prisma } from "@/lib/db";
import { InternalCalendarProvider } from "./internal";
import { GoogleCalendarProvider } from "./google";
import { computeAvailableSlots } from "./slots";
import {
  DEFAULT_SHOWING_HOURS,
  type AvailableSlot,
  type CalendarProvider,
  type ShowingHours,
} from "./types";

/**
 * Resolve the calendar provider for an organization. Reads the org's
 * calendarProvider setting and returns the matching provider instance.
 *
 * Defaults: INTERNAL provider (no external dependencies).
 */
export async function getCalendarProvider(
  organizationId: string
): Promise<CalendarProvider> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { calendarProvider: true, googleCalendarId: true },
  });

  if (org?.calendarProvider === "GOOGLE") {
    const calendarId = org.googleCalendarId || process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
      // Fall back to Internal rather than throw — keeps the bot functional.
      console.warn(
        `Org ${organizationId} is set to GOOGLE but no calendar ID is configured; using Internal.`
      );
      return new InternalCalendarProvider(organizationId);
    }
    return new GoogleCalendarProvider(calendarId);
  }

  return new InternalCalendarProvider(organizationId);
}

/**
 * Resolve the org's per-weekday showing hours, falling back to defaults.
 */
export async function getShowingHours(
  organizationId: string
): Promise<ShowingHours> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { showingHours: true },
  });
  const raw = org?.showingHours;
  if (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    Object.keys(raw as object).length > 0
  ) {
    return raw as unknown as ShowingHours;
  }
  return DEFAULT_SHOWING_HOURS;
}

/**
 * Unified "what slots can the bot offer?" function. Used by the conversation
 * FSM. Pulls the provider + hours from the org, queries busy times, and
 * computes slots with the shared helper.
 */
export async function getAvailableSlotsForOrg(
  organizationId: string,
  startDate: Date,
  endDate: Date,
  slotDurationMinutes: number = 30
): Promise<AvailableSlot[]> {
  const [provider, hoursByWeekday] = await Promise.all([
    getCalendarProvider(organizationId),
    getShowingHours(organizationId),
  ]);
  const busyTimes = await provider.getBusyTimes(startDate, endDate);
  return computeAvailableSlots({
    startDate,
    endDate,
    busyTimes,
    hoursByWeekday,
    slotDurationMinutes,
  });
}
