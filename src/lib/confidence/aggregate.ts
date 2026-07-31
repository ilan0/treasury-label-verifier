import type { JobOutcome, RuleResult, RuleStatus } from "@/lib/domain";

export const AUTO_CLEAR_CONFIDENCE = 0.9;

export type ConfidenceBand = "high" | "medium" | "low";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= AUTO_CLEAR_CONFIDENCE) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

export function countRuleStatuses(
  results: readonly RuleResult[],
): Record<RuleStatus, number> {
  const counts: Record<RuleStatus, number> = {
    pass: 0,
    fail: 0,
    review: 0,
    not_applicable: 0,
    not_assessed: 0,
  };

  for (const result of results) counts[result.status] += 1;
  return counts;
}

export function aggregateOutcome(
  results: readonly RuleResult[],
  overallConfidence: number,
): JobOutcome {
  const applicable = results.filter(
    (result) => result.status !== "not_applicable",
  );

  if (
    applicable.some(
      (result) =>
        result.status === "fail" &&
        (result.severity === "mandatory" || result.severity === "conditional"),
    )
  ) {
    return "correction_needed";
  }

  if (
    overallConfidence < AUTO_CLEAR_CONFIDENCE ||
    applicable.some(
      (result) =>
        result.status === "review" ||
        result.status === "not_assessed" ||
        (result.status === "pass" &&
          (result.confidence === null ||
            result.confidence < AUTO_CLEAR_CONFIDENCE)),
    ) ||
    applicable.some(
      (result) => result.status === "fail" && result.severity === "advisory",
    )
  ) {
    return "human_review_required";
  }

  return "precheck_passed";
}
