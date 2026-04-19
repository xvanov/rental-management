import type { AvailableSlot, BusySlot, ShowingHours } from "./types";

/**
 * Compute 30-min (default) available slots in a date range, given busy times
 * from a provider and per-weekday showing windows. Pure function — no I/O,
 * no provider awareness. Reused by both Internal and Google providers.
 */
export function computeAvailableSlots(args: {
  startDate: Date;
  endDate: Date;
  busyTimes: BusySlot[];
  hoursByWeekday: ShowingHours;
  slotDurationMinutes?: number;
}): AvailableSlot[] {
  const {
    startDate,
    endDate,
    busyTimes,
    hoursByWeekday,
    slotDurationMinutes = 30,
  } = args;

  const slots: AvailableSlot[] = [];
  const now = new Date();

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const window = hoursByWeekday[current.getDay()];
    if (!window || window.end <= window.start) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    const { start: startHour, end: endHour } = window;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += slotDurationMinutes) {
        const slotStart = new Date(current);
        slotStart.setHours(hour, min, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);

        // Bail if the slot would run past the day's window.
        if (
          slotEnd.getHours() > endHour ||
          (slotEnd.getHours() === endHour && slotEnd.getMinutes() > 0)
        ) {
          continue;
        }

        // Skip slots that already started.
        if (slotStart < now) continue;

        const overlaps = busyTimes.some(
          (b) => slotStart < b.end && slotEnd > b.start
        );
        if (!overlaps) {
          slots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}
