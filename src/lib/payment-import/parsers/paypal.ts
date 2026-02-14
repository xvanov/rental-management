import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { ParsedPayment } from "../types";

interface PayPalRow {
  Date: string;
  Time: string;
  TimeZone: string;
  Name: string;
  Type: string;
  Status: string;
  Currency: string;
  Amount: string;
  Fees: string;
  Total: string;
  "Exchange Rate": string;
  "Receipt ID": string;
  Balance: string;
  "Transaction ID": string;
  "Item Title": string;
}

const VALID_TYPES = new Set(["Mobile Payment", "General Payment"]);

export async function parsePayPalHistory(
  filePaths: string[]
): Promise<ParsedPayment[]> {
  const payments: ParsedPayment[] = [];

  for (const filePath of filePaths) {
    let content = readFileSync(filePath, "utf-8");

    // Handle BOM (byte order mark)
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }

    const records: PayPalRow[] = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    for (const row of records) {
      // Filter by type
      if (!VALID_TYPES.has(row.Type)) continue;

      // Filter by status
      if (row.Status !== "Completed") continue;

      // Filter by name — must not be empty
      const name = row.Name;
      if (!name || name.trim() === "") continue;

      // Filter by amount — must be positive (no "-" prefix)
      const amountStr = row.Amount;
      if (!amountStr || amountStr.startsWith("-")) continue;

      // Parse amount: "339.53" or "1,463.32"
      const amount = parseFloat(amountStr.replace(/,/g, ""));
      if (isNaN(amount) || amount <= 0) continue;

      // Parse date: "MM/DD/YYYY"
      const [month, day, year] = row.Date.split("/").map(Number);
      const date = new Date(year, month - 1, day);
      date.setHours(0, 0, 0, 0);

      // Note from Item Title (may be empty)
      const note =
        row["Item Title"] && row["Item Title"].trim() !== ""
          ? row["Item Title"].trim()
          : null;

      const transactionId = row["Transaction ID"];
      if (!transactionId || transactionId.trim() === "") continue;

      payments.push({
        senderName: name.trim(),
        amount,
        date,
        note,
        externalId: transactionId.trim(),
        method: "PAYPAL",
      });
    }
  }

  return payments;
}
