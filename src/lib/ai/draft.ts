import { streamText } from "ai";
import { getLanguageModel } from "./provider";

export interface ConversationMessage {
  role: "tenant" | "operator";
  content: string;
  channel: string;
  timestamp: string;
}

export interface DraftContext {
  tenantName: string;
  unitName?: string;
  propertyAddress?: string;
  leaseStatus?: string;
  rentAmount?: number;
  balance?: number;
  conversationHistory: ConversationMessage[];
}

const SYSTEM_PROMPT = `You are an AI assistant helping a property manager draft replies to tenant messages.

Guidelines:
- Be professional, concise, and friendly
- Use a warm but business-appropriate tone
- Address the tenant's specific question or concern
- Do not make promises about timelines unless you are certain
- Do not include legal advice
- Keep responses brief (2-4 sentences for SMS, slightly longer for email)
- If the message is about a payment, acknowledge receipt if confirmed
- If the message is a maintenance request, acknowledge and indicate follow-up
- If the message is a complaint, acknowledge their concern empathetically
- Never disclose other tenants' information
- Sign off as the property manager (not as an AI)

Context about this tenant and property will be provided. Use it to personalize responses.`;

/**
 * Generates a draft reply as a streaming response.
 * Returns null if AI is not configured.
 */
export function generateDraftReply(context: DraftContext) {
  const model = getLanguageModel();
  if (!model) return null;

  const contextInfo = [
    `Tenant: ${context.tenantName}`,
    context.unitName ? `Unit: ${context.unitName}` : null,
    context.propertyAddress ? `Property: ${context.propertyAddress}` : null,
    context.leaseStatus ? `Lease Status: ${context.leaseStatus}` : null,
    context.rentAmount ? `Monthly Rent: $${context.rentAmount}` : null,
    context.balance !== undefined ? `Current Balance: $${context.balance}` : null,
  ].filter(Boolean).join("\n");

  const messages = context.conversationHistory.map((msg) => ({
    role: msg.role === "tenant" ? "user" as const : "assistant" as const,
    content: `[${msg.channel} - ${msg.timestamp}] ${msg.content}`,
  }));

  return streamText({
    model,
    system: `${SYSTEM_PROMPT}\n\nTenant/Property Context:\n${contextInfo}`,
    messages: [
      ...messages,
      {
        role: "user" as const,
        content: "Draft a reply to the tenant's latest message above. Only output the message text, nothing else.",
      },
    ],
  });
}
