import { google, calendar_v3 } from "googleapis";
import type {
  BusySlot,
  CalendarProvider,
  CreateEventOptions,
  CreateEventResult,
} from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

/**
 * Google Calendar provider. Credentials come from the GOOGLE_CALENDAR_CREDENTIALS
 * env var (service account JSON). The calendar ID defaults to the per-org
 * override if set, falling back to GOOGLE_CALENDAR_ID env var.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly kind = "GOOGLE" as const;

  constructor(private readonly calendarId: string) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(process.env.GOOGLE_CALENDAR_CREDENTIALS && this.calendarId);
  }

  private getClient(): calendar_v3.Calendar {
    const credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS;
    if (!credentials) {
      throw new Error("GOOGLE_CALENDAR_CREDENTIALS is not configured");
    }
    const parsed = JSON.parse(credentials);
    const auth = new google.auth.GoogleAuth({
      credentials: parsed,
      scopes: SCOPES,
    });
    return google.calendar({ version: "v3", auth });
  }

  async getBusyTimes(timeMin: Date, timeMax: Date): Promise<BusySlot[]> {
    try {
      const calendar = this.getClient();
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: [{ id: this.calendarId }],
        },
      });
      const busy = res.data.calendars?.[this.calendarId]?.busy ?? [];
      return busy
        .filter(
          (s): s is { start: string; end: string } =>
            Boolean(s.start && s.end)
        )
        .map((s) => ({ start: new Date(s.start!), end: new Date(s.end!) }));
    } catch (err) {
      console.error("Google Calendar busy lookup failed:", err);
      return [];
    }
  }

  async createEvent(options: CreateEventOptions): Promise<CreateEventResult> {
    const calendar = this.getClient();
    const event: calendar_v3.Schema$Event = {
      summary: options.summary,
      description: options.description,
      start: { dateTime: options.startTime.toISOString() },
      end: { dateTime: options.endTime.toISOString() },
    };
    if (options.location) event.location = options.location;
    if (options.attendeeEmail) event.attendees = [{ email: options.attendeeEmail }];

    const res = await calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: event,
    });
    return {
      eventId: res.data.id!,
      htmlLink: res.data.htmlLink ?? undefined,
    };
  }
}
