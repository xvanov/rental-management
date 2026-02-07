import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Lease ID is required" },
        { status: 400 }
      );
    }

    // Fetch lease with all related data
    const lease = await prisma.lease.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: {
          include: { property: true },
        },
        template: true,
      },
    });

    if (!lease) {
      return NextResponse.json(
        { error: "Lease not found" },
        { status: 404 }
      );
    }

    // Load lessor signature image as base64
    const signaturePath = path.join(process.cwd(), "assets", "signatures", "lessor-signature.png");
    let signatureBase64 = "";
    try {
      const signatureBuffer = fs.readFileSync(signaturePath);
      signatureBase64 = signatureBuffer.toString("base64");
    } catch (err) {
      console.warn("Could not load lessor signature:", err);
    }

    // Convert lease content to HTML
    const htmlContent = generateLeaseHTML(lease, signatureBase64);

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      margin: {
        top: "0.75in",
        bottom: "1in",
        left: "0.75in",
        right: "0.75in",
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; font-size: 9pt; font-family: 'Times New Roman', Times, serif; text-align: center; color: #666;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
    });

    await browser.close();

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lease-${lease.tenant.lastName}-${lease.unit.name}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate lease PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

interface LeaseWithRelations {
  id: string;
  content: string;
  rentAmount: number | null;
  version: number;
  startDate: Date;
  endDate: Date | null;
  signedAt: Date | null;
  status: string;
  createdAt: Date;
  tenant: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
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

function generateLeaseHTML(lease: LeaseWithRelations, signatureBase64: string): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Convert markdown-style content to HTML, but handle signature section specially
  const contentHtml = convertContentToHTML(lease.content, signatureBase64, currentDate);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: Letter;
      margin: 0.75in;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      margin: 0;
      padding: 0;
    }

    .content {
      font-family: 'Times New Roman', Times, serif;
    }

    .content h1 {
      font-size: 14pt;
      font-weight: bold;
      margin: 12pt 0 6pt 0;
      text-align: center;
    }

    .content h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 10pt 0 4pt 0;
      border-bottom: 1px solid #ccc;
      padding-bottom: 2pt;
    }

    .content h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 8pt 0 3pt 0;
    }

    .content p {
      margin: 0 0 4pt 0;
      text-align: justify;
    }

    .content ul, .content ol {
      margin: 0 0 4pt 0;
      padding-left: 20pt;
    }

    .content li {
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .content hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 10pt 0;
    }

    .content strong, .content b {
      font-weight: bold;
    }

    .signature-section {
      margin-top: 24pt;
      page-break-inside: avoid;
    }

    .signature-block {
      margin-bottom: 36pt;
    }

    .signature-block .party-label {
      font-weight: bold;
      margin-bottom: 8pt;
    }

    .signature-block .signature-line {
      display: flex;
      align-items: flex-end;
      gap: 24pt;
      margin-top: 8pt;
    }

    .signature-block .signature-field {
      flex: 1;
    }

    .signature-block .signature-field .line {
      border-bottom: 1px solid #000;
      min-height: 40pt;
      position: relative;
    }

    .signature-block .signature-field .line img {
      position: absolute;
      bottom: 0;
      left: 0;
      max-height: 50pt;
      max-width: 150pt;
    }

    .signature-block .signature-field .label {
      font-size: 9pt;
      margin-top: 2pt;
    }

    .signature-block .date-field {
      width: 150pt;
    }

    .signature-block .date-field .line {
      border-bottom: 1px solid #000;
      min-height: 20pt;
      padding-bottom: 2pt;
    }

    .signature-block .date-field .label {
      font-size: 9pt;
      margin-top: 2pt;
    }

    .signature-block .printed-name {
      font-size: 10pt;
      margin-top: 4pt;
    }
  </style>
</head>
<body>
  <div class="content">
    ${contentHtml}
  </div>
</body>
</html>
  `;
}

function convertContentToHTML(content: string, signatureBase64: string, currentDate: string): string {
  // Extract lessor name from the content (it's in the signature section)
  const lessorNameMatch = content.match(/\*\*Lessor:\*\*\s*([^\n]+)/);
  const lessorName = lessorNameMatch ? lessorNameMatch[1].trim() : "";

  // Split content into main body and addenda
  // Look for "# Addendum" which starts the addenda section
  const addendaMatch = content.match(/\n(# Addendum[\s\S]*)$/);
  let mainBody = content;
  let addendaContent = "";

  if (addendaMatch) {
    mainBody = content.substring(0, content.indexOf(addendaMatch[0]));
    addendaContent = addendaMatch[1];
  }

  // Check if there's a signature section in the main body and handle it specially
  const signatureSectionRegex = /## 10\) Signatures[\s\S]*$/;
  const hasSignatureSection = signatureSectionRegex.test(mainBody);

  let signatureHtml = "";

  if (hasSignatureSection) {
    // Remove the signature section from main body - we'll add it as custom HTML
    mainBody = mainBody.replace(signatureSectionRegex, "");

    // Generate custom signature section HTML
    signatureHtml = `
      <div class="signature-section">
        <h2>10) Signatures</h2>

        <div class="signature-block">
          <div class="party-label">Lessor: ${lessorName}</div>
          <div class="signature-line">
            <div class="signature-field">
              <div class="line">
                ${signatureBase64 ? `<img src="data:image/png;base64,${signatureBase64}" alt="Lessor Signature" />` : ""}
              </div>
              <div class="label">Signature</div>
            </div>
            <div class="date-field">
              <div class="line">${currentDate}</div>
              <div class="label">Date</div>
            </div>
          </div>
        </div>

        <div class="signature-block">
          <div class="party-label">Tenant: _____________________________</div>
          <div class="printed-name">Print Name: _____________________________</div>
          <div class="signature-line">
            <div class="signature-field">
              <div class="line"></div>
              <div class="label">Signature</div>
            </div>
            <div class="date-field">
              <div class="line"></div>
              <div class="label">Date</div>
            </div>
          </div>
        </div>
      </div>
      <hr>
    `;
  }

  // Helper function to convert markdown to HTML
  const convertMarkdownToHtml = (markdown: string): string => {
    let html = markdown;

    // Escape HTML entities first
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Convert markdown headers
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");

    // Convert horizontal rules
    html = html.replace(/^---+$/gm, "<hr>");

    // Convert bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Convert lists (basic)
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");

    // Wrap consecutive li elements in ul
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Convert line breaks to paragraphs for non-list, non-header content
    const lines = html.split("\n");
    let result = "";
    let inParagraph = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inParagraph) {
          result += "</p>\n";
          inParagraph = false;
        }
        continue;
      }

      // Skip if it's already HTML
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("</ul") ||
        trimmed.startsWith("<li")
      ) {
        if (inParagraph) {
          result += "</p>\n";
          inParagraph = false;
        }
        result += line + "\n";
        continue;
      }

      if (!inParagraph) {
        result += "<p>";
        inParagraph = true;
      } else {
        result += " ";
      }
      result += trimmed;
    }

    if (inParagraph) {
      result += "</p>";
    }

    return result;
  };

  // Convert main body and addenda separately
  const mainBodyHtml = convertMarkdownToHtml(mainBody);
  const addendaHtml = addendaContent ? convertMarkdownToHtml(addendaContent) : "";

  // Combine: main body + signature section + addenda
  return mainBodyHtml + signatureHtml + addendaHtml;
}
