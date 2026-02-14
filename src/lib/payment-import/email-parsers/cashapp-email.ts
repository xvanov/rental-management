import { simpleParser } from "mailparser";
import { EmailParseResult } from "../types";

export async function parseCashAppEmail(
  raw: Buffer | string
): Promise<EmailParseResult | null> {
  const parsed = await simpleParser(raw);

  const from = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (from !== "cash@square.com") return null;

  const subject = parsed.subject ?? "";

  // Subject pattern: "{Name} sent you ${amount} for {note}"
  // or: "{Name} sent you ${amount}"
  const subjectMatch = subject.match(
    /^(.+?)\s+sent you \$([0-9,]+(?:\.\d{2})?)(?:\s+for\s+(.+))?$/
  );
  if (!subjectMatch) return null;

  const senderName = subjectMatch[1].trim();
  const amount = parseFloat(subjectMatch[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const note = subjectMatch[3]?.trim() || null;
  const date = parsed.date ?? new Date();

  // Extract receipt UUID from body
  // Pattern: https://cash.app/receipt/payments/{uuid}
  let externalId: string | null = null;

  const textBody = parsed.text ?? "";
  const htmlBody = parsed.html || "";
  const fullBody = textBody + htmlBody;

  const receiptMatch = fullBody.match(
    /cash\.app\/receipt\/payments\/([a-f0-9-]+)/i
  );
  if (receiptMatch) {
    externalId = receiptMatch[1];
  }

  // Also try alternative Cash App receipt URL patterns
  if (!externalId) {
    const altMatch = fullBody.match(
      /cash\.app\/payments\/([a-f0-9-]+)/i
    );
    if (altMatch) {
      externalId = altMatch[1];
    }
  }

  if (!externalId) {
    // Fall back to generating one (should not happen for Cash App)
    const crypto = await import("crypto");
    const hash = crypto
      .createHash("sha256")
      .update(`cashapp:${senderName}:${amount}:${date.toISOString()}`)
      .digest("hex")
      .slice(0, 16);
    externalId = `cashapp-${hash}`;
  }

  return {
    senderName,
    amount,
    date,
    note,
    externalId,
    method: "CASHAPP",
  };
}
