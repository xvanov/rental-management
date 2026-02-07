import { config } from "dotenv";
config({ path: ".env.local" });
config();

import twilio from "twilio";

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error("Missing Twilio credentials in .env.local");
    console.error("Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER");
    process.exit(1);
  }

  // F7: Use env var or CLI arg for test phone number
  const phone = process.argv[2] || process.env.TEST_PHONE_NUMBER;
  if (!phone) {
    console.error("Usage: npx tsx scripts/test-sms.ts <phone_number>");
    console.error("Or set TEST_PHONE_NUMBER in .env.local");
    process.exit(1);
  }
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const year = now.getFullYear();

  const testName = process.env.TEST_TENANT_NAME || "there";
  const message = `Hi ${testName},

Your utility charges for ${monthName} ${year}:

Electric: $45.00
Gas: $22.50
Water: $18.75

Total: $86.25

This is a test message from your rental management system.`;

  console.log(`Sending test SMS to ${phone}...`);
  console.log(`From: ${fromNumber}`);
  console.log("\nMessage:");
  console.log("---");
  console.log(message);
  console.log("---\n");

  try {
    const client = twilio(accountSid, authToken);
    const twilioMessage = await client.messages.create({
      to: phone,
      from: fromNumber,
      body: message,
    });

    console.log("✅ SMS sent successfully!");
    console.log(`Twilio SID: ${twilioMessage.sid}`);
    console.log(`Status: ${twilioMessage.status}`);
  } catch (error) {
    console.error("❌ Failed to send SMS");
    console.error(error);
    process.exit(1);
  }
}

main();
