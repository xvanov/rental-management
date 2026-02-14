import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { ParsedPayment } from "../types";

interface CashAppRow {
  Date: string;
  "Transaction ID": string;
  "Transaction Type": string;
  Currency: string;
  Amount: string;
  Fee: string;
  "Net Amount": string;
  "Asset Type": string;
  "Asset Price": string;
  "Asset Amount": string;
  Status: string;
  Notes: string;
  "Name of sender/receiver": string;
  Account: string;
}

export async function parseCashAppHistory(
  filePath: string
): Promise<ParsedPayment[]> {
  const content = readFileSync(filePath, "utf-8");

  const records: CashAppRow[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const payments: ParsedPayment[] = [];

  for (const row of records) {
    // Filter: P2P, COMPLETE, positive amount, has sender name
    if (row["Transaction Type"] !== "P2P") continue;
    if (row.Status !== "COMPLETE") continue;

    const senderName = row["Name of sender/receiver"];
    if (!senderName || senderName.trim() === "") continue;

    const amountStr = row.Amount;
    if (!amountStr || !amountStr.startsWith("$")) continue;
    // Skip negative amounts (outgoing)
    if (amountStr.startsWith("-")) continue;

    const transactionId = row["Transaction ID"];
    if (!transactionId || transactionId.trim() === "") continue;

    // Parse amount: "$750.00" -> 750.00
    const amount = parseFloat(amountStr.replace(/[$,]/g, ""));
    if (amount <= 0) continue;

    // Parse date: "2026-02-09 12:57:07 EST" -> just the date part
    const datePart = row.Date.split(" ")[0]; // "2026-02-09"
    const [year, month, day] = datePart.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setHours(0, 0, 0, 0);

    const note = row.Notes && row.Notes.trim() !== "" ? row.Notes.trim() : null;

    payments.push({
      senderName: senderName.trim(),
      amount,
      date,
      note,
      externalId: transactionId.trim(),
      method: "CASHAPP",
    });
  }

  return payments;
}
