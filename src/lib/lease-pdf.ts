import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

interface LeaseForPdf {
  content: string;
  tenant: {
    firstName: string;
    lastName: string;
  };
  unit: {
    name: string;
    property: {
      address: string;
    };
  };
}

/**
 * Generate a complete lease HTML document from markdown content.
 * Used by both the PDF download route and the signing completion route.
 *
 * @param content - The lease markdown content
 * @param signatureBase64 - Base64-encoded lessor signature image (optional)
 * @param currentDate - Formatted date string for lessor signature
 * @param tenantSignature - If provided, fills in the tenant signature fields (for signed PDFs)
 */
export function generateLeaseHtml(
  content: string,
  signatureBase64: string,
  currentDate: string,
  tenantSignature?: { name: string; signatureDataUrl: string; date: string }
): string {
  const contentHtml = convertContentToHtml(content, signatureBase64, currentDate, tenantSignature);

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
      page-break-before: always;
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

/**
 * Load the lessor signature image as a base64 string.
 */
export function loadLessorSignature(): string {
  const signaturePath = path.join(process.cwd(), "assets", "signatures", "lessor-signature.png");
  try {
    const signatureBuffer = fs.readFileSync(signaturePath);
    return signatureBuffer.toString("base64");
  } catch (err) {
    console.warn("Could not load lessor signature:", err);
    return "";
  }
}

/**
 * Generate a PDF buffer from a lease, using Puppeteer to render HTML.
 * Used for both the unsigned PDF download and signed document generation.
 */
export async function generateLeasePdfBuffer(
  lease: LeaseForPdf,
  tenantSignature?: { name: string; signatureDataUrl: string; date: string }
): Promise<Buffer> {
  const signatureBase64 = loadLessorSignature();
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const htmlContent = generateLeaseHtml(lease.content, signatureBase64, currentDate, tenantSignature);

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

  return Buffer.from(pdfBuffer);
}

function convertContentToHtml(
  content: string,
  signatureBase64: string,
  currentDate: string,
  tenantSignature?: { name: string; signatureDataUrl: string; date: string }
): string {
  // When signing, replace the blank tenant name on the first page with the actual name
  let processedContent = content;
  if (tenantSignature) {
    processedContent = processedContent.replace(
      /\*\*_{3,}\*\*(\s*\("Tenant"\))/,
      `**${tenantSignature.name}**$1`
    );
  }

  const lessorNameMatch = processedContent.match(/\*\*Lessor:\*\*\s*([^\n]+)/);
  const lessorName = lessorNameMatch ? lessorNameMatch[1].trim() : "";

  const addendaMatch = processedContent.match(/\n(# Addendum[\s\S]*)$/);
  let mainBody = processedContent;
  let addendaContent = "";

  if (addendaMatch) {
    mainBody = processedContent.substring(0, processedContent.indexOf(addendaMatch[0]));
    addendaContent = addendaMatch[1];
  }

  const signatureSectionRegex = /## 10\) Signatures[\s\S]*$/;
  const hasSignatureSection = signatureSectionRegex.test(mainBody);

  let signatureHtml = "";

  if (hasSignatureSection) {
    mainBody = mainBody.replace(signatureSectionRegex, "");

    // Tenant section: either filled (signed) or blank (unsigned)
    const tenantNameDisplay = tenantSignature ? tenantSignature.name : "_____________________________";
    const tenantPrintName = tenantSignature ? tenantSignature.name : "_____________________________";
    const tenantSignatureImg = tenantSignature
      ? `<img src="${tenantSignature.signatureDataUrl}" alt="Tenant Signature" />`
      : "";
    const tenantDateDisplay = tenantSignature ? tenantSignature.date : "";

    signatureHtml = `
      <div class="signature-section">
        <h2>10) Signatures</h2>
        <p>By signing below, the parties acknowledge that they have read this Agreement in its entirety, understand all terms and conditions, and agree to be bound by them.</p>

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
          <div class="party-label">Tenant: ${tenantNameDisplay}</div>
          <div class="printed-name">Print Name: ${tenantPrintName}</div>
          <div class="signature-line">
            <div class="signature-field">
              <div class="line">
                ${tenantSignatureImg}
              </div>
              <div class="label">Signature</div>
            </div>
            <div class="date-field">
              <div class="line">${tenantDateDisplay}</div>
              <div class="label">Date</div>
            </div>
          </div>
        </div>
      </div>
      <hr>
    `;
  }

  const convertMarkdownToHtml = (markdown: string): string => {
    let html = markdown;

    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^---+$/gm, "<hr>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

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

  const mainBodyHtml = convertMarkdownToHtml(mainBody);
  const addendaHtml = addendaContent ? convertMarkdownToHtml(addendaContent) : "";

  return mainBodyHtml + signatureHtml + addendaHtml;
}
