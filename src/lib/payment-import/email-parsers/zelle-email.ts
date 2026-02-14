import { simpleParser } from "mailparser";
import * as crypto from "crypto";
import { EmailParseResult } from "../types";

export async function parseZelleEmail(
  raw: Buffer | string
): Promise<EmailParseResult | null> {
  const parsed = await simpleParser(raw);

  const from = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (from !== "customerservice@ealerts.bankofamerica.com") return null;

  const subject = parsed.subject ?? "";

  // Subject pattern: "{Name} sent you ${amount}"
  const subjectMatch = subject.match(
    /^(.+?)\s+sent you \$([0-9,]+(?:\.\d{2})?)$/
  );
  if (!subjectMatch) return null;

  const senderName = subjectMatch[1].trim();
  const amount = parseFloat(subjectMatch[2].replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  const date = parsed.date ?? new Date();

  // Zelle emails have no transaction ID - generate one from name+amount+date
  const hash = crypto
    .createHash("sha256")
    .update(`zelle:${senderName}:${amount}:${date.toISOString()}`)
    .digest("hex")
    .slice(0, 16);
  const externalId = `zelle-${hash}`;

  // Extract note from text body
  // Zelle notes appear on a line by itself in the text body after the amount info
  let note: string | null = null;
  const textBody = parsed.text ?? "";

  if (textBody) {
    const lines = textBody.split(/\r?\n/).map((l) => l.trim());

    // Look for the note after lines mentioning the amount or "sent you"
    let foundAmountLine = false;
    for (const line of lines) {
      if (foundAmountLine && line.length > 0) {
        // Skip lines that are clearly boilerplate or structural
        if (
          line.startsWith("http") ||
          line.startsWith("To ") ||
          line.startsWith("Bank of America") ||
          line.startsWith("If you") ||
          line.startsWith("This is") ||
          line.startsWith("View ") ||
          line.startsWith("©") ||
          line.includes("privacy") ||
          line.includes("unsubscribe")
        ) {
          continue;
        }
        note = line;
        break;
      }
      if (
        line.includes("sent you") ||
        line.match(/\$[0-9,]+(?:\.\d{2})?/)
      ) {
        foundAmountLine = true;
      }
    }
  }

  // Also try HTML body for note extraction
  if (!note) {
    const htmlBody = parsed.html || "";
    const noteMatch = htmlBody.match(
      /(?:Note|Memo|Message):\s*([^<]+)/i
    );
    if (noteMatch) {
      note = noteMatch[1].trim() || null;
    }
  }

  return {
    senderName,
    amount,
    date,
    note,
    externalId,
    method: "ZELLE",
  };
}
