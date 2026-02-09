import { PDFDocument, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

/**
 * Stamp a signature image, signer name, and date onto the last page of a PDF.
 * Uses pdf-lib to overlay the signature onto the tenant signature area.
 */
export async function stampSignatureOnPdf(
  pdfBuffer: Buffer,
  signatureDataUrl: string,
  signerName: string,
  signedDate: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { height } = lastPage.getSize();

  // Embed the signature image (data URL is PNG)
  const signatureData = signatureDataUrl.replace(/^data:image\/png;base64,/, "");
  const signatureImage = await pdfDoc.embedPng(Buffer.from(signatureData, "base64"));

  // Scale signature to fit within the signature field area
  const sigDims = signatureImage.scale(0.5);
  const maxWidth = 150;
  const maxHeight = 40;
  const scale = Math.min(maxWidth / sigDims.width, maxHeight / sigDims.height, 1);

  // Position on the last page - tenant signature area
  // The signature section is on the last page via page-break-before: always
  // Tenant signature block is below the lessor block
  // These coordinates target the tenant signature line area
  const sigX = 72; // Left margin (0.75in * 96dpi * 0.75)
  const sigY = height - 380; // Approximate Y position for tenant signature line

  lastPage.drawImage(signatureImage, {
    x: sigX,
    y: sigY,
    width: sigDims.width * scale,
    height: sigDims.height * scale,
  });

  // Draw the signer name text
  const font = await pdfDoc.embedFont("Helvetica");
  lastPage.drawText(signerName, {
    x: sigX + 160,
    y: sigY + 5,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  // Draw the date
  lastPage.drawText(signedDate, {
    x: sigX + 380,
    y: sigY + 5,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

/**
 * Save a signed PDF document to the filesystem.
 * Returns the relative path to the saved file.
 */
export async function saveSignedDocument(
  leaseId: string,
  pdfBuffer: Buffer
): Promise<string> {
  const dir = path.join(process.cwd(), "data", "signed-leases");
  await fs.promises.mkdir(dir, { recursive: true });

  const fileName = `lease-${leaseId}.pdf`;
  const filePath = path.join(dir, fileName);
  await fs.promises.writeFile(filePath, pdfBuffer);

  return `data/signed-leases/${fileName}`;
}
