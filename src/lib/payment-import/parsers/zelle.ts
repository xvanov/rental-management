import { readFileSync } from "fs";
import { ParsedPayment } from "../types";

export async function parseZelleHistory(
  filePath: string
): Promise<ParsedPayment[]> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const payments: ParsedPayment[] = [];

  for (const line of lines) {
    // Only parse lines containing "Zelle payment from" (incoming)
    // Skip "Zelle payment to" (outgoing)
    if (!line.includes("Zelle payment from")) continue;

    // Parse date at the start: MM/DD/YYYY
    const dateMatch = line.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dateMatch) continue;

    const month = parseInt(dateMatch[1], 10);
    const day = parseInt(dateMatch[2], 10);
    const year = parseInt(dateMatch[3], 10);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);

    // Extract the description portion between the date and the amounts at the end.
    // The line format is tab-separated:
    // MM/DD/YYYY  Description  Amount  Running Bal.
    // But the spacing is variable (multiple spaces used as separators).
    // The amounts are at the end: a number (possibly with comma), then spaces, then another number.
    // We need to extract everything between the date field and the amount fields.

    // Strategy: find "Zelle payment from" and parse from there.
    const zelleIdx = line.indexOf("Zelle payment from ");
    if (zelleIdx === -1) continue;

    const afterZelle = line.substring(zelleIdx + "Zelle payment from ".length);

    // Parse the confirmation number first to anchor the end of the description
    const confMatch = afterZelle.match(/[;,]?\s*Conf#\s+(\S+)/);
    if (!confMatch) continue;

    const confNumber = confMatch[1];
    const beforeConf = afterZelle.substring(0, afterZelle.indexOf(confMatch[0]));

    // Parse name and optional note from the text before Conf#
    // Patterns:
    //   "{NAME} for "{note}""
    //   "{NAME}"  (no note)
    let senderName: string;
    let note: string | null = null;

    const noteMatch = beforeConf.match(/^(.+?)\s+for\s+"(.*)"\s*$/);
    if (noteMatch) {
      senderName = noteMatch[1].trim();
      note = noteMatch[2].trim() || null;
    } else {
      // No note - the entire beforeConf is the name
      senderName = beforeConf.trim();
    }

    if (!senderName) continue;

    // Parse amount: find the number after the Conf# and its ID.
    // After Conf# {id} there are spaces then the amount, then spaces then the balance.
    const afterConf = afterZelle.substring(
      afterZelle.indexOf(confMatch[0]) + confMatch[0].length
    );

    // The amount and balance are numbers with optional commas and decimal points.
    // Amount comes first, then running balance.
    // Match pattern: spaces, then a number (possibly negative with commas), then spaces, then another number
    const amountMatch = afterConf.match(
      /\s+([\d,]+\.\d{2})\s+[\d,]+\.\d{2}\s*$/
    );
    if (!amountMatch) continue;

    const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) continue;

    payments.push({
      senderName,
      amount,
      date,
      note,
      externalId: confNumber,
      method: "ZELLE",
    });
  }

  return payments;
}
