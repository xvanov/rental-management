/**
 * Smoke test for the calendar provider abstraction.
 *
 * Exercises BOTH providers for the first organization in the DB:
 *   - InternalCalendarProvider: reads from ShowingBlackout + existing Showings.
 *   - GoogleCalendarProvider: hits Google via service account.
 *
 * Usage: npx tsx scripts/test-google-calendar.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { InternalCalendarProvider } = await import("../src/lib/calendar/internal");
  const { GoogleCalendarProvider } = await import("../src/lib/calendar/google");
  const { computeAvailableSlots } = await import("../src/lib/calendar/slots");
  const { DEFAULT_SHOWING_HOURS } = await import("../src/lib/calendar/types");

  const org = await prisma.organization.findFirst({
    select: { id: true, name: true, calendarProvider: true, googleCalendarId: true },
  });
  if (!org) {
    console.error("No organization found in DB. Create one first.");
    process.exit(1);
  }
  console.log(`Org: ${org.name} (${org.id}) — provider=${org.calendarProvider}\n`);

  const now = new Date();
  const inFive = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  // Internal provider
  console.log("=== InternalCalendarProvider ===");
  const internal = new InternalCalendarProvider(org.id);
  const iBusy = await internal.getBusyTimes(now, inFive);
  console.log(`Busy ranges (blackouts + showings): ${iBusy.length}`);
  iBusy.forEach((b) =>
    console.log(`  ${b.start.toLocaleString()} → ${b.end.toLocaleString()}`)
  );
  const iSlots = computeAvailableSlots({
    startDate: now,
    endDate: inFive,
    busyTimes: iBusy,
    hoursByWeekday: DEFAULT_SHOWING_HOURS,
  });
  console.log(`Available slots (internal): ${iSlots.length}\n`);

  // Google provider (if creds exist)
  const calendarId = org.googleCalendarId || process.env.GOOGLE_CALENDAR_ID;
  if (process.env.GOOGLE_CALENDAR_CREDENTIALS && calendarId) {
    console.log("=== GoogleCalendarProvider ===");
    const google = new GoogleCalendarProvider(calendarId);
    const gBusy = await google.getBusyTimes(now, inFive);
    console.log(`Busy events from Google: ${gBusy.length}`);
    gBusy.forEach((b) =>
      console.log(`  ${b.start.toLocaleString()} → ${b.end.toLocaleString()}`)
    );
    const gSlots = computeAvailableSlots({
      startDate: now,
      endDate: inFive,
      busyTimes: gBusy,
      hoursByWeekday: DEFAULT_SHOWING_HOURS,
    });
    console.log(`Available slots (google): ${gSlots.length}`);
  } else {
    console.log("GoogleCalendarProvider: skipped (no credentials/calendar id)");
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
