// Shared types for calendar providers (Internal DB and Google Calendar).

export interface BusySlot {
  start: Date;
  end: Date;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
}

/** Per-weekday showing window. Keys: 0=Sunday .. 6=Saturday. */
export type ShowingHours = Record<number, { start: number; end: number }>;

export interface CreateEventOptions {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  location?: string;
}

export interface CreateEventResult {
  eventId: string;
  htmlLink?: string;
}

/**
 * A calendar provider answers two questions:
 *   1. "When am I busy?" (so the bot can exclude those slots)
 *   2. "Book this event." (called when a showing is confirmed)
 *
 * Both methods are org-scoped; the provider instance holds the org context.
 */
export interface CalendarProvider {
  readonly kind: "INTERNAL" | "GOOGLE";
  isConfigured(): Promise<boolean>;
  getBusyTimes(timeMin: Date, timeMax: Date): Promise<BusySlot[]>;
  createEvent(options: CreateEventOptions): Promise<CreateEventResult>;
}

/** Default showing windows if org hasn't customized. Weekdays 5-9pm, weekends 8-5. */
export const DEFAULT_SHOWING_HOURS: ShowingHours = {
  0: { start: 8, end: 17 }, // Sun
  1: { start: 17, end: 21 }, // Mon
  2: { start: 17, end: 21 }, // Tue
  3: { start: 17, end: 21 }, // Wed
  4: { start: 17, end: 21 }, // Thu
  5: { start: 17, end: 21 }, // Fri
  6: { start: 8, end: 17 }, // Sat
};
