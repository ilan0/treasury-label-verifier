import { describe, expect, it } from "vitest";

import type { RuleResult } from "@/lib/domain";

import {
  aggregateOutcome,
  confidenceBand,
  countRuleStatuses,
} from "./aggregate";

const citation = {
  authority: "eCFR" as const,
  citation: "27 CFR 16.21",
  title: "Test",
  url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16",
  accessedOn: "2026-07-31",
};

function finding(overrides: Partial<RuleResult> = {}): RuleResult {
  return {
    ruleId: "test",
    title: "Test",
    description: "Test rule",
    status: "pass",
    severity: "mandatory",
    expected: "expected",
    observed: "expected",
    confidence: 0.95,
    explanation: "Test",
    citation,
    ...overrides,
  };
}

describe("confidence routing", () => {
  it("auto-clears only fully evidenced high-confidence passes", () => {
    expect(aggregateOutcome([finding()], 0.9)).toBe("precheck_passed");
    expect(aggregateOutcome([finding()], 0.8999)).toBe("human_review_required");
  });

  it("sends a mandatory deterministic failure to correction", () => {
    expect(aggregateOutcome([finding({ status: "fail" })], 0.99)).toBe(
      "correction_needed",
    );
  });

  it("prioritizes correction over uncertainty", () => {
    expect(
      aggregateOutcome(
        [finding({ status: "not_assessed" }), finding({ status: "fail" })],
        0.5,
      ),
    ).toBe("correction_needed");
  });

  it.each(["review", "not_assessed"] as const)(
    "routes %s to review",
    (status) => {
      expect(aggregateOutcome([finding({ status })], 0.99)).toBe(
        "human_review_required",
      );
    },
  );

  it("ignores non-applicable confidence", () => {
    expect(
      aggregateOutcome(
        [finding(), finding({ status: "not_applicable", confidence: null })],
        0.99,
      ),
    ).toBe("precheck_passed");
  });

  it("labels all confidence boundaries", () => {
    expect(confidenceBand(0.9)).toBe("high");
    expect(confidenceBand(0.7)).toBe("medium");
    expect(confidenceBand(0.6999)).toBe("low");
  });

  it("counts every rule status", () => {
    expect(
      countRuleStatuses([
        finding(),
        finding({ status: "fail" }),
        finding({ status: "review" }),
        finding({ status: "not_applicable" }),
        finding({ status: "not_assessed" }),
      ]),
    ).toEqual({
      pass: 1,
      fail: 1,
      review: 1,
      not_applicable: 1,
      not_assessed: 1,
    });
  });
});
