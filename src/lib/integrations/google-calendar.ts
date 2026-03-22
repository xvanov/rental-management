import { google, calendar_v3 } from "googleapis";

// ─── Google Calendar Client ──────────────────────────────────────────────────

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function getCalendarClient(): calendar_v3.Calendar {
  const credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!credentials || !calendarId) {
    throw new Error(
      "GOOGLE_CALENDAR_CREDENTIALS and GOOGLE_CALENDAR_ID are required"
    );
  }

  const parsed = JSON.parse(credentials);
  const auth = new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: SCOPES,
  });

  return google.calendar({ version: "v3", auth });
}

// ─── Get Busy Times ─────────────────────────────────────────────────────────

export interface BusySlot {
  start: string;
  end: string;
}

/**
 * Get busy times from Google Calendar for a date range.
 * Returns an array of busy time slots.
 */
export async function getBusyTimes(
  timeMin: Date,
  timeMax: Date
): Promise<BusySlot[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is required");
  }

  try {
    const calendar = getCalendarClient();
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busy = response.data.calendars?.[calendarId]?.busy ?? [];
    return busy
      .filter((slot): slot is { start: string; end: string } =>
        Boolean(slot.start && slot.end)
      )
      .map((slot) => ({
        start: slot.start!,
        end: slot.end!,
      }));
  } catch (error) {
    console.error("Failed to fetch Google Calendar busy times:", error);
    return [];
  }
}

// ─── Get Available Slots ────────────────────────────────────────────────────

export interface AvailableSlot {
  start: Date;
  end: Date;
}

/**
 * Get available showing slots for a given date range.
 * Defaults to 9 AM - 6 PM showing hours, 30-minute slots.
 * Excludes times that conflict with Google Calendar events.
 */
export async function getAvailableSlots(
  startDate: Date,
  endDate: Date,
  showingDurationMinutes: number = 30,
  startHour: number = 9,
  endHour: number = 18
): Promise<AvailableSlot[]> {
  const busyTimes = await getBusyTimes(startDate, endDate);
  const slots: AvailableSlot[] = [];

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    // Skip past dates
    if (current < new Date()) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // Generate slots for this day
    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += showingDurationMinutes) {
        const slotStart = new Date(current);
        slotStart.setHours(hour, min, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + showingDurationMinutes);

        // Skip if slot end exceeds showing hours
        if (slotEnd.getHours() > endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() > 0)) {
          continue;
        }

        // Check for conflicts with busy times
        const hasConflict = busyTimes.some((busy) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slotStart < busyEnd && slotEnd > busyStart;
        });

        if (!hasConflict) {
          slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

// ─── Create Calendar Event ──────────────────────────────────────────────────

export interface CreateCalendarEventOptions {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  location?: string;
}

/**
 * Create a new event on Google Calendar.
 * Returns the event ID and HTML link.
 */
export async function createCalendarEvent(
  options: CreateCalendarEventOptions
): Promise<{ eventId: string; htmlLink: string }> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is required");
  }

  const calendar = getCalendarClient();

  const event: calendar_v3.Schema$Event = {
    summary: options.summary,
    description: options.description,
    start: {
      dateTime: options.startTime.toISOString(),
    },
    end: {
      dateTime: options.endTime.toISOString(),
    },
  };

  if (options.location) {
    event.location = options.location;
  }

  if (options.attendeeEmail) {
    event.attendees = [{ email: options.attendeeEmail }];
  }

  const response = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  return {
    eventId: response.data.id!,
    htmlLink: response.data.htmlLink!,
  };
}

/**
 * Check if Google Calendar integration is configured.
 */
export function isCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CREDENTIALS && process.env.GOOGLE_CALENDAR_ID
  );
}
