import { config } from "dotenv";
config({ path: ".env.local" });
config();

/**
 * Test script for Xodo Sign (SignNow) integration.
 * This script tests the email sending functionality for e-signatures.
 *
 * Usage: npx tsx scripts/test-xodo-sign.ts [email]
 * Default email: ivanovkalin7@gmail.com
 */

const XODO_BASE_URL =
  process.env.XODO_SIGN_BASE_URL || "https://api.signnow.com";

function getApiToken(): string {
  const token = process.env.XODO_SIGN_API_TOKEN;
  if (!token) {
    throw new Error("XODO_SIGN_API_TOKEN is not configured");
  }
  return token;
}

async function testApiConnection(): Promise<boolean> {
  console.log("Testing Xodo Sign API connection...");
  const token = getApiToken();

  const response = await fetch(`${XODO_BASE_URL}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`API connection failed: ${response.status} - ${error}`);
    return false;
  }

  const user = await response.json();
  console.log("✅ API connection successful!");
  console.log(`   Logged in as: ${user.email || user.first_name || "Unknown"}`);
  return true;
}

async function uploadTestPdf(
  fileName: string
): Promise<{ id: string; name: string }> {
  console.log("\nUploading test PDF document...");
  const token = getApiToken();

  // Create a simple test PDF content (minimal PDF structure)
  const testPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test Lease Agreement) Tj
0 -50 Td
/F1 12 Tf
(Please sign below to confirm receipt) Tj
0 -100 Td
(Signature: ______________________) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000436 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
515
%%EOF`;

  const buffer = Buffer.from(testPdfContent);
  const base64 = buffer.toString("base64");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });

  const formData = new FormData();
  formData.append("file", blob, fileName);

  const response = await fetch(`${XODO_BASE_URL}/document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${error}`);
  }

  const doc = await response.json();
  console.log(`✅ Document uploaded! ID: ${doc.id}`);
  return { id: doc.id, name: fileName };
}

async function addFieldsToDocument(documentId: string): Promise<void> {
  console.log(`\nAdding signature fields to document...`);
  const token = getApiToken();

  // SignNow field format
  const fields = [
    {
      x: 100,
      y: 500,
      width: 200,
      height: 50,
      page_number: 0,
      required: true,
      role: "Signer",
      name: "signature_field",
      type: "signature",
    },
  ];

  const response = await fetch(`${XODO_BASE_URL}/document/${documentId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Add fields failed: ${response.status} - ${error}`);
  }

  console.log(`✅ Signature fields added!`);
}

async function sendSignatureRequestWithFields(
  documentId: string,
  email: string,
  name: string
): Promise<void> {
  console.log(`\nSending field invite to ${email}...`);
  const token = getApiToken();

  // Field invite format - array of signers (for documents with fields)
  const body = {
    to: [
      {
        email: email,
        role: "Signer",
        role_id: "",
        order: 1,
        reassign: "0",
        decline_by_signature: "0",
        reminder: 4,
        expiration_days: 30,
      },
    ],
    from: email, // Will be overridden by account email
  };

  const response = await fetch(
    `${XODO_BASE_URL}/document/${documentId}/invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Field invite failed: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`✅ Field invite sent!`);
  console.log(`   Invite ID: ${result.id || "N/A"}`);
  console.log(`   Status: ${result.status || "pending"}`);
}

async function sendFreeformSignatureRequest(
  documentId: string,
  email: string,
  name: string
): Promise<void> {
  console.log(`\nSending freeform invite to ${email}...`);
  const token = getApiToken();

  // Freeform invite format - simple string for 'to' field
  // (documents without fields - signer can place signature anywhere)
  const body = {
    to: email,
    from: email, // Will be overridden by account email
  };

  const response = await fetch(
    `${XODO_BASE_URL}/document/${documentId}/invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Freeform invite failed: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`✅ Freeform invite sent!`);
  console.log(`   Invite ID: ${result.id || "N/A"}`);
  console.log(`   Status: ${result.status || "pending"}`);
}

async function registerWebhook(
  documentId: string,
  callbackUrl: string
): Promise<void> {
  console.log(`\nRegistering webhook for document completion...`);
  const token = getApiToken();

  const response = await fetch(`${XODO_BASE_URL}/api/v2/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event: "document.complete",
      entity_id: documentId,
      action: "callback",
      attributes: {
        callback: callbackUrl,
      },
    }),
  });

  console.log(`   Response status: ${response.status}`);
  const responseText = await response.text();
  console.log(`   Response body: ${responseText || "(empty)"}`);

  if (!response.ok) {
    throw new Error(`Webhook registration failed: ${response.status} - ${responseText}`);
  }

  // Handle empty response (some tiers may return empty success)
  if (responseText) {
    const result = JSON.parse(responseText);
    console.log(`✅ Webhook registered!`);
    console.log(`   Webhook ID: ${result.id || "N/A"}`);
  } else {
    console.log(`✅ Webhook registration accepted (no response body)`);
  }
}

async function main() {
  const email = process.argv[2] || "ivanovkalin7@gmail.com";
  const mode = process.argv[3] || "field"; // "field" or "freeform"
  const name = "Test User";

  console.log("=".repeat(60));
  console.log("Xodo Sign (SignNow) Email Test");
  console.log("=".repeat(60));
  console.log(`Base URL: ${XODO_BASE_URL}`);
  console.log(`Target email: ${email}`);
  console.log(`Mode: ${mode} (use 'freeform' or 'field' as 3rd arg)`);
  console.log("");

  try {
    // Step 1: Test API connection
    const connected = await testApiConnection();
    if (!connected) {
      process.exit(1);
    }

    // Step 2: Upload test document
    const doc = await uploadTestPdf(`test-lease-${Date.now()}.pdf`);

    // Step 3: Add fields (for field invite mode)
    if (mode === "field") {
      await addFieldsToDocument(doc.id);
    }

    // Step 4: Send signature request (this sends the email)
    if (mode === "field") {
      await sendSignatureRequestWithFields(doc.id, email, name);
    } else {
      await sendFreeformSignatureRequest(doc.id, email, name);
    }

    // Step 5: Register webhook (optional, tests the fixed endpoint)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const webhookUrl = `${appUrl}/api/webhooks/xodo-sign`;
    console.log(`   Webhook URL: ${webhookUrl}`);

    try {
      await registerWebhook(doc.id, webhookUrl);
    } catch (webhookError) {
      console.log(`⚠️  Webhook registration failed (optional): ${webhookError}`);
      console.log("   The signature request email was still sent successfully.");
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ TEST COMPLETED SUCCESSFULLY");
    console.log("=".repeat(60));
    console.log(`\nCheck ${email} for the signature request email.`);
    console.log("The email should arrive within a few minutes.");
  } catch (error) {
    console.error("\n❌ TEST FAILED");
    console.error(error);
    process.exit(1);
  }
}

main();
