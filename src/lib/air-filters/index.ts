import { AirFilterCadence } from "@/generated/prisma/client";

export function cadenceToMonths(cadence: AirFilterCadence): number {
  switch (cadence) {
    case "MONTHS_3":
      return 3;
    case "MONTHS_4":
      return 4;
    case "MONTHS_6":
      return 6;
    case "MONTHS_12":
      return 12;
  }
}

export function getEffectiveLastChanged(config: {
  lastChangedDate: Date | null;
  filters: Array<{ lastChangedDate: Date | null }>;
}): Date | null {
  const dates = config.filters
    .map((f) => f.lastChangedDate)
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) return config.lastChangedDate;

  // Return the oldest filter date (earliest = most overdue)
  return dates.reduce((oldest, d) => (d < oldest ? d : oldest));
}

export function isOverdue(
  lastChanged: Date | null,
  cadence: AirFilterCadence
): boolean {
  if (!lastChanged) return true;
  const months = cadenceToMonths(cadence);
  const due = new Date(lastChanged);
  due.setMonth(due.getMonth() + months);
  return new Date() > due;
}

export function getNextDueDate(
  lastChanged: Date | null,
  cadence: AirFilterCadence
): Date | null {
  if (!lastChanged) return null;
  const months = cadenceToMonths(cadence);
  const due = new Date(lastChanged);
  due.setMonth(due.getMonth() + months);
  return due;
}
