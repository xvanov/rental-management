/**
 * Quick diagnostic to test SendGrid email sending.
 * Run with: npx tsx scripts/test-sendgrid.ts <recipient-email>
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local"), override: true });

import sgMail from "@sendgrid/mail";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/test-sendgrid.ts <recipient-email>");
    process.exit(1);
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? "noreply@example.com";
  const fromName = process.env.SENDGRID_FROM_NAME ?? "Rental Ops";

  console.log("SENDGRID_API_KEY:", apiKey ? `set (${apiKey.length} chars, starts with ${apiKey.substring(0, 5)}...)` : "NOT SET");
  console.log("SENDGRID_FROM_EMAIL:", fromEmail);
  console.log("SENDGRID_FROM_NAME:", fromName);
  console.log("Sending to:", to);
  console.log();

  if (!apiKey) {
    console.error("SENDGRID_API_KEY is not set in .env.local");
    process.exit(1);
  }

  sgMail.setApiKey(apiKey);

  try {
    const [response] = await sgMail.send({
      to,
      from: { email: fromEmail, name: fromName },
      subject: "Test Email from Rental Management",
      text: "If you're reading this, SendGrid is working correctly.",
      html: "<p>If you're reading this, <strong>SendGrid is working correctly.</strong></p>",
    });

    console.log("SUCCESS! Status code:", response.statusCode);
    console.log("Headers:", JSON.stringify(response.headers, null, 2));
  } catch (error: unknown) {
    console.error("FAILED to send email:");
    if (error && typeof error === "object" && "response" in error) {
      const sgError = error as { response: { status: number; body: unknown; headers: unknown } };
      console.error("  Status:", sgError.response.status);
      console.error("  Body:", JSON.stringify(sgError.response.body, null, 2));
    } else if (error instanceof Error) {
      console.error("  Error:", error.message);
    } else {
      console.error("  Error:", error);
    }

    console.log();
    console.log("Common fixes:");
    console.log("  403 Forbidden → Your API key doesn't have 'Mail Send' permission");
    console.log("  401 Unauthorized → API key is invalid or revoked");
    console.log("  403 with 'sender identity' → The from email needs to be verified in SendGrid");
    console.log("    Go to: Settings → Sender Authentication → Verify a Single Sender");
  }
}

main();
