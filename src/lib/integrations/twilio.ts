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
  /** Skip sender ID prefix and STOP suffix (e.g. for STOP/HELP auto-replies) */
  skipCompliance?: boolean;
}

/**
 * Wrap an outbound SMS body with sender identification and opt-out language.
 * Required by TCPA / CTIA / Twilio messaging policy.
 */
function wrapComplianceMessage(body: string): string {
  const prefix = "Rentus Homes: ";
  const suffix = "\n\nReply STOP to opt out. Reply HELP for help.";

  // Don't double-wrap if already prefixed
  const prefixed = body.startsWith("Rentus Homes") ? body : `${prefix}${body}`;
  // Don't double-append if already has STOP language
  const wrapped = prefixed.includes("Reply STOP") ? prefixed : `${prefixed}${suffix}`;
  return wrapped;
}

/**
 * Send an SMS message via Twilio and log it as an immutable event.
 * Creates a Message record in the database and logs a MESSAGE event.
 * Automatically adds sender ID and STOP/HELP language for compliance.
 */
export async function sendSms({ to, body, tenantId, propertyId, skipCompliance }: SendSmsOptions) {
  if (!fromNumber) {
    throw new Error("TWILIO_PHONE_NUMBER is required");
  }

  // Check SMS consent if sending to a known tenant
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { smsConsent: true },
    });
    if (tenant && !tenant.smsConsent) {
      throw new Error("Tenant has not opted in to SMS messages");
    }
  }

  const client = getTwilioClient();
  const complianceBody = skipCompliance ? body : wrapComplianceMessage(body);

  // Send via Twilio
  const twilioMessage = await client.messages.create({
    to,
    from: fromNumber,
    body: complianceBody,
  });

  // Create message record in database
  const message = await prisma.message.create({
    data: {
      tenantId: tenantId ?? null,
      channel: "SMS",
      direction: "OUTBOUND",
      content: complianceBody,
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
      content: complianceBody,
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
  // Get all active tenants in this property with phone numbers who have consented to SMS
  const tenants = await prisma.tenant.findMany({
    where: {
      unit: { propertyId },
      active: true,
      phone: { not: null },
      smsConsent: true,
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

/** STOP keywords per CTIA guidelines */
const STOP_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
/** HELP keywords */
const HELP_KEYWORDS = ["help", "info"];

/**
 * Process an incoming SMS from Twilio webhook.
 * Handles STOP/HELP keywords for compliance, then links the message to a tenant.
 */
export async function processIncomingSms(data: IncomingSmsData) {
  // Normalize phone number (remove formatting, keep +1 prefix)
  const normalizedPhone = normalizePhone(data.from);
  const bodyLower = data.body.trim().toLowerCase();

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

  // Handle STOP keyword — revoke SMS consent
  if (STOP_KEYWORDS.includes(bodyLower)) {
    if (tenant) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { smsConsent: false, smsConsentDate: null },
      });
    }
    // Send one final confirmation per TCPA rules
    if (fromNumber) {
      const client = getTwilioClient();
      await client.messages.create({
        to: data.from,
        from: fromNumber,
        body: "Rentus Homes: You have been unsubscribed and will no longer receive text messages. Reply START to re-subscribe.",
      });
    }
    // Still log the message
    const message = await prisma.message.create({
      data: {
        tenantId: tenant?.id ?? null,
        channel: "SMS",
        direction: "INBOUND",
        content: data.body,
        read: true,
        metadata: {
          twilioSid: data.messageSid,
          from: data.from,
          to: data.to,
          keyword: "STOP",
        },
      },
    });
    return { message, tenant: tenant ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` } : null, matched: !!tenant, keyword: "STOP" as const };
  }

  // Handle HELP keyword — send help message
  if (HELP_KEYWORDS.includes(bodyLower)) {
    if (fromNumber) {
      const client = getTwilioClient();
      await client.messages.create({
        to: data.from,
        from: fromNumber,
        body: "Rentus Homes: For help, contact your property manager or reach us at info@rentus.homes or (213) 293-2712. Reply STOP to opt out.",
      });
    }
    const message = await prisma.message.create({
      data: {
        tenantId: tenant?.id ?? null,
        channel: "SMS",
        direction: "INBOUND",
        content: data.body,
        read: true,
        metadata: {
          twilioSid: data.messageSid,
          from: data.from,
          to: data.to,
          keyword: "HELP",
        },
      },
    });
    return { message, tenant: tenant ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` } : null, matched: !!tenant, keyword: "HELP" as const };
  }

  // Handle START keyword — re-subscribe
  if (bodyLower === "start" || bodyLower === "yes" || bodyLower === "subscribe") {
    if (tenant) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { smsConsent: true, smsConsentDate: new Date() },
      });
    }
    if (fromNumber) {
      const client = getTwilioClient();
      await client.messages.create({
        to: data.from,
        from: fromNumber,
        body: "Rentus Homes: You have been re-subscribed to text messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Reply HELP for help.",
      });
    }
    const message = await prisma.message.create({
      data: {
        tenantId: tenant?.id ?? null,
        channel: "SMS",
        direction: "INBOUND",
        content: data.body,
        read: true,
        metadata: {
          twilioSid: data.messageSid,
          from: data.from,
          to: data.to,
          keyword: "START",
        },
      },
    });
    return { message, tenant: tenant ? { id: tenant.id, name: `${tenant.firstName} ${tenant.lastName}` } : null, matched: !!tenant, keyword: "START" as const };
  }

  // Regular message — create record and log event
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
