import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local"), override: true });

/**
 * Check the status of a document in SignNow/Xodo Sign
 */

const XODO_BASE_URL = process.env.XODO_SIGN_BASE_URL || "https://api.signnow.com";

async function main() {
  const documentId = process.argv[2] || "2cf8f49f293749c281c54699577641397d4d7d7b";
  const token = process.env.XODO_SIGN_API_TOKEN;

  if (!token) {
    console.error("XODO_SIGN_API_TOKEN not configured");
    process.exit(1);
  }

  console.log(`Checking document: ${documentId}\n`);

  const response = await fetch(`${XODO_BASE_URL}/document/${documentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error(`Failed: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }

  const doc = await response.json();

  console.log("Document Info:");
  console.log(`  Name: ${doc.document_name}`);
  console.log(`  Pages: ${doc.page_count}`);
  console.log(`  Created: ${doc.created}`);
  console.log(`  Updated: ${doc.updated}`);

  console.log("\nSignature Fields:", doc.signatures?.length || 0);
  if (doc.signatures?.length > 0) {
    for (const sig of doc.signatures) {
      console.log(`  - Page ${sig.page_number}: ${sig.role || "no role"}`);
    }
  }

  console.log("\nText Fields:", doc.texts?.length || 0);
  if (doc.texts?.length > 0) {
    for (const text of doc.texts) {
      console.log(`  - Page ${text.page_number}: ${text.label || text.name || "no label"}`);
    }
  }

  console.log("\nField Invites:", doc.field_invites?.length || 0);
  if (doc.field_invites?.length > 0) {
    for (const invite of doc.field_invites) {
      console.log(`  - ${invite.signer_email}: ${invite.status}`);
    }
  }

  console.log("\nRequests:", doc.requests?.length || 0);
  if (doc.requests?.length > 0) {
    for (const req of doc.requests) {
      console.log(`  - ID: ${req.id}`);
      console.log(`    Signer: ${req.signer_email}`);
      console.log(`    Status: ${req.status}`);
      console.log(`    Created: ${req.created}`);
    }
  }

  // Check for any freeform invites
  console.log("\nFreeform Invites:", doc.freeform_invites?.length || 0);
  if (doc.freeform_invites?.length > 0) {
    for (const invite of doc.freeform_invites) {
      console.log(`  - ${invite.signer_email}: ${invite.status}`);
    }
  }

  // Full document structure for debugging
  console.log("\n--- Full Document Response ---");
  console.log(JSON.stringify(doc, null, 2));
}

main();
