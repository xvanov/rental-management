import puppeteer from "puppeteer";

export interface CourtPacketData {
  tenant: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    unit: {
      name: string;
      property: {
        address: string;
        city: string;
        state: string;
        zip: string;
      };
    } | null;
  };
  lease: {
    content: string;
    status: string;
    startDate: string;
    endDate: string | null;
    rentAmount: number | null;
    version: number;
    signedAt: string | null;
  } | null;
  ledger: {
    date: string;
    period: string | null;
    type: string;
    description: string | null;
    amount: number;
    balance: number;
  }[];
  notices: {
    type: string;
    status: string;
    content: string;
    sentAt: string | null;
    servedAt: string | null;
    proofOfService: string | null;
    createdAt: string;
  }[];
  messages: {
    channel: string;
    direction: string;
    content: string;
    createdAt: string;
  }[];
  events: {
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }[];
  dateRange?: {
    start: string | null;
    end: string | null;
  };
  generatedAt: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const noticeTypeLabels: Record<string, string> = {
  LATE_RENT: "Notice of Late Rent",
  LEASE_VIOLATION: "Lease Violation Notice",
  EVICTION_WARNING: "Eviction Warning",
  DEPOSIT_DISPOSITION: "Deposit Disposition",
  MOVE_OUT: "Notice to Vacate",
};

const ledgerTypeLabels: Record<string, string> = {
  RENT: "Rent",
  LATE_FEE: "Late Fee",
  UTILITY: "Utility",
  DEPOSIT: "Deposit",
  CREDIT: "Credit",
  PAYMENT: "Payment",
  DEDUCTION: "Deduction",
};

