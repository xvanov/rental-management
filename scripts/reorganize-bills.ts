/**
 * Reorganize all existing bill PDFs into standardized structure
 *
 * New structure:
 *   data/bills/{address-slug}/{provider}_{YYYY-MM}.pdf
 */

import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  addressToSlug,
  providerToSlug,
  formatBillingPeriod,
  ensureBillDirectory,
  getBillPath,
} from "../src/lib/utilities/bill-storage";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), "data");
const BILLS_DIR = path.join(DATA_DIR, "bills");

// Account to address mapping (will be populated from database)
const accountToAddress: Record<string, string> = {};

async function loadAccountMappings() {
  // Duke Energy
  const dukeBills = await prisma.dukeEnergyParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of dukeBills) {
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // Enbridge Gas
  const enbridgeBills = await prisma.enbridgeGasParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of enbridgeBills) {
    // Normalize account number (remove dashes for matching)
    const normalizedAcct = b.accountNumber.replace(/-/g, "");
    accountToAddress[normalizedAcct] = b.serviceAddress;
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // SMUD
  const smudBills = await prisma.smudParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of smudBills) {
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // Durham Water
  const durhamBills = await prisma.durhamWaterParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceLocation: true },
  });
  for (const b of durhamBills) {
    accountToAddress[b.accountNumber] = b.serviceLocation;
  }

  // Graham Utilities
  const grahamBills = await prisma.grahamUtilitiesParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceLocation: true },
  });
  for (const b of grahamBills) {
    const normalizedAcct = b.accountNumber.replace(/-/g, "");
    accountToAddress[normalizedAcct] = b.serviceLocation;
    accountToAddress[b.accountNumber] = b.serviceLocation;
  }

  // Wake Electric
  const wakeBills = await prisma.wakeElectricParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of wakeBills) {
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // Spectrum
  const spectrumBills = await prisma.spectrumParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of spectrumBills) {
    const normalizedAcct = b.accountNumber.replace(/\s+/g, "");
    accountToAddress[normalizedAcct] = b.serviceAddress;
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // Xfinity
  const xfinityBills = await prisma.xfinityParsedBill.findMany({
    distinct: ["accountNumber"],
    select: { accountNumber: true, serviceAddress: true },
  });
  for (const b of xfinityBills) {
    const normalizedAcct = b.accountNumber.replace(/\s+/g, "");
    accountToAddress[normalizedAcct] = b.serviceAddress;
    accountToAddress[b.accountNumber] = b.serviceAddress;
  }

  // SMUD - add manual mapping (from scraper runs)
  accountToAddress["7037161"] = "3448 BERETANIA WAY";
  accountToAddress["7050642"] = "4171 WINDSONG ST";
  accountToAddress["7071142"] = "7613 COMMONWEALTH DR";

  console.log(`Loaded ${Object.keys(accountToAddress).length} account mappings\n`);
}

function extractDateFromFilename(filename: string): Date | null {
  // Try various date patterns in filenames
  // Must be a valid year (2020-2030)

  // Pattern: _YYYYMMDD_ (Duke, Durham, SMUD)
  const pattern1 = /_(\d{4})(\d{2})(\d{2})_/;
  let match = filename.match(pattern1);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 2020 && year <= 2030) {
      return new Date(year, parseInt(match[2]) - 1, parseInt(match[3]));
    }
  }

  // Pattern: YYYYMMDD at end or with extension
  const pattern2 = /(\d{4})(\d{2})(\d{2})(?:\.|$)/;
  match = filename.match(pattern2);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 2020 && year <= 2030) {
      return new Date(year, parseInt(match[2]) - 1, parseInt(match[3]));
    }
  }

  // Pattern: MM-DD-YYYY (Xfinity)
  const pattern3 = /(\d{2})-(\d{2})-(\d{4})/;
  match = filename.match(pattern3);
  if (match) {
    const year = parseInt(match[3]);
    if (year >= 2020 && year <= 2030) {
      return new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
    }
  }

  // Pattern: YYYY_MM_ (Wake Electric)
  const pattern4 = /^(\d{4})_(\d{2})_/;
  match = filename.match(pattern4);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 2020 && year <= 2030) {
      return new Date(year, parseInt(match[2]) - 1, 1);
    }
  }

  return null;
}

function extractAccountFromFilename(filename: string): string | null {
  // Remove extension
  const base = filename.replace(/\.[^.]+$/, "");

  // Try to extract account number patterns
  // Duke: duke_energy_910176500588_20260130_211118
  // SMUD: smud_7037161_20260131_181906
  // Enbridge: enbridge_ACCOUNT_1_20260130
  // Durham Water: 358053631641_20260128_34200136
  // Graham: 5053017
  // Wake Electric: 2026_01_9_1052436902

  // Duke Energy pattern
  const dukeMatch = base.match(/duke_energy_(\d+)_/);
  if (dukeMatch) return dukeMatch[1];

  // SMUD pattern
  const smudMatch = base.match(/smud_(\d+)_/);
  if (smudMatch) return smudMatch[1];

  // Durham Water pattern (starts with account number)
  const durhamMatch = base.match(/^(\d{12})_/);
  if (durhamMatch) return durhamMatch[1];

  // Graham pattern (just account number)
  if (/^\d{5,7}$/.test(base)) return base;

  // Wake Electric pattern
  const wakeMatch = base.match(/_(\d{10})$/);
  if (wakeMatch) return wakeMatch[1];

  return null;
}

