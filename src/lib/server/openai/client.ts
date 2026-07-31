import "server-only";

import OpenAI from "openai";

export const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna";
export const LABEL_PROMPT_VERSION = "label-extraction.2026-07-31.1";
export const APPLICATION_PROMPT_VERSION = "application-extraction.2026-07-31.1";

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