function buildTableOfContents(data: CourtPacketData): string {
  const sections: { title: string; page: string }[] = [
    { title: "Cover Page", page: "1" },
  ];

  let pageNum = 2;

  if (data.lease) {
    sections.push({ title: "Signed Lease Agreement", page: String(pageNum) });
    pageNum++;
  }

  if (data.ledger.length > 0) {
    sections.push({ title: "Payment Ledger", page: String(pageNum) });
    pageNum++;
  }

  if (data.notices.length > 0) {
    sections.push({ title: "Notices & Violations", page: String(pageNum) });
    pageNum += data.notices.length;
  }

  if (data.messages.length > 0) {
    sections.push({ title: "Communication Log", page: String(pageNum) });
    pageNum++;
  }

  if (data.events.length > 0) {
    sections.push({ title: "Event Timeline (Appendix)", page: String(pageNum) });
  }

  return `
    <div class="section">
      <h2>Table of Contents</h2>
      <div class="toc">
        ${sections
          .map(
            (s) =>
              `<div class="toc-entry">
                <span class="toc-title">${s.title}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">${s.page}</span>
              </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildCoverPage(data: CourtPacketData): string {
  const tenantName = `${data.tenant.firstName} ${data.tenant.lastName}`;
  const property = data.tenant.unit?.property;
  const propertyAddress = property
    ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`
    : "N/A";

  const dateRangeText = data.dateRange?.start || data.dateRange?.end
    ? `${data.dateRange.start ? formatDate(data.dateRange.start) : "Beginning"} to ${data.dateRange.end ? formatDate(data.dateRange.end) : "Present"}`
    : "All records";

  return `
    <div class="cover-page">
      <h1>COURT EVIDENCE PACKET</h1>
      <div class="cover-details">
        <div class="cover-row">
          <span class="cover-label">Tenant:</span>
          <span>${escapeHtml(tenantName)}</span>
        </div>
        <div class="cover-row">
          <span class="cover-label">Property:</span>
          <span>${escapeHtml(propertyAddress)}</span>
        </div>
        ${data.tenant.unit ? `
        <div class="cover-row">
          <span class="cover-label">Unit:</span>
          <span>${escapeHtml(data.tenant.unit.name)}</span>
        </div>` : ""}
        <div class="cover-row">
          <span class="cover-label">Date Range:</span>
          <span>${dateRangeText}</span>
        </div>
        <div class="cover-row">
          <span class="cover-label">Generated:</span>
          <span>${formatDate(data.generatedAt)}</span>
        </div>
        <div class="cover-row">
          <span class="cover-label">Documents:</span>
          <span>${[
            data.lease ? "Lease Agreement" : null,
            data.ledger.length > 0 ? `Ledger (${data.ledger.length} entries)` : null,
            data.notices.length > 0 ? `Notices (${data.notices.length})` : null,
            data.messages.length > 0 ? `Messages (${data.messages.length})` : null,
            data.events.length > 0 ? `Events (${data.events.length})` : null,
          ].filter(Boolean).join(", ")}</span>
        </div>
      </div>
      ${buildTableOfContents(data)}
      <div class="certification">
        <p>I hereby certify that this packet contains true and accurate records maintained in the
        ordinary course of business for the above-referenced tenancy.</p>
        <div class="signature-block">
          <div class="signature-line">Property Manager Signature</div>
          <div class="signature-line">Date</div>
        </div>
      </div>
    </div>
  `;
}

function buildLeaseSection(data: CourtPacketData): string {
  if (!data.lease) return "";

  const escapedContent = escapeHtml(data.lease.content).replace(/\n/g, "<br>");

  return `
    <div class="section page-break">
      <h2>Lease Agreement</h2>
      <div class="meta-block">
        <div class="meta-row"><span class="meta-label">Status:</span><span>${data.lease.status}</span></div>
        <div class="meta-row"><span class="meta-label">Version:</span><span>v${data.lease.version}</span></div>
        <div class="meta-row"><span class="meta-label">Rent Amount:</span><span>${data.lease.rentAmount ? `$${data.lease.rentAmount.toLocaleString()}/month` : "N/A"}</span></div>
        <div class="meta-row"><span class="meta-label">Start Date:</span><span>${formatDate(data.lease.startDate)}</span></div>
        <div class="meta-row"><span class="meta-label">End Date:</span><span>${data.lease.endDate ? formatDate(data.lease.endDate) : "Open-ended"}</span></div>
        ${data.lease.signedAt ? `<div class="meta-row"><span class="meta-label">Signed:</span><span>${formatDate(data.lease.signedAt)}</span></div>` : ""}
      </div>
      <div class="lease-content">${escapedContent}</div>
    </div>
  `;
}

function buildLedgerSection(data: CourtPacketData): string {
  if (data.ledger.length === 0) return "";

  const totalCharges = data.ledger
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalPayments = data.ledger
    .filter((e) => e.amount < 0)
    .reduce((sum, e) => sum + Math.abs(e.amount), 0);
  const currentBalance = data.ledger.length > 0 ? data.ledger[data.ledger.length - 1].balance : 0;

  return `
    <div class="section page-break">
      <h2>Payment Ledger</h2>
      <div class="summary-box">
        <div class="summary-item"><span>Total Charges:</span><span>$${totalCharges.toFixed(2)}</span></div>
        <div class="summary-item"><span>Total Payments:</span><span>$${totalPayments.toFixed(2)}</span></div>
        <div class="summary-item outstanding"><span>Outstanding Balance:</span><span>$${currentBalance.toFixed(2)}</span></div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Period</th>
            <th>Type</th>
            <th>Description</th>
            <th class="amount-col">Amount</th>
            <th class="amount-col">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${data.ledger
            .map(
              (entry) => `
            <tr>
              <td>${formatDate(entry.date)}</td>
              <td>${entry.period || "-"}</td>
              <td>${ledgerTypeLabels[entry.type] || entry.type}</td>
              <td>${escapeHtml(entry.description || "-")}</td>
              <td class="amount-col ${entry.amount > 0 ? "charge" : "payment"}">${entry.amount > 0 ? "" : "-"}$${Math.abs(entry.amount).toFixed(2)}</td>
              <td class="amount-col">${entry.balance >= 0 ? "" : "-"}$${Math.abs(entry.balance).toFixed(2)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildNoticesSection(data: CourtPacketData): string {
  if (data.notices.length === 0) return "";

  return `
    <div class="section page-break">
      <h2>Notices &amp; Violations</h2>
      <p class="section-note">${data.notices.length} notice(s) on record.</p>
      ${data.notices
        .map(
          (notice, i) => `
        <div class="notice-block ${i > 0 ? "page-break" : ""}">
          <h3>Notice ${i + 1}: ${noticeTypeLabels[notice.type] || notice.type}</h3>
          <div class="meta-block">
            <div class="meta-row"><span class="meta-label">Status:</span><span>${notice.status}</span></div>
            <div class="meta-row"><span class="meta-label">Created:</span><span>${formatDate(notice.createdAt)}</span></div>
            ${notice.sentAt ? `<div class="meta-row"><span class="meta-label">Sent:</span><span>${formatDate(notice.sentAt)}</span></div>` : ""}
            ${notice.servedAt ? `<div class="meta-row"><span class="meta-label">Served:</span><span>${formatDate(notice.servedAt)}</span></div>` : ""}
            ${notice.proofOfService ? `<div class="meta-row"><span class="meta-label">Proof of Service:</span><span>${escapeHtml(notice.proofOfService)}</span></div>` : ""}
          </div>
          <div class="notice-content">${escapeHtml(notice.content).replace(/\n/g, "<br>")}</div>
        </div>`
        )
        .join("")}
    </div>
  `;
}

function buildMessagesSection(data: CourtPacketData): string {
  if (data.messages.length === 0) return "";

  return `
    <div class="section page-break">
      <h2>Communication Log</h2>
      <p class="section-note">${data.messages.length} message(s) in record.${data.dateRange?.start || data.dateRange?.end ? " (filtered by date range)" : ""}</p>
      <table class="data-table messages-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Channel</th>
            <th>Direction</th>
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          ${data.messages
            .map(
              (msg) => `
            <tr>
              <td class="nowrap">${formatDateTime(msg.createdAt)}</td>
              <td>${msg.channel}</td>
              <td>${msg.direction === "INBOUND" ? "Received" : "Sent"}</td>
              <td class="msg-content">${escapeHtml(msg.content)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildEventsSection(data: CourtPacketData): string {
  if (data.events.length === 0) return "";

  return `
    <div class="section page-break">
      <h2>Event Timeline (Appendix)</h2>
      <p class="section-note">Complete system audit trail. ${data.events.length} event(s) recorded.</p>
      <table class="data-table events-table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Type</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${data.events
            .map(
              (evt) => `
            <tr>
              <td class="nowrap">${formatDateTime(evt.createdAt)}</td>
              <td>${evt.type}</td>
              <td class="evt-details">${escapeHtml(getEventSummary(evt))}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getEventSummary(event: { type: string; payload: Record<string, unknown> }): string {
  const p = event.payload;
  switch (event.type) {
    case "MESSAGE":
      return `${p.direction === "INBOUND" ? "Received" : "Sent"} ${p.channel} message`;
    case "PAYMENT":
      return `Payment: $${p.amount} via ${p.method}`;
    case "NOTICE":
      return `Notice: ${p.noticeType || p.type}`;
    case "VIOLATION":
      return `Violation: ${p.description || p.type}`;
    case "SYSTEM":
      return String(p.description || p.action || "System event");
    case "LEASE":
      return `Lease: ${p.action || "update"}`;
    case "INSPECTION":
      return `Inspection: ${p.inspectionType || "routine"}`;
    default:
      return `${event.type} event`;
  }
}

function buildFullHtml(data: CourtPacketData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Court Packet - ${data.tenant.firstName} ${data.tenant.lastName}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      margin: 0;
      padding: 0;
    }
    .cover-page {
      padding: 0.75in;
      min-height: 100%;
    }
    .cover-page h1 {
      text-align: center;
      font-size: 22pt;
      margin: 1in 0 0.5in 0;
      text-transform: uppercase;
      letter-spacing: 2px;
      border-bottom: 3px solid #000;
      padding-bottom: 0.5em;
    }
    .cover-details {
      margin: 1.5em 0;
      font-size: 12pt;
    }
    .cover-row {
      display: flex;
      margin-bottom: 0.5em;
    }
    .cover-label {
      font-weight: bold;
      width: 140px;
      flex-shrink: 0;
    }
    .toc {
      margin: 1em 0;
      border: 1px solid #ccc;
      padding: 1em;
    }
    .toc-entry {
      display: flex;
      align-items: baseline;
      margin-bottom: 0.4em;
      font-size: 11pt;
    }
    .toc-title { flex-shrink: 0; }
    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted #999;
      margin: 0 8px;
      min-width: 20px;
    }
    .toc-page { flex-shrink: 0; font-weight: bold; }
    .certification {
      margin-top: 2em;
      border-top: 1px solid #000;
      padding-top: 1em;
      font-size: 10pt;
    }
    .signature-block {
      display: flex;
      gap: 2em;
      margin-top: 2em;
    }
    .signature-line {
      border-top: 1px solid #000;
      padding-top: 0.25em;
      width: 200px;
      font-size: 9pt;
      color: #666;
    }
    .section {
      padding: 0.75in;
    }
    .section h2 {
      font-size: 16pt;
      border-bottom: 2px solid #000;
      padding-bottom: 0.25em;
      margin-bottom: 0.75em;
    }
    .section h3 {
      font-size: 13pt;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .section-note {
      font-size: 10pt;
      color: #666;
      font-style: italic;
      margin-bottom: 1em;
    }
    .page-break { page-break-before: always; }
    .meta-block {
      background: #f9f9f9;
      border: 1px solid #ddd;
      padding: 0.75em 1em;
      margin-bottom: 1em;
      font-size: 10pt;
    }
    .meta-row {
      display: flex;
      margin-bottom: 0.25em;
    }
    .meta-label {
      font-weight: bold;
      width: 130px;
      flex-shrink: 0;
    }
    .summary-box {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 0.75em 1em;
      margin-bottom: 1em;
      display: flex;
      gap: 2em;
    }
    .summary-item {
      display: flex;
      flex-direction: column;
      font-size: 10pt;
    }
    .summary-item span:last-child {
      font-size: 14pt;
      font-weight: bold;
    }
    .summary-item.outstanding span:last-child {
      color: #c00;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-top: 0.5em;
    }
    .data-table th, .data-table td {
      border: 1px solid #ccc;
      padding: 4px 6px;
      text-align: left;
      vertical-align: top;
    }
    .data-table th {
      background: #f0f0f0;
      font-weight: bold;
      font-size: 8pt;
      text-transform: uppercase;
    }
    .data-table tr:nth-child(even) { background: #fafafa; }
    .amount-col { text-align: right; white-space: nowrap; }
    .charge { color: #c00; }
    .payment { color: #060; }
    .nowrap { white-space: nowrap; }
    .msg-content { max-width: 350px; word-break: break-word; }
    .evt-details { max-width: 350px; word-break: break-word; }
    .lease-content {
      border: 1px solid #ddd;
      padding: 1em;
      font-size: 10pt;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .notice-block {
      margin-bottom: 1.5em;
    }
    .notice-content {
      border: 1px solid #ddd;
      padding: 0.75em;
      font-size: 10pt;
      white-space: pre-wrap;
      word-break: break-word;
    }
    @page {
      margin: 0.5in;
      @bottom-center {
        content: "Page " counter(page);
        font-size: 9pt;
        color: #666;
      }
    }
  </style>
</head>
<body>
  ${buildCoverPage(data)}
  ${buildLeaseSection(data)}
  ${buildLedgerSection(data)}
  ${buildNoticesSection(data)}
  ${buildMessagesSection(data)}
  ${buildEventsSection(data)}
</body>
</html>`;
}

export async function generateCourtPacketPdf(data: CourtPacketData): Promise<Buffer> {
  const html = buildFullHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width: 100%; text-align: center; font-size: 9px; color: #666; padding: 5px 0;">
        Court Evidence Packet - ${escapeHtml(data.tenant.firstName)} ${escapeHtml(data.tenant.lastName)} | Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
      margin: {
        top: "0.5in",
        bottom: "0.75in",
        left: "0.5in",
        right: "0.5in",
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
