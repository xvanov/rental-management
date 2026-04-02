import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import sgMail from "@sendgrid/mail";

async function main() {
  const apiKey = process.env.SENDGRID_API_KEY!;
  const from = process.env.SENDGRID_FROM_EMAIL || "noreply@example.com";

  console.log("API Key:", apiKey.substring(0, 10) + "...");
  console.log("From:", from);

  sgMail.setApiKey(apiKey);

  try {
    const [response] = await sgMail.send({
      to: "ivanovkalin7@gmail.com",
      from: { email: from, name: "Rentus Homes" },
      subject: "SendGrid Test — Rentus Homes",
      text: "If you're reading this, SendGrid is working.",
    });
    console.log("SUCCESS! Status:", response.statusCode);
  } catch (error: unknown) {
    const sgError = error as { response?: { status: number; body: unknown } };
    if (sgError.response) {
      console.log("FAILED! Status:", sgError.response.status);
      console.log("Body:", JSON.stringify(sgError.response.body, null, 2));
    } else {
      console.log("FAILED!", error);
    }
  }
}

main();
