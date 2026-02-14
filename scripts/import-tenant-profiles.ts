import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "../src/lib/db";
import { logSystemEvent } from "../src/lib/events";
import * as fs from "fs";
import * as path from "path";

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] || "";
    });
    return obj;
  });
}

// ─── Hardcoded Tenant-to-CSV Name Map ────────────────────────────────────────

const TENANT_TO_CSV_MAP: Record<string, string> = {
  Anayeli: "Anayely Rojas",
  Ana: "Ana Laura Soto Hernández",
  Oswaldo: "Oswaldo aguila",
  Adonis: "Adonis Gnanho",
  "Jose Aurelia": "José Enriquez",
  James: "James Alexander Carr",
  William: "William Beau Brandon",
  Cameron: "Cameron Leach",
  Musa: "Ibrahim Musa yusuf",
  Christopher: "Christopher Thomas",
  Amy: "Amy Rodriguez",
  Ikea: "Ikea Leann Powell",
  Latasha: "Latasha Cheatam",
  Tenzin: "Tenzin Palzom",
  "David Landry": "David landry",
  Deja: "Deja Windham",
  Jorge: "Jorge Hernández",
  Alex: "Alexis Mondragon González",
  Daniel: "Daniel James Worline",
  Jennifer: "Jennifer Laws",
  Horlry: "HORLRY ANTOINE",
};

// ─── Column Detection Helpers ────────────────────────────────────────────────

function findColumn(
  headers: string[],
  patterns: string[]
): string | undefined {
  const lower = headers.map((h) => h.toLowerCase());
  for (const pattern of patterns) {
    const idx = lower.findIndex((h) => h.includes(pattern));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

interface ColumnMap {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  employer?: string;
  income?: string;
}

function detectColumns(headers: string[]): ColumnMap {
  return {
    firstName: findColumn(headers, ["first name", "first_name", "firstname"]),
    lastName: findColumn(headers, ["last name", "last_name", "lastname"]),
    fullName: findColumn(headers, ["full name", "name"]),
    email: findColumn(headers, ["email", "e-mail"]),
    phone: findColumn(headers, ["phone", "cell", "mobile", "number"]),
    address: findColumn(headers, [
      "current address",
      "address",
      "street",
      "residence",
    ]),
    employer: findColumn(headers, [
      "employer",
      "work",
      "company",
      "job",
      "occupation",
    ]),
    income: findColumn(headers, [
      "income",
      "salary",
      "pay",
      "monthly income",
      "annual income",
      "gross income",
    ]),
  };
}

// ─── Name Extraction ─────────────────────────────────────────────────────────

function getCSVFullName(
  row: Record<string, string>,
  cols: ColumnMap
): string {
  if (cols.firstName && cols.lastName) {
    const first = row[cols.firstName] || "";
    const last = row[cols.lastName] || "";
    return `${first} ${last}`.trim();
  }
  if (cols.fullName) {
    return (row[cols.fullName] || "").trim();
  }
  // Fallback: check all columns for something that looks like a name field
  for (const key of Object.keys(row)) {
    const lk = key.toLowerCase();
    if (lk.includes("name") && !lk.includes("employer") && !lk.includes("landlord")) {
      return (row[key] || "").trim();
    }
  }
  return "";
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || "", last: "" };
  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
  };
}

// ─── Normalize for comparison ────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Match CSV row to a map name ─────────────────────────────────────────────

function findCSVRowForMapName(
  rows: Record<string, string>[],
  csvName: string,
  cols: ColumnMap
): Record<string, string> | undefined {
  const target = normalize(csvName);
  for (const row of rows) {
    const rowName = normalize(getCSVFullName(row, cols));
    if (!rowName) continue;
    // Exact match after normalization
    if (rowName === target) return row;
    // One contains the other
    if (rowName.includes(target) || target.includes(rowName)) return row;
  }
  return undefined;
}

// ─── Build extra fields JSON ─────────────────────────────────────────────────

