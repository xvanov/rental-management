import { NextRequest, NextResponse } from "next/server";
import { processIncomingSms, validateTwilioSignature } from "@/lib/integrations/twilio";

/**
 * Twilio SMS webhook endpoint.
 * Receives incoming SMS messages from Twilio and processes them.
 *
 * Twilio sends POST requests with form-encoded body containing:
 * - From: sender phone number
 * - To: receiving phone number (our Twilio number)
 * - Body: message content
 * - MessageSid: unique message identifier
 * - NumMedia: number of media attachments
 * - MediaUrl0, MediaUrl1, etc: media attachment URLs
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form-encoded body from Twilio
    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const from = params.From;
    const to = params.To;
    const body = params.Body ?? "";
    const messageSid = params.MessageSid;
    const numMedia = params.NumMedia ?? "0";

    if (!from || !to || !messageSid) {
      return NextResponse.json(
        { error: "Missing required fields: From, To, MessageSid" },
        { status: 400 }
      );
    }

    // Validate Twilio signature in production
    if (process.env.NODE_ENV === "production" && process.env.TWILIO_AUTH_TOKEN) {
      const signature = request.headers.get("x-twilio-signature") ?? "";
      const url = request.url;

      const isValid = validateTwilioSignature(url, params, signature);
      if (!isValid) {
        console.error("Invalid Twilio signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 403 }
        );
      }
    }

    // Collect media URLs if any
    const mediaCount = parseInt(numMedia);
    const mediaUrls: string[] = [];
    for (let i = 0; i < mediaCount; i++) {
      const url = params[`MediaUrl${i}`];
      if (url) mediaUrls.push(url);
    }

    // Process the incoming message
    const result = await processIncomingSms({
      from,
      to,
      body,
      messageSid,
      numMedia,
      mediaUrls,
    });

    console.log(
      `[Twilio Webhook] SMS from ${from}: "${body.substring(0, 50)}..." → ` +
        (result.matched
          ? `matched tenant: ${result.tenant?.name}`
          : "no tenant match")
    );

    // Return TwiML response (empty response, no auto-reply)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("[Twilio Webhook] Error processing incoming SMS:", error);
    // Return 200 with empty TwiML to prevent Twilio retries
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}
