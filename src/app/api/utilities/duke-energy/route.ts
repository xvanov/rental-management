import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DukeEnergyDocType } from "@/generated/prisma/client";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getAddressToPropertyMap,
  matchPropertyId,
} from "@/lib/utilities/address-matching";
import { runScraper } from "@/lib/utilities/scraper-runner";

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

    // Run the Python scraper (auto-finds local venv or Docker shared venv)
    const result = await runScraper({
      scraperName: "duke-energy",
      args,
      outputFile,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: "Failed to run Duke Energy scraper", details: result.error },
        { status: 500 }
      );
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

    // Deduplicate by account number + billing period end (keep all distinct bills)
    const seen = new Set<string>();
    const deduplicatedBills = enrichedBills.filter((bill) => {
      const key = `${bill.account_number}_${bill.billing_period_end ?? bill.bill_date ?? "unknown"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

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
