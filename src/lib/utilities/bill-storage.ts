/**
 * Standardized bill storage utilities
 *
 * All utility bills are stored in:
 *   data/bills/{address-slug}/{provider}_{YYYY-MM}.pdf
 *
 * Example:
 *   data/bills/3606-appling-way/duke-energy_2026-01.pdf
 *   data/bills/118-king-arthur-ct/enbridge-gas_2026-01.pdf
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "bills");

/**
 * Convert an address to a URL-safe slug
 * "3606 APPLING WAY, DURHAM NC 27703" -> "3606-appling-way"
 * "310B HOWARD ST" -> "310b-howard-st"
 * "310 HOWARD ST B" -> "310b-howard-st"
 */
export function addressToSlug(address: string): string {
  // Take just the street address (before city/state/zip)
  let streetAddress = address.split(",")[0].trim();

  // Remove unit designations for the folder (keep it simple)
  streetAddress = streetAddress
    .replace(/\s+(UNIT|APT|STE|SUITE|#)\s*\w*/gi, "")
    .trim();

  // Handle trailing unit letters (like "310 HOWARD ST B" -> "310B HOWARD ST")
  // This normalizes addresses with unit letters at the end
  const trailingUnitMatch = streetAddress.match(/^(\d+)\s+(.+?)\s+([A-Za-z])$/);
  if (trailingUnitMatch) {
    const num = trailingUnitMatch[1];
    const street = trailingUnitMatch[2];
    const unit = trailingUnitMatch[3].toUpperCase();
    streetAddress = `${num}${unit} ${street}`;
  }

  // Convert to lowercase, replace spaces/special chars with dashes
  return streetAddress
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes
}

/**
 * Convert a provider name to a URL-safe slug
 * "Duke Energy" -> "duke-energy"
 * "Enbridge Gas" -> "enbridge-gas"
 */
export function providerToSlug(provider: string): string {
  return provider
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a billing period from a date
 * Returns "YYYY-MM" format
 */
export function formatBillingPeriod(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Get the directory path for a property's bills
 */
export function getBillDirectory(address: string): string {
  const slug = addressToSlug(address);
  return path.join(DATA_DIR, slug);
}

/**
 * Get the full path for a bill PDF
 *
 * @param address - The service address (e.g., "3606 APPLING WAY, DURHAM NC")
 * @param provider - The utility provider (e.g., "Duke Energy")
 * @param billingDate - The billing date (used to determine YYYY-MM)
 * @returns Full path like "data/bills/3606-appling-way/duke-energy_2026-01.pdf"
 */
export function getBillPath(
  address: string,
  provider: string,
  billingDate: Date
): string {
  const dir = getBillDirectory(address);
  const providerSlug = providerToSlug(provider);
  const period = formatBillingPeriod(billingDate);
  return path.join(dir, `${providerSlug}_${period}.pdf`);
}

/**
 * Ensure the bill directory exists and return the path
 */
export function ensureBillDirectory(address: string): string {
  const dir = getBillDirectory(address);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Save a bill PDF to the standardized location
 *
 * @param address - The service address
 * @param provider - The utility provider
 * @param billingDate - The billing date
 * @param pdfBuffer - The PDF content as a Buffer
 * @returns The path where the file was saved
 */
export function saveBillPdf(
  address: string,
  provider: string,
  billingDate: Date,
  pdfBuffer: Buffer
): string {
  ensureBillDirectory(address);
  const filePath = getBillPath(address, provider, billingDate);

  // If file already exists, add a timestamp suffix to avoid overwriting
  let finalPath = filePath;
  if (fs.existsSync(filePath)) {
    const timestamp = Date.now();
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    finalPath = `${base}_${timestamp}${ext}`;
  }

  fs.writeFileSync(finalPath, pdfBuffer);
  return finalPath;
}

/**
 * Copy an existing bill PDF to the standardized location
 */
export function copyBillToStandardLocation(
  sourcePath: string,
  address: string,
  provider: string,
  billingDate: Date
): string {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  ensureBillDirectory(address);
  const destPath = getBillPath(address, provider, billingDate);

  // Don't overwrite if same content
  if (fs.existsSync(destPath)) {
    const sourceSize = fs.statSync(sourcePath).size;
    const destSize = fs.statSync(destPath).size;
    if (sourceSize === destSize) {
      return destPath; // Already exists with same size
    }
    // Different file, add timestamp
    const timestamp = Date.now();
    const ext = path.extname(destPath);
    const base = destPath.slice(0, -ext.length);
    const newPath = `${base}_${timestamp}${ext}`;
    fs.copyFileSync(sourcePath, newPath);
    return newPath;
  }

  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}

/**
 * List all bills for a property
 */
export function listBillsForProperty(address: string): string[] {
  const dir = getBillDirectory(address);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".pdf"))
    .map((f) => path.join(dir, f));
}

/**
 * Get all bill directories
 */
export function listAllBillDirectories(): string[] {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => fs.statSync(path.join(DATA_DIR, f)).isDirectory())
    .map((f) => path.join(DATA_DIR, f));
}