function getProviderFromPath(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes("duke") || lowerPath.includes("duke-energy")) return "Duke Energy";
  if (lowerPath.includes("enbridge")) return "Enbridge Gas";
  if (lowerPath.includes("smud")) return "SMUD";
  if (lowerPath.includes("graham")) return "Graham Utilities";
  if (lowerPath.includes("wake-electric") || lowerPath.includes("wake_electric")) return "Wake Electric";
  if (lowerPath.includes("spectrum")) return "Spectrum";
  if (lowerPath.includes("xfinity")) return "Xfinity";
  if (lowerPath.includes("durham") || lowerPath.includes("downloaded-bills")) return "Durham Water";
  return "Unknown";
}

async function reorganizeFiles() {
  await loadAccountMappings();

  // Ensure bills directory exists
  fs.mkdirSync(BILLS_DIR, { recursive: true });

  const sourceDirs = [
    path.join(DATA_DIR, "downloaded-bills"),
    path.join(DATA_DIR, "downloaded-bills", "duke-energy"),
    path.join(DATA_DIR, "downloaded-bills", "wake-electric"),
    path.join(DATA_DIR, "enbridge-bills"),
    path.join(DATA_DIR, "graham-bills"),
    path.join(DATA_DIR, "smud-bills"),
    path.join(DATA_DIR, "spectrum-bills"),
    path.join(DATA_DIR, "xfinity-bills"),
  ];

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const sourceDir of sourceDirs) {
    if (!fs.existsSync(sourceDir)) continue;

    const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith(".pdf"));
    console.log(`\nProcessing ${sourceDir} (${files.length} PDFs):`);

    for (const file of files) {
      const sourcePath = path.join(sourceDir, file);

      // Skip sample files
      if (file.includes("sample")) {
        console.log(`  SKIP (sample): ${file}`);
        skipped++;
        continue;
      }

      // Determine provider
      const provider = getProviderFromPath(sourcePath);

      // Extract account number
      const account = extractAccountFromFilename(file);

      // Look up address
      let address = account ? accountToAddress[account] : null;

      // For Enbridge, handle ACCOUNT_N pattern
      if (!address && file.includes("enbridge_ACCOUNT_")) {
        const match = file.match(/ACCOUNT_(\d+)/);
        if (match) {
          const accountNum = match[1];
          // Map account indices to known addresses
          const enbridgeAddresses = [
            "3606 APPLING WAY",
            "118 KING ARTHUR CT",
            "1553 UNDERBRUSH DR",
            "310B HOWARD ST",
          ];
          if (parseInt(accountNum) <= enbridgeAddresses.length) {
            address = enbridgeAddresses[parseInt(accountNum) - 1];
          }
        }
      }

      if (!address) {
        console.log(`  SKIP (no address): ${file} (account: ${account})`);
        skipped++;
        continue;
      }

      // Extract date
      let billingDate = extractDateFromFilename(file);
      if (!billingDate) {
        // Use file modification date as fallback
        const stats = fs.statSync(sourcePath);
        billingDate = stats.mtime;
      }

      // Generate destination path
      const destDir = path.join(BILLS_DIR, addressToSlug(address));
      const destFile = `${providerToSlug(provider)}_${formatBillingPeriod(billingDate)}.pdf`;
      const destPath = path.join(destDir, destFile);

      // Create directory
      fs.mkdirSync(destDir, { recursive: true });

      // Check if already exists
      if (fs.existsSync(destPath)) {
        const sourceSize = fs.statSync(sourcePath).size;
        const destSize = fs.statSync(destPath).size;
        if (sourceSize === destSize) {
          console.log(`  EXISTS: ${file} -> ${addressToSlug(address)}/${destFile}`);
          skipped++;
          continue;
        }
        // Different file, add timestamp
        const timestamp = Date.now();
        const newDestFile = `${providerToSlug(provider)}_${formatBillingPeriod(billingDate)}_${timestamp}.pdf`;
        const newDestPath = path.join(destDir, newDestFile);
        fs.copyFileSync(sourcePath, newDestPath);
        console.log(`  COPY (dup): ${file} -> ${addressToSlug(address)}/${newDestFile}`);
      } else {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`  COPY: ${file} -> ${addressToSlug(address)}/${destFile}`);
      }
      copied++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Copied: ${copied}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);

  // Show final structure
  console.log(`\n=== New Structure ===`);
  if (fs.existsSync(BILLS_DIR)) {
    const dirs = fs.readdirSync(BILLS_DIR).filter((f) =>
      fs.statSync(path.join(BILLS_DIR, f)).isDirectory()
    );
    for (const dir of dirs.sort()) {
      const dirPath = path.join(BILLS_DIR, dir);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".pdf"));
      console.log(`\n${dir}/`);
      for (const file of files.sort()) {
        console.log(`  ${file}`);
      }
    }
  }
}

reorganizeFiles()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
