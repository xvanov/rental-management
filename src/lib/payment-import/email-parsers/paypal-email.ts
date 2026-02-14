import { simpleParser } from "mailparser";
import { EmailParseResult } from "../types";

export async function parsePayPalEmail(
  raw: Buffer | string
): Promise<EmailParseResult | null> {
  const parsed = await simpleParser(raw);

  const from = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (from !== "service@paypal.com") return null;

  const subject = parsed.subject ?? "";

  // Subject pattern: "{Name} sent you ${amount} USD"
  const subjectMatch = subject.match(
    /^(.+?)\s+sent you \$([0-9,]+(?:\.\d{2})?)\s+USD$/
  );
  if (!subjectMatch) return null;

  const senderName = subjectMatch[1].trim();
  const amount = parseFloat(subjectMatch[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const textBody = parsed.text ?? "";
  const htmlBody = parsed.html || "";
  const fullBody = textBody + htmlBody;

  // Extract Transaction ID from text body
  // Pattern: "Transaction ID: {id}"
  let externalId: string | null = null;
  const txIdMatch = fullBody.match(/Transaction\s+ID:\s*([A-Za-z0-9]+)/i);
  if (txIdMatch) {
    externalId = txIdMatch[1];
  }

  if (!externalId) {
    // Fall back to generating one
    const crypto = await import("crypto");
    const hash = crypto
      .createHash("sha256")
      .update(`paypal:${senderName}:${amount}:${parsed.date?.toISOString() ?? ""}`)
      .digest("hex")
      .slice(0, 16);
    externalId = `paypal-${hash}`;
  }

  // Try to parse the transaction date from body
  // Pattern: "Transaction date: January 15, 2025" or "Transaction date: 01/15/2025"
  let date: Date = parsed.date ?? new Date();
  const dateMatch = fullBody.match(
    /Transaction\s+date:\s*(.+?)(?:\n|\r|$)/i
  );
  if (dateMatch) {
    const parsedDate = new Date(dateMatch[1].trim());
    if (!isNaN(parsedDate.getTime())) {
      date = parsedDate;
    }
  }

  // Extract note if present
  // PayPal may include a note/memo in the body
  let note: string | null = null;
  const noteMatch = fullBody.match(
    /(?:Note|Memo|Message):\s*(.+?)(?:\n|\r|$)/i
  );
  if (noteMatch) {
    note = noteMatch[1].trim() || null;
  }

  return {
    senderName,
    amount,
    date,
    note,
    externalId,
    method: "PAYPAL",
  };
}
