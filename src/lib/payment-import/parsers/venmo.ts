import { readFileSync } from "fs";
import { createHash } from "crypto";
import { ParsedPayment } from "../types";

function generateExternalId(
  senderName: string,
  date: Date,
  amount: number
): string {
  const raw = `${senderName}|${date.toISOString()}|${amount}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function parseVenmoDate(dateStr: string): Date {
  const today = new Date();

  // Relative date: "4d", "8d", "11d" — days ago from today
  const relativeMatch = dateStr.match(/^(\d+)d$/);
  if (relativeMatch) {
    const daysAgo = parseInt(relativeMatch[1], 10);
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Full date: "Dec 3, 2024"
  const fullMatch = dateStr.match(
    /^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/
  );
  if (fullMatch) {
    const d = new Date(`${fullMatch[1]} ${fullMatch[2]}, ${fullMatch[3]}`);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Month/day: "Jan 5", "Oct 3"
  const monthDayMatch = dateStr.match(/^([A-Z][a-z]+)\s+(\d{1,2})$/);
  if (monthDayMatch) {
    const currentYear = today.getFullYear();
    let d = new Date(`${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear}`);
    d.setHours(0, 0, 0, 0);
    // If the month is ahead of today, use previous year
    if (d > today) {
      d = new Date(
        `${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear - 1}`
      );
      d.setHours(0, 0, 0, 0);
    }
    return d;
  }

  throw new Error(`Unable to parse Venmo date: "${dateStr}"`);
}

function parseAmount(amountStr: string): number {
  // Format: "+ $1,234.56" or "+ $971.00"
  const cleaned = amountStr.replace(/[+$,\s]/g, "");
  return parseFloat(cleaned);
}

export async function parseVenmoHistory(
  filePath: string
): Promise<ParsedPayment[]> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map((l) => l.trim());

  const payments: ParsedPayment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for "{Name} paid you" lines
    if (!line.endsWith(" paid you")) continue;

    // Skip outgoing payments ("You paid ...")
    if (line.startsWith("You paid")) continue;

    const senderName = line.replace(" paid you", "");

    // Next line is date
    const dateLine = lines[i + 1];
    if (!dateLine) continue;

    // Next line is note
    const noteLine = lines[i + 2];
    if (!noteLine) continue;

    // Next line is amount
    const amountLine = lines[i + 3];
    if (!amountLine) continue;

    // Only include incoming payments (lines with "+ $")
    if (!amountLine.startsWith("+ $")) continue;

    // Skip "Standard Transfer" and "Instant Transfer" entries — these
    // would not match "paid you" pattern, but be defensive
    if (
      noteLine.includes("Standard Transfer") ||
      noteLine.includes("Instant Transfer")
    ) {
      continue;
    }

    const date = parseVenmoDate(dateLine);
    const amount = parseAmount(amountLine);
    const note = noteLine || null;
    const externalId = generateExternalId(senderName, date, amount);

    payments.push({
      senderName,
      amount,
      date,
      note,
      externalId,
      method: "VENMO",
    });
  }

  return payments;
}
