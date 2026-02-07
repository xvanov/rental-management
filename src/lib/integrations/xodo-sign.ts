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

interface SignatureField {
  type: "signature" | "text" | "initials";
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  required: boolean;
  role: string;
  label?: string;
  prefilled_text?: string;
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
 * Upload a PDF buffer directly to Xodo Sign.
 */
export async function uploadPdfBuffer(
  fileName: string,
  pdfBuffer: Buffer
): Promise<XodoSignDocument> {
  const token = getApiToken();

  const formData = new FormData();
  // Convert Buffer to base64 and back for Blob compatibility
  const base64 = pdfBuffer.toString("base64");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
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
 * Add signature fields to a document.
 * SignNow uses a PUT request to update document fields.
 */
export async function addFieldsToDocument(
  documentId: string,
  fields: SignatureField[]
): Promise<void> {
  const token = getApiToken();

  // Convert our field format to SignNow's format
  const signNowFields = fields.map((field, index) => {
    const baseField = {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      page_number: field.page,
      required: field.required,
      role: field.role,
      name: field.label || `field_${index}`,
    };

    if (field.type === "signature") {
      return { ...baseField, type: "signature" };
    } else if (field.type === "initials") {
      return { ...baseField, type: "initials" };
    } else {
      return {
        ...baseField,
        type: "text",
        prefilled_text: field.prefilled_text || "",
      };
    }
  });

  console.log(`[Xodo Sign] Adding ${signNowFields.length} fields to document ${documentId}`);
  console.log(`[Xodo Sign] Fields: ${JSON.stringify(signNowFields, null, 2)}`);

  const response = await fetch(`${XODO_BASE_URL}/document/${documentId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: signNowFields }),
  });

  const responseText = await response.text();
  console.log(`[Xodo Sign] Add fields response (${response.status}): ${responseText}`);

  if (!response.ok) {
    throw new Error(`Xodo Sign add fields failed: ${response.status} - ${responseText}`);
  }
}

/**
 * Create a freeform invite (signature request) for a document.
 */
export async function createSignatureRequest(
  documentId: string,
  signerEmail: string,
  signerName: string,
  _message?: string // Unused on free tier - custom messages require paid subscription
): Promise<XodoSignInvite> {
  const token = getApiToken();

  // Note: Free tier of Xodo Sign/SignNow does not support custom subject/message
  // To avoid "Upgrade your subscription" errors, we only send required fields
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

  const responseText = await response.text();
  console.log(`[Xodo Sign] Invite response (${response.status}): ${responseText}`);

  if (!response.ok) {
    throw new Error(
      `Xodo Sign invite failed: ${response.status} - ${responseText}`
    );
  }

  // Parse response - may be empty or have different structure
  if (responseText) {
    return JSON.parse(responseText);
  }
  return { id: "invite-sent", status: "pending" };
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
 * Create a signing link for a document.
 * This allows sharing a direct URL without relying on email.
 */
export async function createSigningLink(
  documentId: string
): Promise<{ url: string; url_no_signup: string }> {
  const token = getApiToken();

  const response = await fetch(`${XODO_BASE_URL}/link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_id: documentId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Xodo Sign create signing link failed: ${response.status} - ${error}`
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

  const response = await fetch(`${XODO_BASE_URL}/api/v2/events`, {
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

  // Handle empty response body (some tiers return 201 with empty body)
  const responseText = await response.text();
  if (responseText) {
    return JSON.parse(responseText);
  }
  return { id: "webhook-registered" };
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

/**
 * Send a PDF lease document for signature via Xodo Sign with proper signature fields.
 * This is the preferred method that uploads a real PDF and adds e-signature fields.
 */
export async function sendPdfForSignature(params: {
  pdfBuffer: Buffer;
  fileName: string;
  signerEmail: string;
  signerName: string;
  webhookUrl: string;
  message?: string;
  // Field positions (in points, from bottom-left of page)
  // These should be calculated based on where the signature section is in the PDF
  signatureFields?: {
    tenantNameField: { x: number; y: number; page: number };
    tenantSignatureField: { x: number; y: number; page: number };
    tenantDateField: { x: number; y: number; page: number };
  };
}): Promise<{
  documentId: string;
  inviteId: string;
  signingUrl?: string;
}> {
  // Upload the PDF
  const document = await uploadPdfBuffer(params.fileName, params.pdfBuffer);

  // Add signature fields if positions are provided
  if (params.signatureFields) {
    const fields: SignatureField[] = [
      {
        type: "text",
        x: params.signatureFields.tenantNameField.x,
        y: params.signatureFields.tenantNameField.y,
        width: 200,
        height: 20,
        page: params.signatureFields.tenantNameField.page,
        required: true,
        role: "Signer",
        label: "Tenant Full Name",
      },
      {
        type: "signature",
        x: params.signatureFields.tenantSignatureField.x,
        y: params.signatureFields.tenantSignatureField.y,
        width: 200,
        height: 50,
        page: params.signatureFields.tenantSignatureField.page,
        required: true,
        role: "Signer",
        label: "Tenant Signature",
      },
      {
        type: "text",
        x: params.signatureFields.tenantDateField.x,
        y: params.signatureFields.tenantDateField.y,
        width: 120,
        height: 20,
        page: params.signatureFields.tenantDateField.page,
        required: true,
        role: "Signer",
        label: "Date Signed",
      },
    ];

    await addFieldsToDocument(document.id, fields);
  }

  // Create signature request (sends email invite)
  const invite = await createSignatureRequest(
    document.id,
    params.signerEmail,
    params.signerName,
    params.message
  );

  // Create a direct signing link (no signup required)
  let signingUrl: string | undefined;
  try {
    const signingLink = await createSigningLink(document.id);
    signingUrl = signingLink.url_no_signup;
    console.log(`[Xodo Sign] Signing link created: ${signingUrl}`);
  } catch (linkError) {
    console.warn(`[Xodo Sign] Could not create signing link: ${linkError}`);
  }

  // Register webhook for completion
  await registerWebhook(document.id, params.webhookUrl, "document.complete");

  return {
    documentId: document.id,
    inviteId: invite.id,
    signingUrl,
  };
}
