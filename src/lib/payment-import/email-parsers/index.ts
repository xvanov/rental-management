import { EmailParseResult } from "../types";
import { parseVenmoEmail } from "./venmo-email";
import { parseCashAppEmail } from "./cashapp-email";
import { parsePayPalEmail } from "./paypal-email";
import { parseZelleEmail } from "./zelle-email";

export { parseVenmoEmail } from "./venmo-email";
export { parseCashAppEmail } from "./cashapp-email";
export { parsePayPalEmail } from "./paypal-email";
export { parseZelleEmail } from "./zelle-email";

/**
 * Routes an email to the appropriate payment parser based on the sender address.
 * Returns the parsed payment result, or null if the email is not a recognized
 * payment notification.
 */
export async function parsePaymentEmail(
  from: string,
  raw: Buffer | string
): Promise<EmailParseResult | null> {
  const normalizedFrom = from.toLowerCase().trim();

  // Strip display name if present, e.g. "Venmo <venmo@venmo.com>" -> "venmo@venmo.com"
  const emailMatch = normalizedFrom.match(/<([^>]+)>/);
  const emailAddress = emailMatch ? emailMatch[1] : normalizedFrom;

  switch (emailAddress) {
    case "venmo@venmo.com":
      return parseVenmoEmail(raw);

    case "cash@square.com":
      return parseCashAppEmail(raw);

    case "service@paypal.com":
      return parsePayPalEmail(raw);

    case "customerservice@ealerts.bankofamerica.com":
      return parseZelleEmail(raw);

    default:
      return null;
  }
}