function buildRentalHistoryJson(
  row: Record<string, string>,
  cols: ColumnMap
): Record<string, string> {
  const knownCols = new Set(
    Object.values(cols).filter(Boolean) as string[]
  );
  const extra: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (knownCols.has(key)) continue; // skip the ones we already mapped
    if (!value || !value.trim()) continue; // skip empty
    extra[key] = value.trim();
  }
  return extra;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const shouldCommit = args.includes("--commit");

  // Determine CSV path
  const csvFlagIdx = args.indexOf("--csv");
  const defaultCsvPath = path.join(
    __dirname,
    "../data/applications/responses.csv"
  );
  const csvPath =
    csvFlagIdx !== -1 && args[csvFlagIdx + 1]
      ? path.resolve(args[csvFlagIdx + 1])
      : defaultCsvPath;

  console.log("=== Tenant Profile Import ===\n");
  console.log(`CSV path: ${csvPath}`);

  // Read CSV
  if (!fs.existsSync(csvPath)) {
    console.error(`\nERROR: CSV file not found at ${csvPath}`);
    console.error(
      "Place the Google Forms export at data/applications/responses.csv"
    );
    console.error("or specify a path with --csv /path/to/file.csv");
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(content);
  console.log(`Parsed ${rows.length} CSV rows\n`);

  if (rows.length === 0) {
    console.error("ERROR: No data rows found in CSV");
    process.exit(1);
  }

  // Print headers for visibility
  const headers = Object.keys(rows[0]);
  console.log("--- CSV Headers ---");
  headers.forEach((h, i) => console.log(`  [${i}] ${h}`));
  console.log();

  // Detect columns
  const cols = detectColumns(headers);
  console.log("--- Detected Columns ---");
  console.log(`  First Name: ${cols.firstName || "(not found)"}`);
  console.log(`  Last Name:  ${cols.lastName || "(not found)"}`);
  console.log(`  Full Name:  ${cols.fullName || "(not found)"}`);
  console.log(`  Email:      ${cols.email || "(not found)"}`);
  console.log(`  Phone:      ${cols.phone || "(not found)"}`);
  console.log(`  Address:    ${cols.address || "(not found)"}`);
  console.log(`  Employer:   ${cols.employer || "(not found)"}`);
  console.log(`  Income:     ${cols.income || "(not found)"}`);
  console.log();

  // Load all active tenants from the DB
  const tenants = await prisma.tenant.findMany({
    where: { active: true, deletedAt: null },
    include: { unit: { include: { property: true } } },
  });
  console.log(`Found ${tenants.length} active tenants in DB\n`);

  // Match tenants to CSV rows
  let matchedCount = 0;
  let unmatchedCount = 0;
  let updatedCount = 0;
  let applicationCount = 0;

  console.log("--- Match Report ---\n");

  for (const tenant of tenants) {
    // Build the lookup key: try "firstName" first, then "firstName lastName"
    const fullKey = `${tenant.firstName} ${tenant.lastName}`.trim();
    const csvName =
      TENANT_TO_CSV_MAP[tenant.firstName] ||
      TENANT_TO_CSV_MAP[fullKey] ||
      undefined;

    if (!csvName) {
      console.log(
        `  [ SKIP ] ${tenant.firstName} ${tenant.lastName} — not in mapping`
      );
      unmatchedCount++;
      continue;
    }

    const csvRow = findCSVRowForMapName(rows, csvName, cols);
    if (!csvRow) {
      console.log(
        `  [ MISS ] ${tenant.firstName} ${tenant.lastName} — CSV name "${csvName}" not found in CSV data`
      );
      unmatchedCount++;
      continue;
    }

    const csvFullName = getCSVFullName(csvRow, cols);
    const { first: csvFirstName, last: csvLastName } = splitName(csvFullName);
    const csvEmail = cols.email ? (csvRow[cols.email] || "").trim() : "";
    const csvPhone = cols.phone ? (csvRow[cols.phone] || "").trim() : "";
    const csvAddress = cols.address ? (csvRow[cols.address] || "").trim() : "";
    const csvEmployer = cols.employer
      ? (csvRow[cols.employer] || "").trim()
      : "";
    const csvIncome = cols.income ? (csvRow[cols.income] || "").trim() : "";

    matchedCount++;
    console.log(
      `  [ MATCH ] ${tenant.firstName} ${tenant.lastName} -> "${csvFullName}"`
    );

    // Determine tenant field updates
    const updates: Record<string, string> = {};
    if ((!tenant.lastName || tenant.lastName === "") && csvLastName) {
      updates.lastName = csvLastName;
    }
    if (!tenant.email && csvEmail) {
      updates.email = csvEmail;
    }
    if (!tenant.phone && csvPhone) {
      updates.phone = csvPhone;
    }

    if (Object.keys(updates).length > 0) {
      console.log(`           Tenant updates: ${JSON.stringify(updates)}`);
    } else {
      console.log(`           Tenant updates: (none needed)`);
    }

    console.log(
      `           Application: firstName="${csvFirstName}", lastName="${csvLastName}", email="${csvEmail}", phone="${csvPhone}"`
    );

    // Build rental history from extra CSV fields
    const rentalHistory = buildRentalHistoryJson(csvRow, cols);

    if (shouldCommit) {
      // Update tenant
      if (Object.keys(updates).length > 0) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: updates,
        });
        updatedCount++;
        console.log(`           -> Tenant updated`);
      }

      // Check for existing application to avoid duplicates
      const existingApp = await prisma.application.findFirst({
        where: {
          tenantId: tenant.id,
          reviewNotes: "Imported from application CSV",
        },
      });

      if (existingApp) {
        console.log(
          `           -> Application already exists (${existingApp.id}), skipping`
        );
      } else {
        // Create application
        const app = await prisma.application.create({
          data: {
            tenantId: tenant.id,
            status: "APPROVED",
            firstName: csvFirstName,
            lastName: csvLastName,
            email: csvEmail || null,
            phone: csvPhone || null,
            currentAddress: csvAddress || null,
            employer: csvEmployer || null,
            income: csvIncome ? parseFloat(csvIncome.replace(/[^0-9.-]/g, "")) || null : null,
            rentalHistory:
              Object.keys(rentalHistory).length > 0 ? rentalHistory : undefined,
            submittedAt: new Date(),
            reviewedAt: new Date(),
            reviewNotes: "Imported from application CSV",
          },
        });

        applicationCount++;
        console.log(`           -> Application created (${app.id})`);

        // Log system event
        await logSystemEvent(
          {
            action: "APPLICATION_IMPORTED",
            description: `Imported application for ${csvFullName} from CSV`,
            metadata: {
              applicationId: app.id,
              csvName: csvFullName,
            },
          },
          {
            tenantId: tenant.id,
            propertyId: tenant.unit?.propertyId || undefined,
          }
        );
      }
    }

    console.log();
  }

  // Summary
  console.log("--- Summary ---");
  console.log(`  Total tenants in DB: ${tenants.length}`);
  console.log(`  Matched to CSV:      ${matchedCount}`);
  console.log(`  Not in mapping/CSV:  ${unmatchedCount}`);

  if (shouldCommit) {
    console.log(`  Tenants updated:     ${updatedCount}`);
    console.log(`  Applications created: ${applicationCount}`);
    console.log("\nDone! Changes committed to database.");
  } else {
    console.log("\n--- DRY RUN ---");
    console.log("No changes were made. Use --commit to write to the database.");
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Import failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
