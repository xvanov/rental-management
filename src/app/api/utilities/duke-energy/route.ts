import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DukeEnergyDocType } from "@/generated/prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getAddressToPropertyMap,
  matchPropertyId,
} from "@/lib/utilities/address-matching";

const execAsync = promisify(exec);

interface DukeEnergyBill {
  document_type: "bill" | "disconnect_notice" | "unknown";
  account_number: string;
  service_address: string;
  bill_date: string | null;
  due_date: string | null;
  amount_due: number;
  billing_period_start: string | null;
  billing_period_end: string | null;
  billing_days: number;
  kwh_used: number;
  meter_number: string | null;
  electric_charges: number;
  taxes: number;
  previous_balance: number;
  payments_received: number;
  requires_attention: boolean;
  attention_reason: string | null;
  pdf_path: string | null;
}

interface FetchResults {
  timestamp: string;
  count: number;
  bills: DukeEnergyBill[];
  requires_attention: DukeEnergyBill[];
}

// Map document type string to enum
function mapDocType(docType: string): DukeEnergyDocType {
  switch (docType) {
    case "bill":
      return DukeEnergyDocType.BILL;
    case "disconnect_notice":
      return DukeEnergyDocType.DISCONNECT_NOTICE;
    default:
      return DukeEnergyDocType.UNKNOWN;
  }
}

// Store parsed bills in the database
async function storeParsedBills(
  bills: (DukeEnergyBill & { matched_property_id: string | null })[]
): Promise<{ stored: number; updated: number }> {
  let stored = 0;
  let updated = 0;

  for (const bill of bills) {
    try {
      const billingPeriodEnd = bill.billing_period_end ? new Date(bill.billing_period_end) : null;

      // Upsert based on account number and billing period end
      const existing = await prisma.dukeEnergyParsedBill.findFirst({
        where: {
          accountNumber: bill.account_number,
          billingPeriodEnd: billingPeriodEnd,
        },
      });

      if (existing) {
        await prisma.dukeEnergyParsedBill.update({
          where: { id: existing.id },
          data: {
            serviceAddress: bill.service_address,
            documentType: mapDocType(bill.document_type),
            amountDue: bill.amount_due,
            billDate: bill.bill_date ? new Date(bill.bill_date) : null,
            dueDate: bill.due_date ? new Date(bill.due_date) : null,
            billingPeriodStart: bill.billing_period_start ? new Date(bill.billing_period_start) : null,
            billingDays: bill.billing_days || 0,
            kwhUsed: bill.kwh_used || 0,
            meterNumber: bill.meter_number,
            electricCharges: bill.electric_charges || 0,
            taxes: bill.taxes || 0,
            previousBalance: bill.previous_balance || 0,
            paymentsReceived: bill.payments_received || 0,
            requiresAttention: bill.requires_attention,
            attentionReason: bill.attention_reason,
            pdfPath: bill.pdf_path,
            matchedPropertyId: bill.matched_property_id,
            parsedAt: new Date(),
          },
        });
        updated++;
      } else {
        await prisma.dukeEnergyParsedBill.create({
          data: {
            accountNumber: bill.account_number,
            serviceAddress: bill.service_address,
            documentType: mapDocType(bill.document_type),
            amountDue: bill.amount_due,
            billDate: bill.bill_date ? new Date(bill.bill_date) : null,
            dueDate: bill.due_date ? new Date(bill.due_date) : null,
            billingPeriodStart: bill.billing_period_start ? new Date(bill.billing_period_start) : null,
            billingPeriodEnd: billingPeriodEnd,
            billingDays: bill.billing_days || 0,
            kwhUsed: bill.kwh_used || 0,
            meterNumber: bill.meter_number,
            electricCharges: bill.electric_charges || 0,
            taxes: bill.taxes || 0,
            previousBalance: bill.previous_balance || 0,
            paymentsReceived: bill.payments_received || 0,
            requiresAttention: bill.requires_attention,
            attentionReason: bill.attention_reason,
            pdfPath: bill.pdf_path,
            matchedPropertyId: bill.matched_property_id,
          },
        });
        stored++;
      }
    } catch (e) {
      console.error(`Failed to store bill for account ${bill.account_number}:`, e);
    }
  }

  return { stored, updated };
}

