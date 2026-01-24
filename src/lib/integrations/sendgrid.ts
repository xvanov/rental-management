import sgMail from "@sendgrid/mail";
import { prisma } from "@/lib/db";
import { logMessageEvent } from "@/lib/events";

// ─── SendGrid Client ────────────────────────────────────────────────────────

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? "noreply@example.com";
const fromName = process.env.SENDGRID_FROM_NAME ?? "Rental Ops";

function getSendGridClient() {
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is required");
  }
  sgMail.setApiKey(apiKey);
  return sgMail;
}

// ─── Email Templates ────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  text: string;
  html?: string;
}

/**
 * Wrap plain text content in a simple HTML email template.
 */
export function wrapInHtmlTemplate(content: string, subject: string): string {
  const escapedContent = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; margin: 0; color: #111; }
    .content { padding: 16px 0; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${fromName}</h1>
  </div>
  <div class="content">
    ${escapedContent}
  </div>
  <div class="footer">
    This message was sent by ${fromName}. Please do not reply directly to this email.
  </div>
</body>
</html>`;
}

// ─── Send Email ─────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tenantId?: string;
  propertyId?: string;
}

/**
 * Send an email via SendGrid and log it as an immutable event.
 * Creates a Message record in the database and logs a MESSAGE event.
 * If no html is provided, wraps the text in a simple HTML template.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  tenantId,
  propertyId,
}: SendEmailOptions) {
  const client = getSendGridClient();

  const htmlContent = html ?? wrapInHtmlTemplate(text, subject);

  const [response] = await client.send({
    to,
    from: { email: fromEmail, name: fromName },
    subject,
    text,
    html: htmlContent,
  });

  // Create message record in database
  const message = await prisma.message.create({
    data: {
      tenantId: tenantId ?? null,
      channel: "EMAIL",
      direction: "OUTBOUND",
      content: text,
      metadata: {
        sendgridStatusCode: response.statusCode,
        subject,
        to,
        from: fromEmail,
        hasHtml: !!html,
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      content: text,
      to,
    },
    { tenantId, propertyId }
  );

  return { message, statusCode: response.statusCode };
}

// ─── Process Incoming Email ─────────────────────────────────────────────────

export interface IncomingEmailData {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  envelope?: string;
  headers?: string;
  attachments?: string;
  numAttachments?: number;
}

/**
 * Process an incoming email from SendGrid Inbound Parse webhook.
 * Links the email to a tenant by email address, creates Message and Event records.
 */
export async function processIncomingEmail(data: IncomingEmailData) {
  // Extract email address from "Name <email>" format
  const senderEmail = extractEmailAddress(data.from);

  // Look up tenant by email address
  const tenant = await prisma.tenant.findFirst({
    where: {
      email: senderEmail,
      active: true,
    },
    include: {
      unit: {
        select: { propertyId: true },
      },
    },
  });

  // Create message record
  const message = await prisma.message.create({
    data: {
      tenantId: tenant?.id ?? null,
      channel: "EMAIL",
      direction: "INBOUND",
      content: data.text || data.subject,
      read: false,
      metadata: {
        from: data.from,
        to: data.to,
        subject: data.subject,
        hasHtml: !!data.html,
        numAttachments: data.numAttachments ?? 0,
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "EMAIL",
      direction: "INBOUND",
      content: data.text || data.subject,
      from: data.from,
    },
    {
      tenantId: tenant?.id,
      propertyId: tenant?.unit?.propertyId,
    }
  );

  return {
    message,
    tenant: tenant
      ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` }
      : null,
    matched: !!tenant,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract email address from a string that might be "Name <email@domain.com>" format.
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) {
    return match[1].toLowerCase();
  }
  // If no angle brackets, assume it's just the email
  return from.trim().toLowerCase();
}
