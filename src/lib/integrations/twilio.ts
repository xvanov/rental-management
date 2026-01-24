import twilio from "twilio";
import { prisma } from "@/lib/db";
import { logMessageEvent } from "@/lib/events";

// ─── Twilio Client ───────────────────────────────────────────────────────────

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

function getTwilioClient() {
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }
  return twilio(accountSid, authToken);
}

// ─── Send SMS ────────────────────────────────────────────────────────────────

export interface SendSmsOptions {
  to: string;
  body: string;
  tenantId?: string;
  propertyId?: string;
}

/**
 * Send an SMS message via Twilio and log it as an immutable event.
 * Creates a Message record in the database and logs a MESSAGE event.
 */
export async function sendSms({ to, body, tenantId, propertyId }: SendSmsOptions) {
  if (!fromNumber) {
    throw new Error("TWILIO_PHONE_NUMBER is required");
  }

  const client = getTwilioClient();

  // Send via Twilio
  const twilioMessage = await client.messages.create({
    to,
    from: fromNumber,
    body,
  });

  // Create message record in database
  const message = await prisma.message.create({
    data: {
      tenantId: tenantId ?? null,
      channel: "SMS",
      direction: "OUTBOUND",
      content: body,
      metadata: {
        twilioSid: twilioMessage.sid,
        twilioStatus: twilioMessage.status,
        to,
        from: fromNumber,
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "SMS",
      direction: "OUTBOUND",
      content: body,
      to,
    },
    { tenantId, propertyId }
  );

  return { message, twilioSid: twilioMessage.sid };
}

// ─── Send Group SMS ──────────────────────────────────────────────────────────

export interface SendGroupSmsOptions {
  propertyId: string;
  body: string;
}

/**
 * Send an SMS message to all active tenants in a property who have phone numbers.
 * Logs each individual message as a separate event.
 */
export async function sendGroupSms({ propertyId, body }: SendGroupSmsOptions) {
  // Get all active tenants in this property with phone numbers
  const tenants = await prisma.tenant.findMany({
    where: {
      unit: { propertyId },
      active: true,
      phone: { not: null },
    },
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
    },
  });

  if (tenants.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  const results: Array<{
    tenantId: string;
    tenantName: string;
    success: boolean;
    error?: string;
    twilioSid?: string;
  }> = [];

  for (const tenant of tenants) {
    try {
      const result = await sendSms({
        to: tenant.phone!,
        body,
        tenantId: tenant.id,
        propertyId,
      });
      results.push({
        tenantId: tenant.id,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        success: true,
        twilioSid: result.twilioSid,
      });
    } catch (error) {
      results.push({
        tenantId: tenant.id,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ─── Process Incoming SMS ────────────────────────────────────────────────────

export interface IncomingSmsData {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  numMedia?: string;
  mediaUrls?: string[];
}

/**
 * Process an incoming SMS from Twilio webhook.
 * Links the message to a tenant by phone number, creates Message and Event records.
 */
export async function processIncomingSms(data: IncomingSmsData) {
  // Normalize phone number (remove formatting, keep +1 prefix)
  const normalizedPhone = normalizePhone(data.from);

  // Look up tenant by phone number
  const tenant = await prisma.tenant.findFirst({
    where: {
      phone: normalizedPhone,
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
      channel: "SMS",
      direction: "INBOUND",
      content: data.body,
      read: false,
      metadata: {
        twilioSid: data.messageSid,
        from: data.from,
        to: data.to,
        numMedia: data.numMedia ? parseInt(data.numMedia) : 0,
        mediaUrls: data.mediaUrls ?? [],
      },
    },
  });

  // Log as immutable event
  await logMessageEvent(
    {
      messageId: message.id,
      channel: "SMS",
      direction: "INBOUND",
      content: data.body,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US numbers).
 */
export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If it starts with 1 and is 11 digits, it's a US number with country code
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // If it's 10 digits, assume US and add +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // If it already has + prefix and proper format, keep as-is
  if (phone.startsWith("+") && digits.length >= 10) {
    return `+${digits}`;
  }

  // Return as-is if we can't normalize
  return phone;
}

/**
 * Validate a Twilio webhook request signature.
 * Should be used to verify incoming webhooks are from Twilio.
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is required for signature validation");
  }
  return twilio.validateRequest(authToken, signature, url, params);
}