// Load stored bills from database
async function loadStoredBills() {
  const bills = await prisma.dukeEnergyParsedBill.findMany({
    orderBy: { parsedAt: "desc" },
  });

  return bills.map((bill) => ({
    document_type: bill.documentType.toLowerCase() as "bill" | "disconnect_notice" | "unknown",
    account_number: bill.accountNumber,
    service_address: bill.serviceAddress,
    bill_date: bill.billDate?.toISOString() || null,
    due_date: bill.dueDate?.toISOString() || null,
    amount_due: bill.amountDue,
    billing_period_start: bill.billingPeriodStart?.toISOString() || null,
    billing_period_end: bill.billingPeriodEnd?.toISOString() || null,
    billing_days: bill.billingDays,
    kwh_used: bill.kwhUsed,
    meter_number: bill.meterNumber,
    electric_charges: bill.electricCharges,
    taxes: bill.taxes,
    previous_balance: bill.previousBalance,
    payments_received: bill.paymentsReceived,
    requires_attention: bill.requiresAttention,
    attention_reason: bill.attentionReason,
    pdf_path: bill.pdfPath,
    matched_property_id: bill.matchedPropertyId,
    imported: !!bill.importedToUtilityBillId,
    stored_id: bill.id,
    parsed_at: bill.parsedAt.toISOString(),
  }));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parseOnly = searchParams.get("parseOnly") === "true";
    const storedOnly = searchParams.get("stored") === "true";
    const accountRaw = searchParams.get("account");

    // Sanitize account parameter - only allow digits (prevent command injection)
    const account = accountRaw ? accountRaw.replace(/[^0-9]/g, "") : null;
    if (accountRaw && account !== accountRaw) {
      return NextResponse.json(
        { error: "Invalid account number format - only digits allowed" },
        { status: 400 }
      );
    }

    // If requesting stored bills only, return from database
    if (storedOnly) {
      const storedBills = await loadStoredBills();
      const attentionRequired = storedBills.filter((b) => b.requires_attention);
      const regularBills = storedBills.filter((b) => !b.requires_attention);

      return NextResponse.json({
        success: true,
        source: "database",
        timestamp: new Date().toISOString(),
        summary: {
          total_bills: storedBills.length,
          attention_required: attentionRequired.length,
          matched_to_properties: storedBills.filter((b) => b.matched_property_id).length,
        },
        attention_required: attentionRequired,
        bills: regularBills,
      });
    }

    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, "scripts", "duke-energy", "main.py");
    const outputDir = path.join(projectRoot, "data", "downloaded-bills", "duke-energy");

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Clean up old JSON files
    try {
      const files = await fs.readdir(outputDir);
      for (const file of files) {
        if (file.startsWith("api_fetch_")) {
          await fs.unlink(path.join(outputDir, file));
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    const outputFile = path.join(outputDir, `api_fetch_${Date.now()}.json`);

    // Build command
    const args = ["--json", "--output", outputFile];
    if (parseOnly) {
      args.push("--parse-only");
    }
    if (account) {
      args.push("--account", account);
    }

    // Run the Python scraper using the virtual environment
    const venvPython = path.join(projectRoot, "scripts", "duke-energy", ".venv", "bin", "python");

    try {
      const { stderr } = await execAsync(
        `${venvPython} ${scriptPath} ${args.join(" ")}`,
        {
          cwd: path.join(projectRoot, "scripts", "duke-energy"),
          timeout: 300000, // 5 minute timeout
          env: {
            ...process.env,
            PYTHONPATH: path.join(projectRoot, "scripts", "duke-energy"),
            PLAYWRIGHT_BROWSERS_PATH: path.join(projectRoot, "scripts", "duke-energy", ".cache", "ms-playwright"),
          },
        }
      );

      if (stderr && !stderr.includes("DevTools")) {
        console.warn("Scraper stderr:", stderr);
      }
    } catch (execError: unknown) {
      const error = execError as { code?: number; stderr?: string; message?: string };
      console.error("Scraper execution error:", error);

      const stderr = error.stderr || "";
      if (stderr.includes("playwright install") || stderr.includes("Executable doesn't exist")) {
        return NextResponse.json(
          {
            error: "Playwright browsers not installed. Run setup.sh in scripts/duke-energy/ first.",
            details: "The scraper requires Playwright browsers to log into the Duke Energy portal.",
          },
          { status: 500 }
        );
      }

      try {
        await fs.access(outputFile);
      } catch {
        return NextResponse.json(
          {
            error: "Failed to run Duke Energy scraper",
            details: error.stderr || error.message,
          },
          { status: 500 }
        );
      }
    }

    // Read results
    let results: FetchResults;
    try {
      const content = await fs.readFile(outputFile, "utf-8");
      results = JSON.parse(content);
    } catch {
      return NextResponse.json(
        { error: "Failed to read scraper results" },
        { status: 500 }
      );
    }

    // Get property mapping
    const addressMap = await getAddressToPropertyMap();

    // Enrich bills with property IDs
    const enrichedBills = results.bills.map((bill) => ({
      ...bill,
      matched_property_id: matchPropertyId(bill.service_address, addressMap),
    }));

    // Deduplicate by account number - keep only the most recent bill per account
    const billsByAccount = new Map<string, typeof enrichedBills[0]>();
    for (const bill of enrichedBills) {
      const existing = billsByAccount.get(bill.account_number);
      if (!existing) {
        billsByAccount.set(bill.account_number, bill);
      } else {
        const existingDate = existing.bill_date ? new Date(existing.bill_date).getTime() : 0;
        const newDate = bill.bill_date ? new Date(bill.bill_date).getTime() : 0;
        if (newDate > existingDate) {
          billsByAccount.set(bill.account_number, bill);
        }
      }
    }
    const deduplicatedBills = Array.from(billsByAccount.values());

    // Store parsed bills in the database
    const { stored, updated } = await storeParsedBills(deduplicatedBills);
    console.log(`Duke Energy: Stored ${stored} new bills, updated ${updated} existing bills`);

    // Separate attention-required bills
    const attentionRequired = deduplicatedBills.filter((b) => b.requires_attention);
    const regularBills = deduplicatedBills.filter((b) => !b.requires_attention);

    return NextResponse.json({
      success: true,
      source: "parsed",
      timestamp: results.timestamp,
      summary: {
        total_bills: deduplicatedBills.length,
        attention_required: attentionRequired.length,
        matched_to_properties: deduplicatedBills.filter((b) => b.matched_property_id).length,
        stored,
        updated,
      },
      attention_required: attentionRequired,
      bills: regularBills,
    });
  } catch (error) {
    console.error("Duke Energy API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Duke Energy bills" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bills } = body as { bills: (DukeEnergyBill & { matched_property_id?: string; stored_id?: string })[] };

    if (!bills || !Array.isArray(bills)) {
      return NextResponse.json(
        { error: "bills array is required" },
        { status: 400 }
      );
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const bill of bills) {
      try {
        // Skip if no property match
        if (!bill.matched_property_id) {
          skipped.push(`${bill.account_number}: No matching property for ${bill.service_address}`);
          continue;
        }

        // Skip disconnect notices (they don't represent new bills)
        if (bill.document_type === "disconnect_notice") {
          skipped.push(`${bill.account_number}: Disconnect notice (not a new bill)`);
          continue;
        }

        // Skip if no billing period
        if (!bill.billing_period_start || !bill.billing_period_end) {
          skipped.push(`${bill.account_number}: Missing billing period`);
          continue;
        }

        // Check for duplicate
        const billingEnd = new Date(bill.billing_period_end);
        const period = `${billingEnd.getFullYear()}-${String(billingEnd.getMonth() + 1).padStart(2, "0")}`;

        const existing = await prisma.utilityBill.findFirst({
          where: {
            propertyId: bill.matched_property_id,
            type: "electric",
            period,
          },
        });

        if (existing) {
          skipped.push(`${bill.account_number}: Bill already exists for period ${period}`);
          continue;
        }

        // Create the utility bill
        const newBill = await prisma.utilityBill.create({
          data: {
            propertyId: bill.matched_property_id,
            provider: "Duke Energy",
            type: "electric",
            amount: bill.amount_due,
            billingStart: new Date(bill.billing_period_start),
            billingEnd: billingEnd,
            period,
          },
        });

        // Update the parsed bill to mark it as imported
        if (bill.stored_id) {
          await prisma.dukeEnergyParsedBill.update({
            where: { id: bill.stored_id },
            data: { importedToUtilityBillId: newBill.id },
          });
        }

        created.push(`${bill.account_number}: Created bill ${newBill.id} for ${bill.service_address}`);
      } catch (billError) {
        errors.push(`${bill.account_number}: ${billError instanceof Error ? billError.message : "Unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { created, skipped, errors },
    });
  } catch (error) {
    console.error("Failed to import Duke Energy bills:", error);
    return NextResponse.json(
      { error: "Failed to import bills" },
      { status: 500 }
    );
  }
}
