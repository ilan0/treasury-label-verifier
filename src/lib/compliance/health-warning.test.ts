import { describe, expect, it } from "vitest";

import {
  evaluateHealthWarning,
  GOVERNMENT_HEALTH_WARNING,
  hasExactGovernmentWarning,
  minimumWarningTypeSizeMm,
} from "./health-warning";

const compliantObservation = {
  text: GOVERNMENT_HEALTH_WARNING,
  confidence: 0.99,
  headingAllCaps: true,
  headingBold: true,
  continuous: true,
  separateFromOtherInformation: true,
  legible: true,
  contrastingBackground: true,
  measuredTypeSizeMm: 2,
  containerVolumeMl: 750,
} as const;

describe("exact government health warning", () => {
  it("accepts line wrapping and repeated whitespace only", () => {
    expect(hasExactGovernmentWarning(GOVERNMENT_HEALTH_WARNING)).toBe(true);
    expect(
      hasExactGovernmentWarning(
        GOVERNMENT_HEALTH_WARNING.replace(" (1) ", "\n\n(1)   "),
      ),
    ).toBe(true);
  });

  it.each([
    GOVERNMENT_HEALTH_WARNING.replace(
      "GOVERNMENT WARNING",
      "Government Warning",
    ),
    GOVERNMENT_HEALTH_WARNING.replace("Surgeon General,", "Surgeon General"),
    GOVERNMENT_HEALTH_WARNING.replace("may cause", "can cause"),
    `${GOVERNMENT_HEALTH_WARNING} Drink responsibly.`,
    GOVERNMENT_HEALTH_WARNING.replace("WARNING:", "WARNING"),
    GOVERNMENT_HEALTH_WARNING.replace("(1)", "1."),
    GOVERNMENT_HEALTH_WARNING.replace("(2)", "2."),
    GOVERNMENT_HEALTH_WARNING.replace("birth defects", "harm"),
    GOVERNMENT_HEALTH_WARNING.replace("should not drink", "must not drink"),
    GOVERNMENT_HEALTH_WARNING.replace("impairs", "can impair"),
    GOVERNMENT_HEALTH_WARNING.replace("drive a car", "operate a vehicle"),
    GOVERNMENT_HEALTH_WARNING.replace("health problems", "health risks"),
    GOVERNMENT_HEALTH_WARNING.replace("alcoholic beverages", "alcohol"),
    GOVERNMENT_HEALTH_WARNING.slice(0, -1),
  ])("rejects a statutory text mutation", (mutated) => {
    expect(hasExactGovernmentWarning(mutated)).toBe(false);
  });

  it("fails absent warning text", () => {
    expect(evaluateHealthWarning(undefined)[0]).toMatchObject({
      ruleId: "warning.exact-text",
      status: "fail",
    });
  });
});

describe("warning visual requirements", () => {
  it("passes a fully evidenced compliant warning", () => {
    expect(
      evaluateHealthWarning(compliantObservation).map((item) => item.status),
    ).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("fails title-case or non-bold headings", () => {
    const results = evaluateHealthWarning({
      ...compliantObservation,
      headingAllCaps: false,
    });
    expect(results[1].status).toBe("fail");
  });

  it("does not claim physical size compliance from an unscaled photo", () => {
    const results = evaluateHealthWarning({
      ...compliantObservation,
      measuredTypeSizeMm: undefined,
    });
    expect(results[3]).toMatchObject({ status: "not_assessed" });
  });

  it("applies all three volume thresholds at their boundaries", () => {
    expect(minimumWarningTypeSizeMm(237)).toBe(1);
    expect(minimumWarningTypeSizeMm(237.01)).toBe(2);
    expect(minimumWarningTypeSizeMm(3000)).toBe(2);
    expect(minimumWarningTypeSizeMm(3000.01)).toBe(3);
  });

  it("fails type smaller than the applicable threshold", () => {
    const results = evaluateHealthWarning({
      ...compliantObservation,
      measuredTypeSizeMm: 1.9,
    });
    expect(results[3]).toMatchObject({ status: "fail" });
  });
});
