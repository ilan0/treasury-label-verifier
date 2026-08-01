import { describe, expect, it } from "vitest";

import { processingAttemptStatusEnum } from "@/db/schema";
import {
  normalizeProcessingTimingSpans,
  normalizeProcessingTokenUsage,
  timingSpansTotalMs,
} from "@/lib/server/dal/processing-attempt-values";

describe("processing attempt telemetry", () => {
  it("keeps bounded, millisecond timing spans", () => {
    expect(
      normalizeProcessingTimingSpans({
        extractionMs: 1240.12345,
        queueMs: 8,
        totalMs: 1300.8,
      }),
    ).toEqual({ extractionMs: 1240.123, queueMs: 8, totalMs: 1300.8 });
    expect(timingSpansTotalMs({ totalMs: 1300.8 }, 999)).toBe(1301);
  });

  it("rejects invalid or misspelled timing spans", () => {
    expect(() => normalizeProcessingTimingSpans({ extractionMs: -1 })).toThrow(
      RangeError,
    );
    expect(() =>
      normalizeProcessingTimingSpans({ extractonMs: 10 } as never),
    ).toThrow(TypeError);
    expect(() =>
      normalizeProcessingTimingSpans({ totalMs: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it("normalizes token usage and infers provider total tokens", () => {
    expect(
      normalizeProcessingTokenUsage({
        cachedInputTokens: 400,
        inputTokens: 1_000,
        outputTokens: 200,
        reasoningTokens: 40,
      }),
    ).toEqual({
      cachedInputTokens: 400,
      inputTokens: 1_000,
      outputTokens: 200,
      reasoningTokens: 40,
      totalTokens: 1_200,
    });
  });

  it("rejects contradictory token counters", () => {
    expect(() =>
      normalizeProcessingTokenUsage({
        cachedInputTokens: 101,
        inputTokens: 100,
      }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeProcessingTokenUsage({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 119,
      }),
    ).toThrow(RangeError);
    expect(() => normalizeProcessingTokenUsage({ outputTokens: 10.5 })).toThrow(
      RangeError,
    );
  });

  it("keeps database attempt states explicit and terminal", () => {
    expect(processingAttemptStatusEnum.enumValues).toEqual([
      "running",
      "completed",
      "failed",
    ]);
  });
});
