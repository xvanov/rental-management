/**
 * Shared address matching utilities for utility bill processing.
 * Uses fuzzy matching to handle address variations.
 */

import { prisma } from "@/lib/db";

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical).
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Normalize an address for comparison.
 * Converts to uppercase, removes punctuation, and standardizes abbreviations.
 */
export function normalizeAddress(address: string): string {
  let normalized = address
    .toUpperCase()
    .replace(/[.,#]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bSTREET\b/g, "ST")
    .replace(/\bAVENUE\b/g, "AVE")
    .replace(/\bDRIVE\b/g, "DR")
    .replace(/\bCOURT\b/g, "CT")
    .replace(/\bROAD\b/g, "RD")
    .replace(/\bLANE\b/g, "LN")
    .replace(/\bBOULEVARD\b/g, "BLVD")
    .replace(/\bPLACE\b/g, "PL")
    .replace(/\bWAY\b/g, "WAY")
    .trim();

  // Normalize unit letters (310B -> 310 B, 310 B -> 310B for comparison)
  // Convert "310B" to "310 B" and "310 B" to "310 B" for consistent format
  normalized = normalized.replace(/^(\d+)([A-Z])(\s)/, "$1 $2$3");

  return normalized;
}

/**
 * Extract the base address without unit letter for fuzzy matching.
 * "310B HOWARD ST" -> "310 HOWARD ST"
 * "310 HOWARD ST B" -> "310 HOWARD ST"
 */
export function getBaseAddress(address: string): string {
  const normalized = normalizeAddress(address);
  // Remove trailing unit letter (e.g., "310 HOWARD ST B" -> "310 HOWARD ST")
  let base = normalized.replace(/\s+[A-Z]$/, "");
  // Remove unit letter after number (e.g., "310 B HOWARD ST" -> "310 HOWARD ST")
  base = base.replace(/^(\d+)\s+[A-Z]\s+/, "$1 ");
  return base;
}

/**
 * Get a map of normalized addresses to property IDs.
 */
export async function getAddressToPropertyMap(): Promise<Map<string, string>> {
  const properties = await prisma.property.findMany({
    select: { id: true, address: true },
  });

  const map = new Map<string, string>();
  for (const prop of properties) {
    const normalized = normalizeAddress(prop.address);
    map.set(normalized, prop.id);
  }
  return map;
}

/**
 * Match a service location to a property ID.
 * Uses fuzzy matching with configurable threshold.
 */
export function matchPropertyId(
  serviceLocation: string,
  addressMap: Map<string, string>,
  threshold: number = 0.8
): string | null {
  if (!serviceLocation || serviceLocation === "UNKNOWN") {
    return null;
  }

  const normalized = normalizeAddress(serviceLocation);
  const serviceBase = getBaseAddress(serviceLocation);

  // Direct match
  if (addressMap.has(normalized)) {
    return addressMap.get(normalized)!;
  }

  // Find best fuzzy match
  let bestMatch: { id: string; score: number } | null = null;

  for (const [propAddr, propId] of addressMap) {
    // Try exact base address match first
    const propBase = getBaseAddress(propAddr);
    if (serviceBase === propBase) {
      return propId;
    }

    // Fuzzy match on normalized addresses
    const score = similarity(normalized, propAddr);
    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { id: propId, score };
    }

    // Also try fuzzy match on base addresses (higher weight)
    const baseScore = similarity(serviceBase, propBase);
    if (baseScore >= threshold && (!bestMatch || baseScore > bestMatch.score)) {
      bestMatch = { id: propId, score: baseScore };
    }

    // Extract street number and check if same
    const serviceNum = normalized.match(/^(\d+)/)?.[1];
    const propNum = propAddr.match(/^(\d+)/)?.[1];
    if (serviceNum && propNum && serviceNum === propNum) {
      // Same street number - check street name similarity
      const serviceStreet = normalized.replace(/^\d+\s*[A-Z]?\s*/, "");
      const propStreet = propAddr.replace(/^\d+\s*[A-Z]?\s*/, "");
      const streetScore = similarity(serviceStreet, propStreet);
      if (streetScore >= 0.7 && (!bestMatch || streetScore > bestMatch.score)) {
        bestMatch = { id: propId, score: streetScore };
      }
    }
  }

  return bestMatch?.id || null;
}

/**
 * Check if a utility bill already exists for a property/period/type combination.
 */
export async function checkDuplicateBill(
  propertyId: string,
  type: string,
  period: string
): Promise<boolean> {
  const existing = await prisma.utilityBill.findFirst({
    where: {
      propertyId,
      type,
      period,
    },
  });
  return !!existing;
}

/**
 * Create a utility bill record and optionally link to the parsed bill.
 */
export async function createUtilityBill(params: {
  propertyId: string;
  provider: string;
  type: string;
  amount: number;
  billingStart: Date;
  billingEnd: Date;
  period: string;
}): Promise<string> {
  const bill = await prisma.utilityBill.create({
    data: {
      propertyId: params.propertyId,
      provider: params.provider,
      type: params.type,
      amount: params.amount,
      billingStart: params.billingStart,
      billingEnd: params.billingEnd,
      period: params.period,
    },
  });
  return bill.id;
}
