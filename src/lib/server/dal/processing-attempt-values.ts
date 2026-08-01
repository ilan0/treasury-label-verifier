import type { ProcessingTimingSpans } from "@/db/schema";

const SPAN_KEYS = [
  "queueMs",
  "validationMs",
  "preprocessingMs",
  "extractionMs",
  "verificationMs",
  "persistenceMs",
  "totalMs",
] as const satisfies readonly (keyof ProcessingTimingSpans)[];

const MAX_COUNTER_VALUE = 2_147_483_647;
const MAX_SPAN_MS = 24 * 60 * 60 * 1_000;

export type ProcessingTokenUsage = {
  cachedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export type NormalizedProcessingTokenUsage = {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export function normalizeProcessingTimingSpans(
  input: ProcessingTimingSpans = {},
): ProcessingTimingSpans {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Processing timing spans must be an object.");
  }

  const submittedKeys = Object.keys(input);
  if (
    submittedKeys.some(
      (key) => !SPAN_KEYS.includes(key as (typeof SPAN_KEYS)[number]),
    )
  ) {
    throw new TypeError("Processing timing spans contain an unknown key.");
  }

  const normalized: ProcessingTimingSpans = {};
  for (const key of SPAN_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > MAX_SPAN_MS) {
      throw new RangeError(`Invalid processing timing span: ${key}.`);
    }
    normalized[key] = Math.round(value * 1_000) / 1_000;
  }
  return normalized;
}

function counter(value: number | undefined, name: string): number {
  const normalized = value ?? 0;
  if (
    !Number.isSafeInteger(normalized) ||
    normalized < 0 ||
    normalized > MAX_COUNTER_VALUE
  ) {
    throw new RangeError(`Invalid processing token counter: ${name}.`);
  }
  return normalized;
}

export function normalizeProcessingTokenUsage(
  input: ProcessingTokenUsage = {},
): NormalizedProcessingTokenUsage {
  const inputTokens = counter(input.inputTokens, "inputTokens");
  const cachedInputTokens = counter(
    input.cachedInputTokens,
    "cachedInputTokens",
  );
  const outputTokens = counter(input.outputTokens, "outputTokens");
  const reasoningTokens = counter(input.reasoningTokens, "reasoningTokens");
  const minimumTotal = inputTokens + outputTokens;
  const totalTokens =
    input.totalTokens === undefined
      ? minimumTotal
      : counter(input.totalTokens, "totalTokens");

  if (cachedInputTokens > inputTokens) {
    throw new RangeError("Cached input tokens cannot exceed input tokens.");
  }
  if (reasoningTokens > outputTokens) {
    throw new RangeError("Reasoning tokens cannot exceed output tokens.");
  }
  if (totalTokens < minimumTotal || totalTokens > MAX_COUNTER_VALUE) {
    throw new RangeError(
      "Total tokens cannot be smaller than input plus output tokens.",
    );
  }

  return {
    cachedInputTokens,
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}

export function timingSpansTotalMs(
  spans: ProcessingTimingSpans,
  fallbackMs: number,
): number {
  const value = spans.totalMs ?? fallbackMs;
  if (!Number.isFinite(value) || value < 0 || value > MAX_SPAN_MS) {
    throw new RangeError("Invalid total processing latency.");
  }
  return Math.round(value);
}
