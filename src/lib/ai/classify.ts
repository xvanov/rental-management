import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "./provider";

export const MESSAGE_CATEGORIES = [
  "inquiry",
  "complaint",
  "payment_confirmation",
  "maintenance_request",
  "lease_question",
  "move_in_out",
  "general",
] as const;

export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

const classificationSchema = z.object({
  category: z.enum(MESSAGE_CATEGORIES),
  confidence: z.number().min(0).max(1),
  summary: z.string().describe("One-sentence summary of the message intent"),
});

export type MessageClassification = z.infer<typeof classificationSchema>;

/**
 * Classifies an incoming tenant message into a category.
 * Returns null if AI is not configured.
 */
export async function classifyMessage(
  content: string,
  context?: { tenantName?: string; unitName?: string; propertyAddress?: string }
): Promise<MessageClassification | null> {
  const model = getLanguageModel();
  if (!model) return null;

  const systemPrompt = `You are a property management message classifier. Classify the tenant's message into one of these categories:
- inquiry: General questions about the property, availability, or policies
- complaint: Issues, concerns, or negative feedback about conditions
- payment_confirmation: Messages confirming or discussing payments made
- maintenance_request: Requests for repairs or maintenance issues
- lease_question: Questions about lease terms, renewals, or lease-related matters
- move_in_out: Messages about moving in, moving out, or related logistics
- general: Messages that don't fit other categories

${context?.tenantName ? `Tenant: ${context.tenantName}` : ""}
${context?.unitName ? `Unit: ${context.unitName}` : ""}
${context?.propertyAddress ? `Property: ${context.propertyAddress}` : ""}`;

  const { object } = await generateObject({
    model,
    schema: classificationSchema,
    system: systemPrompt,
    prompt: content,
  });

  return object;
}
