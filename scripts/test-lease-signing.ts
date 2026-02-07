import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local"), override: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { sendPdfForSignature, isXodoSignConfigured } from "../src/lib/integrations/xodo-sign";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Test script that mimics the exact lease signing flow from the dashboard.
 * This helps debug why the actual lease signing might not be sending emails.
 *
 * Usage: npx tsx scripts/test-lease-signing.ts [leaseId]
 */

interface LeaseForPdf {
  id: string;
  content: string;
  rentAmount: number | null;
  version: number;
  startDate: Date;
  endDate: Date | null;
  tenant: {
    firstName: string;
    lastName: string;
    email: string | null;
  };
  unit: {
    name: string;
    property: {
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
  template: { name: string } | null;
}

async function generateLeasePdf(lease: LeaseForPdf): Promise<Buffer> {
  console.log("Generating PDF from lease content...");

  // Load lessor signature image as base64
  const signaturePath = path.join(process.cwd(), "assets", "signatures", "lessor-signature.png");
  let signatureBase64 = "";
  try {
    const signatureBuffer = fs.readFileSync(signaturePath);
    signatureBase64 = signatureBuffer.toString("base64");
    console.log("  Loaded lessor signature image");
  } catch (err) {
    console.warn("  Could not load lessor signature:", err);
  }

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Simplified HTML for testing
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 1in; }
    h1 { text-align: center; }
    .signature-section { margin-top: 50pt; }
    .signature-line { border-bottom: 1px solid #000; width: 300px; height: 50px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>LEASE AGREEMENT</h1>
  <p><strong>Tenant:</strong> ${lease.tenant.firstName} ${lease.tenant.lastName}</p>
  <p><strong>Property:</strong> ${lease.unit.name} at ${lease.unit.property.address}</p>
  <p><strong>Start Date:</strong> ${lease.startDate.toLocaleDateString()}</p>
  <p><strong>Rent Amount:</strong> $${lease.rentAmount || 0}</p>

  <div style="white-space: pre-wrap; margin-top: 20pt;">
${lease.content.substring(0, 2000)}...
  </div>

  <div class="signature-section">
    <h2>Signatures</h2>
    <p>Lessor Signature:</p>
    ${signatureBase64 ? `<img src="data:image/png;base64,${signatureBase64}" style="max-height: 50pt;" />` : ""}
    <p>Date: ${currentDate}</p>

    <p style="margin-top: 30pt;">Tenant Signature:</p>
    <div class="signature-line"></div>
    <p>Date: _______________</p>
  </div>
</body>
</html>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "Letter",
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    printBackground: true,
  });

  await browser.close();

  console.log(`  Generated PDF: ${pdfBuffer.length} bytes`);
  return Buffer.from(pdfBuffer);
}

async function main() {
  const leaseId = process.argv[2];

  console.log("=".repeat(60));
  console.log("Lease Signing Flow Test");
  console.log("=".repeat(60));

  if (!isXodoSignConfigured()) {
    console.error("❌ XODO_SIGN_API_TOKEN is not configured");
    process.exit(1);
  }
  console.log("✅ Xodo Sign is configured");

  // Find the lease
  let lease: LeaseForPdf | null;

  if (leaseId) {
    console.log(`\nFetching lease: ${leaseId}`);
    lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        template: true,
      },
    });
  } else {
    console.log("\nFinding most recent DRAFT lease...");
    lease = await prisma.lease.findFirst({
      where: { status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      include: {
        tenant: true,
        unit: { include: { property: true } },
        template: true,
      },
    });
  }

  if (!lease) {
    console.error("❌ No lease found");
    process.exit(1);
  }

  console.log(`\n📋 Lease Details:`);
  console.log(`   ID: ${lease.id}`);
  console.log(`   Tenant: ${lease.tenant.firstName} ${lease.tenant.lastName}`);
  console.log(`   Email: ${lease.tenant.email}`);
  console.log(`   Unit: ${lease.unit.name}`);
  console.log(`   Status: Draft`);
  console.log(`   Content length: ${lease.content.length} characters`);

  if (!lease.tenant.email) {
    console.error("❌ Tenant has no email address");
    process.exit(1);
  }

  try {
    // Step 1: Generate PDF
    console.log("\n📄 Step 1: Generate PDF");
    const pdfBuffer = await generateLeasePdf(lease);

    // Step 2: Send for signature
    console.log("\n📧 Step 2: Send for signature via Xodo Sign");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const webhookUrl = `${appUrl}/api/webhooks/xodo-sign`;
    console.log(`   Webhook URL: ${webhookUrl}`);

    const result = await sendPdfForSignature({
      pdfBuffer,
      fileName: `lease-${lease.tenant.lastName}-${lease.unit.name}.pdf`,
      signerEmail: lease.tenant.email,
      signerName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      webhookUrl,
      message: `Please sign the lease for ${lease.unit.name}`,
      signatureFields: {
        tenantNameField: { x: 140, y: 680, page: 0 },
        tenantSignatureField: { x: 72, y: 720, page: 0 },
        tenantDateField: { x: 380, y: 720, page: 0 },
      },
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ LEASE SIGNING TEST COMPLETED");
    console.log("=".repeat(60));
    console.log(`   Document ID: ${result.documentId}`);
    console.log(`   Invite ID: ${result.inviteId || "N/A"}`);
    if (result.signingUrl) {
      console.log(`\n🔗 SIGNING LINK (no account required):`);
      console.log(`   ${result.signingUrl}`);
    }
    console.log(`\n📬 An email was also sent to ${lease.tenant.email} (if not self-signing).`);

  } catch (error) {
    console.error("\n❌ LEASE SIGNING FAILED");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
