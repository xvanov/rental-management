/**
 * Lease clause parser - extracts enforcement rules from lease content.
 * Looks for common clause patterns to create structured LeaseClause records.
 */

interface ParsedClause {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export function parseLeaseClausesFromContent(
  content: string,
  rentAmount: number
): ParsedClause[] {
  const clauses: ParsedClause[] = [];

  // Always add a rent clause with the known amount
  clauses.push({
    type: "RENT",
    content: `Monthly rent: $${rentAmount.toFixed(2)}`,
    metadata: {
      amount: rentAmount,
      frequency: "monthly",
    },
  });

  // Parse rent due date (look for patterns like "due on the 1st", "rent is due by the 1st")
  const dueDateMatch = content.match(
    /(?:rent\s+(?:is\s+)?due|due\s+(?:on|by))\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s+(?:day\s+)?of\s+(?:each|every)\s+month)?/i
  );
  if (dueDateMatch) {
    const dueDay = parseInt(dueDateMatch[1]);
    clauses.push({
      type: "RENT_DUE_DATE",
      content: `Rent is due on the ${dueDay}${getOrdinalSuffix(dueDay)} of each month`,
      metadata: { dueDay },
    });
  }

  // Parse late fee (look for patterns like "late fee of $50", "$50 late fee", "5% late fee")
  const lateFeeMatch = content.match(
    /late\s+fee\s+(?:of\s+)?\$(\d+(?:\.\d{2})?)|(?:\$(\d+(?:\.\d{2})?)\s+late\s+fee)|late\s+fee\s+(?:of\s+)?(\d+)%/i
  );
  if (lateFeeMatch) {
    const feeAmount = lateFeeMatch[1] || lateFeeMatch[2];
    const feePercent = lateFeeMatch[3];
    if (feeAmount) {
      clauses.push({
        type: "LATE_FEE",
        content: `Late fee: $${parseFloat(feeAmount).toFixed(2)}`,
        metadata: {
          amount: parseFloat(feeAmount),
          type: "fixed",
        },
      });
    } else if (feePercent) {
      const percentFee = (rentAmount * parseInt(feePercent)) / 100;
      clauses.push({
        type: "LATE_FEE",
        content: `Late fee: ${feePercent}% ($${percentFee.toFixed(2)})`,
        metadata: {
          percentage: parseInt(feePercent),
          amount: percentFee,
          type: "percentage",
        },
      });
    }
  }

  // Parse grace period (look for patterns like "grace period of 5 days", "5-day grace period")
  const graceMatch = content.match(
    /(?:grace\s+period\s+(?:of\s+)?(\d+)\s*(?:-?\s*day)?)|(?:(\d+)\s*-?\s*day\s+grace\s+period)/i
  );
  if (graceMatch) {
    const graceDays = parseInt(graceMatch[1] || graceMatch[2]);
    clauses.push({
      type: "GRACE_PERIOD",
      content: `Grace period: ${graceDays} days`,
      metadata: { days: graceDays },
    });
  }

  // Parse security deposit
  const depositMatch = content.match(
    /(?:security\s+)?deposit\s+(?:of\s+|in\s+the\s+amount\s+of\s+)?\$(\d+(?:,\d{3})*(?:\.\d{2})?)/i
  );
  if (depositMatch) {
    const depositAmount = parseFloat(depositMatch[1].replace(/,/g, ""));
    clauses.push({
      type: "SECURITY_DEPOSIT",
      content: `Security deposit: $${depositAmount.toFixed(2)}`,
      metadata: { amount: depositAmount },
    });
  }

  // Parse lease term/duration
  const termMatch = content.match(
    /(?:term|duration|period)\s+(?:of\s+|is\s+)?(\d+)\s*(month|year)s?/i
  );
  if (termMatch) {
    const termLength = parseInt(termMatch[1]);
    const termUnit = termMatch[2].toLowerCase();
    clauses.push({
      type: "LEASE_TERM",
      content: `Lease term: ${termLength} ${termUnit}(s)`,
      metadata: {
        length: termLength,
        unit: termUnit,
        totalMonths: termUnit === "year" ? termLength * 12 : termLength,
      },
    });
  }

  // Parse utilities responsibility
  const utilitiesMatch = content.match(
    /(?:tenant|lessee|resident)\s+(?:shall\s+be\s+|is\s+)?responsible\s+for\s+(?:paying\s+)?(?:all\s+)?(?:the\s+following\s+)?utilities?[:\s]+([^.]+)/i
  );
  if (utilitiesMatch) {
    clauses.push({
      type: "UTILITIES",
      content: `Tenant utilities: ${utilitiesMatch[1].trim()}`,
      metadata: {
        description: utilitiesMatch[1].trim(),
        split: "tenant",
      },
    });
  }

  // Parse notice to vacate requirement
  const noticeMatch = content.match(
    /(\d+)\s*-?\s*days?\s+(?:written\s+)?notice\s+(?:to\s+(?:vacate|terminate)|before\s+(?:moving|vacating))/i
  );
  if (noticeMatch) {
    const noticeDays = parseInt(noticeMatch[1]);
    clauses.push({
      type: "NOTICE_TO_VACATE",
      content: `Notice to vacate: ${noticeDays} days`,
      metadata: { days: noticeDays },
    });
  }

  // Parse cleaning requirements
  const cleaningMatch = content.match(
    /(?:common\s+area|shared\s+space)\s+cleaning/i
  );
  if (cleaningMatch) {
    clauses.push({
      type: "CLEANING",
      content: "Common area cleaning requirement",
      metadata: { required: true },
    });
  }

  return clauses;
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
