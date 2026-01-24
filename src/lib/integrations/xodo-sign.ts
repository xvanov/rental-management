/**
 * Xodo Sign (formerly SignNow) integration for e-signature functionality.
 * Uses the Xodo Sign REST API (free tier).
 *
 * Environment variables required:
 * - XODO_SIGN_API_TOKEN: Bearer token for API access
 * - XODO_SIGN_BASE_URL: API base URL (default: https://api.signnow.com)
 * - NEXT_PUBLIC_APP_URL: App URL for webhook callbacks
 */

const XODO_BASE_URL =
  process.env.XODO_SIGN_BASE_URL || "https://api.signnow.com";

function getApiToken(): string {
  const token = process.env.XODO_SIGN_API_TOKEN;
  if (!token) {
    throw new Error("XODO_SIGN_API_TOKEN is not configured");
  }
  return token;
}

export function isXodoSignConfigured(): boolean {
  return !!process.env.XODO_SIGN_API_TOKEN;
}

interface XodoSignDocument {
  id: string;
  document_name: string;
  page_count: number;
  created: string;
  updated: string;
}

interface XodoSignInvite {
  id: string;
  status: string;
  email: string;
}

/**
 * Upload a document to Xodo Sign for signature.
 */
export async function uploadDocument(
  fileName: string,
  fileContent: string // base64-encoded content
): Promise<XodoSignDocument> {
  const token = getApiToken();

  const formData = new FormData();
  const buffer = Buffer.from(fileContent, "base64");
  const blob = new Blob([buffer], { type: "application/pdf" });
  formData.append("file", blob, fileName);

  const response = await fetch(`${XODO_BASE_URL}/document`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Xodo Sign upload failed: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Create a freeform invite (signature request) for a document.
 */
export async function createSignatureRequest(
  documentId: string,
  signerEmail: string,
  signerName: string,
  message?: string
): Promise<XodoSignInvite> {
  const token = getApiToken();

  const body = {
    to: [
      {
        email: signerEmail,
        role: "Signer",
        role_id: "",
        order: 1,
        reassign: "0",
        decline_by_signature: "0",
        reminder: 4,
        expiration_days: 30,
        subject: `Lease Agreement - Signature Required`,
        message:
          message ||
          `Please review and sign the attached lease agreement. Contact us if you have any questions.`,
      },
    ],
    from: signerEmail, // Will be overridden by account email
  };

  const response = await fetch(
    `${XODO_BASE_URL}/document/${documentId}/invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Xodo Sign invite failed: ${response.status} - ${error}`
    );
  }

  return response.json();
}

/**
 * Get document status from Xodo Sign.
 */
export async function getDocumentStatus(
  documentId: string
): Promise<XodoSignDocument & { field_invites: XodoSignInvite[] }> {
  const token = getApiToken();

  const response = await fetch(`${XODO_BASE_URL}/document/${documentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Xodo Sign status check failed: ${response.status} - ${error}`
    );
  }

  return response.json();
}

/**
 * Download a signed document from Xodo Sign.
 */
export async function downloadSignedDocument(
  documentId: string
): Promise<Buffer> {
  const token = getApiToken();

  const response = await fetch(
    `${XODO_BASE_URL}/document/${documentId}/download?type=collapsed`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Xodo Sign download failed: ${response.status} - ${error}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Register a webhook callback for document events.
 */
export async function registerWebhook(
  documentId: string,
  callbackUrl: string,
  event: "document.update" | "document.complete" | "document.decline" = "document.complete"
): Promise<{ id: string }> {
  const token = getApiToken();

  const response = await fetch(`${XODO_BASE_URL}/v2/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event,
      entity_id: documentId,
      action: "callback",
      attributes: {
        callback: callbackUrl,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Xodo Sign webhook registration failed: ${response.status} - ${error}`
    );
  }

  return response.json();
}

/**
 * Send a lease document for signature via Xodo Sign.
 * Combines upload, invite, and webhook registration.
 */
export async function sendForSignature(params: {
  leaseContent: string;
  fileName: string;
  signerEmail: string;
  signerName: string;
  webhookUrl: string;
  message?: string;
}): Promise<{
  documentId: string;
  inviteId: string;
}> {
  // For now, we upload the lease content as a text file
  // In production, this would be a PDF generated from the lease content
  const base64Content = Buffer.from(params.leaseContent).toString("base64");

  const document = await uploadDocument(params.fileName, base64Content);

  const invite = await createSignatureRequest(
    document.id,
    params.signerEmail,
    params.signerName,
    params.message
  );

  // Register webhook for completion
  await registerWebhook(document.id, params.webhookUrl, "document.complete");

  return {
    documentId: document.id,
    inviteId: invite.id,
  };
}
