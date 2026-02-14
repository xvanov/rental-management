import { prisma } from "@/lib/db";
import type { ParsedPayment, MatchedPayment } from "./types";

// Known aliases and overrides for sender names that don't match tenant records.
// "unknown" means we can't identify the sender — skip matching.
const MANUAL_OVERRIDES: Record<string, string> = {
  "big kea": "ikea",
  "maritza cora": "rafael", // note says "LaBasta rent"
  "pab lopez": "rafael", // partner paying on behalf
  "beverly joseph": "xavier", // note: "Xaviers July Rent"
  "lakeshia mills": "aaron", // notes: "Aaron (Jay) Mills" — parent paying
  "jesus mota": "kalin ivanov", // note: "Kalin Ivanov"
  "nique": "unknown", // skip, unidentifiable
  "drew": "unknown",
  "ron": "unknown", // need context
  "zae": "unknown",
  "christian": "unknown",
  "academia profe juan": "unknown", // not a tenant
  "andrea cruz": "unknown", // raffle ticket
  "carolina parker": "unknown", // raffle ticket
  "dulce pacheco": "unknown", // raffle ticket
  "izamar ramirez garcia": "unknown",
  "laura olmos velasco": "unknown", // raffle ticket
  "lisandra saenz lucero": "unknown",
  "luciane de mello": "unknown", // raffle ticket
  "madynes ileiths gavilan rojas": "unknown",
  "marisa martinez": "unknown",
  "marisol hernandez": "unknown",
  "natalia rodriguez muxica": "unknown",
  "marta cardenas alfonso": "unknown",
  "the hairesidence llc": "unknown",
  "wesgami properties llc": "unknown",
  "vesselina d bakalov": "unknown",
  "shortstopunc llc": "unknown",
  "damaris lopez": "unknown", // raffle
  "taylor dibella": "unknown",
  "david jamison": "unknown", // paid for someone not in DB
  "amber martinez": "unknown", // deposit for Ezekiel (not in DB)
  "humberto eguia herrera": "unknown",
};

