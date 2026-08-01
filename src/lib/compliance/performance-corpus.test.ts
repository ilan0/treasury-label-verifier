import { describe, expect, it } from "vitest";

import { benchmarkScenarios } from "@/lib/demo/scenarios";

import { evaluateCompliance } from "./evaluate";

const expected = {
  "compliant-bourbon": "precheck_passed",
  "stones-throw": "precheck_passed",
  "warning-format": "correction_needed",
  "imported-wine": "correction_needed",
  "malt-conditional": "precheck_passed",
  "low-quality": "human_review_required",
} as const;

describe("60-label performance correctness corpus", () => {
  const corpus = benchmarkScenarios(60);

  it("contains sixty beverage, defect, equivalence, and image-quality vectors", () => {
    expect(corpus).toHaveLength(60);
    expect(new Set(corpus.map((item) => item.id))).toEqual(
      new Set(Object.keys(expected)),
    );
  });

  it.each(corpus.map((item, index) => ({ index: index + 1, item })))(
    "routes corpus label $index conservatively",
    ({ item }) => {
      const assessment = evaluateCompliance(item.application, item.observation);
      expect(assessment.outcome).toBe(expected[item.id]);
      if (expected[item.id] !== "precheck_passed") {
        expect(assessment.outcome).not.toBe("precheck_passed");
      }
    },
  );
});
