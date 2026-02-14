import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/auth-context";

/**
 * GET /api/notices/print?noticeId=xxx - Generate a printable HTML page for a notice.
 * Returns HTML that can be printed to PDF via the browser's print function.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);
    const noticeId = searchParams.get("noticeId");

    if (!noticeId) {
      return NextResponse.json({ error: "noticeId is required" }, { status: 400 });
    }

    const notice = await prisma.notice.findFirst({
      where: { id: noticeId, tenant: { unit: { property: { organizationId: ctx.organizationId } } } },
      include: {
        tenant: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            unit: {
              select: {
                name: true,
                property: { select: { address: true, city: true, state: true, zip: true } },
              },
            },
          },
        },
      },
    });

    if (!notice) {
      return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    }

    const tenantName = `${notice.tenant.firstName} ${notice.tenant.lastName}`;
    const property = notice.tenant.unit?.property;
    const propertyAddress = property
      ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`
      : "N/A";

    const noticeTypeLabel: Record<string, string> = {
      LATE_RENT: "Notice of Late Rent Payment",
      LEASE_VIOLATION: "Notice of Lease Violation",
      EVICTION_WARNING: "Eviction Warning Notice",
      DEPOSIT_DISPOSITION: "Security Deposit Disposition Notice",
      MOVE_OUT: "Notice to Vacate",
    };

    const title = noticeTypeLabel[notice.type] ?? "Notice";
    const escapedContent = notice.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - ${tenantName}</title>
  <style>
    @media print {
      body { margin: 0; padding: 1in; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 1in;
    }
    .header {
      text-align: center;
      margin-bottom: 2em;
      border-bottom: 2px solid #000;
      padding-bottom: 1em;
    }
    .header h1 {
      font-size: 16pt;
      margin: 0 0 0.5em 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .meta {
      margin-bottom: 2em;
    }
    .meta-row {
      display: flex;
      margin-bottom: 0.25em;
    }
    .meta-label {
      font-weight: bold;
      width: 120px;
      flex-shrink: 0;
    }
    .content {
      margin-bottom: 2em;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 3em;
      border-top: 1px solid #ccc;
      padding-top: 1em;
      font-size: 10pt;
      color: #666;
    }
    .signature-line {
      margin-top: 3em;
      border-top: 1px solid #000;
      width: 250px;
      padding-top: 0.25em;
      font-size: 10pt;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background: #000;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print / Save as PDF</button>

  <div class="header">
    <h1>${title}</h1>
  </div>

  <div class="meta">
    <div class="meta-row">
      <span class="meta-label">To:</span>
      <span>${tenantName}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Property:</span>
      <span>${propertyAddress}</span>
    </div>
    ${notice.tenant.unit ? `<div class="meta-row"><span class="meta-label">Unit:</span><span>${notice.tenant.unit.name}</span></div>` : ""}
    <div class="meta-row">
      <span class="meta-label">Date:</span>
      <span>${new Date(notice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
    </div>
    <div class="meta-row">
      <span class="meta-label">Notice Type:</span>
      <span>${notice.type.replace(/_/g, " ")}</span>
    </div>
    ${notice.sentAt ? `<div class="meta-row"><span class="meta-label">Sent:</span><span>${new Date(notice.sentAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span></div>` : ""}
  </div>

  <div class="content">${escapedContent}</div>

  <div class="signature-line">
    Property Manager Signature / Date
  </div>

  <div class="footer">
    <p>This document was generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} and serves as an official notice in accordance with applicable lease terms and local regulations.</p>
    ${notice.servedAt ? `<p>Served on: ${new Date(notice.servedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>` : ""}
    ${notice.proofOfService ? `<p>Proof of Service: ${notice.proofOfService}</p>` : ""}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Failed to generate printable notice:", error);
    return NextResponse.json(
      { error: "Failed to generate printable notice" },
      { status: 500 }
    );
  }
}
