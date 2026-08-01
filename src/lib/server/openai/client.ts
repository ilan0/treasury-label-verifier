import "server-only";

import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
export const LABEL_PROMPT_VERSION = "label-extraction.2026-07-31.4";
export const APPLICATION_PROMPT_VERSION = "application-extraction.2026-07-31.1";
export const EXTRACTION_STRATEGY_VERSION =
  process.env.OPENAI_EXTRACTION_STRATEGY?.trim() || "compact-fast.2026-07-31.3";

const supportedServiceTiers = new Set([
  "auto",
  "default",
  "flex",
  "priority",
] as const);

export type OpenAIServiceTier = "auto" | "default" | "flex" | "priority";

export function configuredServiceTier(): OpenAIServiceTier {
  const value = process.env.OPENAI_SERVICE_TIER?.trim() || "default";
  return supportedServiceTiers.has(value as OpenAIServiceTier)
    ? (value as OpenAIServiceTier)
    : "default";
}

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_NOT_CONFIGURED");
  }

  client ??= new OpenAI({
    apiKey,
    maxRetries: 1,
    timeout: 20_000,
  });
  return client;
}
