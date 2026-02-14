import { simpleParser } from "mailparser";
import * as crypto from "crypto";
import { EmailParseResult } from "../types";

export async function parseVenmoEmail(
  raw: Buffer | string
): Promise<EmailParseResult | null> {
  const parsed = await simpleParser(raw);

  const from = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (from !== "venmo@venmo.com") return null;

  const subject = parsed.subject ?? "";

  // Subject pattern: "{Name} paid you ${amount}"
  const subjectMatch = subject.match(
    /^(.+?)\s+paid you \$([0-9,]+(?:\.\d{2})?)$/
  );
  if (!subjectMatch) return null;

  const senderName = subjectMatch[1].trim();
  const amount = parseFloat(subjectMatch[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const date = parsed.date ?? new Date();

  // Try to extract transaction ID from HTML body
  // Venmo emails contain links like https://venmo.com/transaction/{id}
  const html = parsed.html || "";
  let externalId: string | null = null;

  const txMatch = html.match(/\/transaction\/([a-zA-Z0-9_-]+)/);
  if (txMatch) {
    externalId = txMatch[1];
  }

  // If no transaction ID found, generate one from name+amount+date
  if (!externalId) {
    const hash = crypto
      .createHash("sha256")
      .update(`venmo:${senderName}:${amount}:${date.toISOString()}`)
      .digest("hex")
      .slice(0, 16);
    externalId = `venmo-${hash}`;
  }

  // Try to extract note from HTML body
  // Venmo notes are typically in a specific section of the HTML
  let note: string | null = null;

  // Look for note patterns in the HTML - Venmo puts the note in a
  // recognizable section, often after "Note:" or in a distinct div
  const notePatterns = [
    /class="note[^"]*"[^>]*>([^<]+)</i,
    />\s*Note:\s*([^<]+)</i,
    /payment-note[^>]*>([^<]+)</i,
  ];

  for (const pattern of notePatterns) {
    const noteMatch = html.match(pattern);
    if (noteMatch) {
      note = noteMatch[1].trim();
      break;
    }
  }

  // Also check text body for a note
  if (!note && parsed.text) {
    const textNoteMatch = parsed.text.match(/Note:\s*(.+)/i);
    if (textNoteMatch) {
      note = textNoteMatch[1].trim();
    }
  }

  return {
    senderName,
    amount,
    date,
    note,
    externalId,
    method: "VENMO",
  };
}