interface TenantRecord {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string; // normalized: lowercase, trimmed
  fullNameReversed: string; // normalized: "lastname firstname"
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build a lookup structure from all tenants in the database.
 * Fetches all tenants (active and inactive) for historical matching.
 */
async function buildTenantLookup(): Promise<TenantRecord[]> {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  return tenants.map((t) => ({
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    fullName: normalize(`${t.firstName} ${t.lastName}`),
    fullNameReversed: normalize(`${t.lastName} ${t.firstName}`),
  }));
}

/**
 * Try to find a tenant by manual override mapping.
 * Returns the matched tenant record or null.
 */
function tryManualOverride(
  senderName: string,
  tenants: TenantRecord[]
): { tenant: TenantRecord | null; isUnknown: boolean } {
  const normalized = normalize(senderName);
  const override = MANUAL_OVERRIDES[normalized];

  if (!override) {
    return { tenant: null, isUnknown: false };
  }

  if (override === "unknown") {
    return { tenant: null, isUnknown: true };
  }

  const overrideNormalized = normalize(override);
  const match = tenants.find((t) => t.fullName === overrideNormalized);
  return { tenant: match ?? null, isUnknown: false };
}

/**
 * Try exact match: case-insensitive comparison of sender name against
 * "firstName lastName" and "lastName firstName" of all tenants.
 */
function tryExactMatch(
  senderName: string,
  tenants: TenantRecord[]
): TenantRecord | null {
  const normalized = normalize(senderName);

  for (const tenant of tenants) {
    if (normalized === tenant.fullName || normalized === tenant.fullNameReversed) {
      return tenant;
    }
  }

  return null;
}

/**
 * Try fuzzy match using simple containment and partial name matching.
 *
 * Strategies (in order):
 * 1. Sender name contains the tenant's full name, or vice versa
 * 2. Both first name and last name appear individually in the sender name
 * 3. Last name match if the last name is unique among all tenants
 */
function tryFuzzyMatch(
  senderName: string,
  tenants: TenantRecord[]
): TenantRecord | null {
  const normalized = normalize(senderName);

  // Strategy 1: containment — sender contains full tenant name or vice versa
  for (const tenant of tenants) {
    if (normalized.includes(tenant.fullName) || tenant.fullName.includes(normalized)) {
      return tenant;
    }
    if (
      normalized.includes(tenant.fullNameReversed) ||
      tenant.fullNameReversed.includes(normalized)
    ) {
      return tenant;
    }
  }

  // Strategy 2: both first and last name appear in sender name
  const matches: TenantRecord[] = [];
  for (const tenant of tenants) {
    const first = normalize(tenant.firstName);
    const last = normalize(tenant.lastName);
    if (normalized.includes(first) && normalized.includes(last)) {
      matches.push(tenant);
    }
  }
  if (matches.length === 1) {
    return matches[0];
  }

  // Strategy 3: unique last name match
  const senderParts = normalized.split(" ");
  for (const part of senderParts) {
    if (part.length < 2) continue; // skip single chars

    const lastNameMatches = tenants.filter(
      (t) => normalize(t.lastName) === part
    );
    if (lastNameMatches.length === 1) {
      return lastNameMatches[0];
    }
  }

  return null;
}

/**
 * Match an array of parsed payments to tenant records in the database.
 *
 * For each payment, tries matching in order:
 * 1. Manual override map (hardcoded aliases)
 * 2. Exact match (case-insensitive full name comparison)
 * 3. Fuzzy match (containment, partial name, unique last name)
 * 4. Unmatched
 */
export async function matchPaymentsToTenants(
  payments: ParsedPayment[]
): Promise<MatchedPayment[]> {
  const tenants = await buildTenantLookup();

  return payments.map((payment) => {
    // 1. Manual override
    const { tenant: manualTenant, isUnknown } = tryManualOverride(
      payment.senderName,
      tenants
    );

    if (isUnknown) {
      return {
        ...payment,
        tenantId: null,
        tenantName: null,
        matchConfidence: "unmatched" as const,
      };
    }

    if (manualTenant) {
      return {
        ...payment,
        tenantId: manualTenant.id,
        tenantName: `${manualTenant.firstName} ${manualTenant.lastName}`,
        matchConfidence: "manual" as const,
      };
    }

    // 2. Exact match
    const exactTenant = tryExactMatch(payment.senderName, tenants);
    if (exactTenant) {
      return {
        ...payment,
        tenantId: exactTenant.id,
        tenantName: `${exactTenant.firstName} ${exactTenant.lastName}`,
        matchConfidence: "exact" as const,
      };
    }

    // 3. Fuzzy match
    const fuzzyTenant = tryFuzzyMatch(payment.senderName, tenants);
    if (fuzzyTenant) {
      return {
        ...payment,
        tenantId: fuzzyTenant.id,
        tenantName: `${fuzzyTenant.firstName} ${fuzzyTenant.lastName}`,
        matchConfidence: "fuzzy" as const,
      };
    }

    // 4. Unmatched
    return {
      ...payment,
      tenantId: null,
      tenantName: null,
      matchConfidence: "unmatched" as const,
    };
  });
}

/**
 * Generate a summary report from matched payments.
 */
export async function getMatchReport(matched: MatchedPayment[]): Promise<{
  matched: number;
  unmatched: number;
  byConfidence: Record<string, number>;
  unmatchedNames: string[];
}> {
  const byConfidence: Record<string, number> = {};
  const unmatchedNames: string[] = [];

  for (const payment of matched) {
    byConfidence[payment.matchConfidence] =
      (byConfidence[payment.matchConfidence] ?? 0) + 1;

    if (payment.matchConfidence === "unmatched") {
      if (!unmatchedNames.includes(payment.senderName)) {
        unmatchedNames.push(payment.senderName);
      }
    }
  }

  const unmatchedCount = byConfidence["unmatched"] ?? 0;

  return {
    matched: matched.length - unmatchedCount,
    unmatched: unmatchedCount,
    byConfidence,
    unmatchedNames,
  };
}
