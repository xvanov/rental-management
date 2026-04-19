import { prisma } from "@/lib/db";
import type {
  BusySlot,
  CalendarProvider,
  CreateEventOptions,
  CreateEventResult,
} from "./types";

/**
 * Internal calendar provider — no external dependencies.
 *
 * Busy times are the union of:
 *   - ShowingBlackout ranges for the org (user-managed "I'm out" blocks)
 *   - Existing Showings for properties in the org that aren't CANCELED
 *     (so two prospects can't book the same slot)
 *
 * createEvent is a no-op: the Showing row created by the caller already
 * represents the "event" and will block its slot on the next availability
 * lookup automatically.
 */
export class InternalCalendarProvider implements CalendarProvider {
  readonly kind = "INTERNAL" as const;

  constructor(private readonly organizationId: string) {}

  async isConfigured(): Promise<boolean> {
    // Always configured — no external creds needed.
    return true;
  }

  async getBusyTimes(timeMin: Date, timeMax: Date): Promise<BusySlot[]> {
    const [blackouts, showings] = await Promise.all([
      prisma.showingBlackout.findMany({
        where: {
          organizationId: this.organizationId,
          start: { lte: timeMax },
          end: { gte: timeMin },
        },
        select: { start: true, end: true },
      }),
      prisma.showing.findMany({
        where: {
          property: { organizationId: this.organizationId },
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          date: { gte: timeMin, lte: timeMax },
        },
        select: { date: true },
      }),
    ]);

    const busy: BusySlot[] = [];
    for (const b of blackouts) {
      busy.push({ start: b.start, end: b.end });
    }
    // Each scheduled showing blocks a 30-min window starting at its time.
    const SHOWING_DURATION_MS = 30 * 60 * 1000;
    for (const s of showings) {
      busy.push({
        start: s.date,
        end: new Date(s.date.getTime() + SHOWING_DURATION_MS),
      });
    }
    return busy;
  }

  async createEvent(options: CreateEventOptions): Promise<CreateEventResult> {
    // No-op: the Showing row already blocks this slot. We return a synthetic
    // eventId so callers have something to log.
    return {
      eventId: `internal_${options.startTime.getTime()}`,
    };
  }
}
