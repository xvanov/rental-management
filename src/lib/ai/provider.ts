import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * AI provider configuration.
 * Uses OpenAI as primary, falls back to Anthropic if configured.
 * Provider selection is determined by environment variables.
 */

export function getOpenAIProvider() {
  if (!process.env.OPENAI_API_KEY) return null;
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export function getAnthropicProvider() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Returns the configured language model for text generation.
 * Prefers OpenAI gpt-4o-mini for cost efficiency, falls back to Anthropic claude-3-haiku.
 */
export function getLanguageModel() {
  const openai = getOpenAIProvider();
  if (openai) {
    return openai(process.env.AI_MODEL ?? "gpt-4o-mini");
  }

  const anthropic = getAnthropicProvider();
  if (anthropic) {
    return anthropic(process.env.AI_MODEL ?? "claude-3-haiku-20240307");
  }

  return null;
}

/**
 * Check if any AI provider is configured.
 */
export function isAIConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}
