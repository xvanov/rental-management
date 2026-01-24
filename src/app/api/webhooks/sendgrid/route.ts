import { NextRequest, NextResponse } from "next/server";
import { processIncomingEmail } from "@/lib/integrations/sendgrid";

/**
 * SendGrid Inbound Parse webhook endpoint.
 * Receives incoming emails forwarded by SendGrid's Inbound Parse feature.
 *
 * SendGrid sends POST requests with multipart/form-data containing:
 * - from: sender email (may include name in "Name <email>" format)
 * - to: recipient email address
 * - subject: email subject line
 * - text: plain text body
 * - html: HTML body (if present)
 * - envelope: JSON string with to/from addresses
 * - headers: raw email headers
 * - attachments: number of attachments
 * - attachment-info: JSON with attachment metadata
 * - attachment1, attachment2, etc: attached files
 *
 * Setup: Configure Inbound Parse at https://app.sendgrid.com/settings/parse
 * Point your MX records to mx.sendgrid.net and set the webhook URL to this endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data from SendGrid
    const formData = await request.formData();

    const from = formData.get("from")?.toString() ?? "";
    const to = formData.get("to")?.toString() ?? "";
    const subject = formData.get("subject")?.toString() ?? "";
    const text = formData.get("text")?.toString() ?? "";
    const html = formData.get("html")?.toString();
    const envelope = formData.get("envelope")?.toString();
    const headers = formData.get("headers")?.toString();
    const numAttachments = parseInt(formData.get("attachments")?.toString() ?? "0");

    if (!from) {
      return NextResponse.json(
        { error: "Missing required field: from" },
        { status: 400 }
      );
    }

    // Process the incoming email
    const result = await processIncomingEmail({
      from,
      to,
      subject,
      text,
      html: html ?? undefined,
      envelope: envelope ?? undefined,
      headers: headers ?? undefined,
      numAttachments,
    });

    console.log(
      `[SendGrid Webhook] Email from ${from}: "${subject.substring(0, 50)}" → ` +
        (result.matched
          ? `matched tenant: ${result.tenant?.name}`
          : "no tenant match")
    );

    // Return 200 to acknowledge receipt
    return NextResponse.json(
      { success: true, matched: result.matched },
      { status: 200 }
    );
  } catch (error) {
    console.error("[SendGrid Webhook] Error processing incoming email:", error);
    // Return 200 to prevent SendGrid retries on processing errors
    return NextResponse.json(
      { success: false, error: "Processing error" },
      { status: 200 }
    );
  }
}
