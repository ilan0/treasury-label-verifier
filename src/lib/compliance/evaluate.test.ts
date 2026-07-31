import { describe, expect, it } from "vitest";

import type { ApplicationData, LabelObservation } from "@/lib/domain";

import { evaluateCompliance } from "./evaluate";
import { GOVERNMENT_HEALTH_WARNING } from "./health-warning";
import { rulesForProfile } from "./ruleset";

const spiritsApplication: ApplicationData = {
  profile: "faa_distilled_spirits",
  beverageFamily: "distilled_spirits",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholByVolume: 45,
  proof: 90,
  netContents: { value: 750, unit: "mL" },
  responsibleParty: {
    name: "Old Tom Distillery LLC",
    address: "Frankfort, Kentucky",
    role: "Distilled and bottled by",
  },
  declarations: {},
};

function compliantObservation(): LabelObservation {
  return {
    brandName: {
      value: "OLD TOM DISTILLERY",
      confidence: 0.99,
      panel: "front",
    },
    classType: {
      value: "Kentucky Straight Bourbon Whisky",
      confidence: 0.98,
      panel: "front",
    },
    alcoholByVolume: {
      value: 45,
      confidence: 0.99,
      rawText: "45% Alc./Vol.",
      panel: "front",
    },
    proof: { value: 90, confidence: 0.99, panel: "front" },
    netContents: {
      value: { value: 0.75, unit: "L" },
      confidence: 0.99,
      panel: "back",
    },
    responsibleName: {
      value: "Old Tom Distillery LLC",
      confidence: 0.98,
      panel: "back",
    },
    responsibleAddress: {
      value: "Frankfort, KY",
      confidence: 0.98,
      panel: "back",
    },
    responsibleRole: {
      value: "Distilled & bottled by",
      confidence: 0.98,
      panel: "back",
    },
    healthWarning: {
      text: GOVERNMENT_HEALTH_WARNING,
      confidence: 0.99,
      panel: "back",
      headingAllCaps: true,
      headingBold: true,
      continuous: true,
      separateFromOtherInformation: true,
      legible: true,
      contrastingBackground: true,
      measuredTypeSizeMm: 2,
      containerVolumeMl: 750,
    },
    sameFieldOfVision: { brandClassAlcohol: true },
    overallConfidence: 0.98,
    imageQuality: "good",
  };
}

describe("end-to-end deterministic compliance evaluation", () => {
  it("pre-checks a fully evidenced compliant spirits label", () => {
    const assessment = evaluateCompliance(
      spiritsApplication,
      compliantObservation(),
    );

    expect(assessment).toMatchObject({
      rulesetVersion: "2026-07-31.1",
      profile: "faa_distilled_spirits",
      outcome: "precheck_passed",
    });
    expect(assessment.counts.fail).toBe(0);
    expect(assessment.results).toHaveLength(
      rulesForProfile("faa_distilled_spirits").length,
    );
  });

  it("accepts harmless punctuation/case differences but not a true mismatch", () => {
    const punctuation = compliantObservation();
    punctuation.brandName = {
      value: "Old Tom Distillery",
      confidence: 0.99,
      panel: "front",
    };
    expect(evaluateCompliance(spiritsApplication, punctuation).outcome).toBe(
      "precheck_passed",
    );

    const mismatch = compliantObservation();
    mismatch.brandName = {
      value: "New Harbor Gin",
      confidence: 0.99,
      panel: "front",
    };
    const assessment = evaluateCompliance(spiritsApplication, mismatch);
    expect(assessment.outcome).toBe("correction_needed");
    expect(
      assessment.results.find((item) => item.ruleId === "spirits.brand-name"),
    ).toMatchObject({ status: "fail" });
  });

  it("routes an unscaled otherwise-compliant photo to review", () => {
    const observation = compliantObservation();
    observation.healthWarning = {
      ...observation.healthWarning!,
      measuredTypeSizeMm: undefined,
    };
    const assessment = evaluateCompliance(spiritsApplication, observation);
    expect(assessment.outcome).toBe("human_review_required");
    expect(
      assessment.results.find(
        (item) => item.ruleId === "warning.minimum-type-size",
      ),
    ).toMatchObject({ status: "not_assessed" });
  });

  it("routes apparent missing content from poor evidence to review, not correction", () => {
    const observation = compliantObservation();
    observation.classType = {
      value: null,
      confidence: 0.15,
      panel: "front",
      rawText: "[obscured by glare]",
    };
    observation.healthWarning = {
      text: null,
      confidence: 0.18,
      panel: "back",
      legible: false,
    };
    observation.imageQuality = "poor";
    observation.overallConfidence = 0.42;

    const assessment = evaluateCompliance(spiritsApplication, observation);
    expect(assessment.outcome).toBe("human_review_required");
    expect(assessment.counts.fail).toBe(0);
    expect(assessment.counts.review).toBeGreaterThan(0);
  });

  it("requires imported origin only when declared and catches a mismatch", () => {
    const application: ApplicationData = {
      ...spiritsApplication,
      countryOfOrigin: "Mexico",
      declarations: { imported: true },
    };
    const observation = compliantObservation();
    observation.countryOfOrigin = {
      value: "Canada",
      confidence: 0.99,
      panel: "back",
    };
    expect(evaluateCompliance(application, observation).outcome).toBe(
      "correction_needed",
    );
  });

  it("routes a below-7-percent wine profile to specialist review", () => {
    const application: ApplicationData = {
      ...spiritsApplication,
      profile: "irc_wine_under_7",
      beverageFamily: "wine",
      alcoholByVolume: 6,
      proof: undefined,
    };
    const assessment = evaluateCompliance(application, compliantObservation());
    expect(assessment.outcome).toBe("human_review_required");
    expect(
      assessment.results.find((item) =>
        item.ruleId.startsWith("jurisdiction."),
      ),
    ).toMatchObject({ status: "review" });
  });
});

describe("conditional beverage rules", () => {
  it("allows an explicitly optional FAA wine alcohol statement", () => {
    const application: ApplicationData = {
      ...spiritsApplication,
      profile: "faa_wine",
      beverageFamily: "wine",
      classType: "Table Wine",
      proof: undefined,
      declarations: { alcoholContentRequired: false },
    };
    const observation = compliantObservation();
    observation.classType = {
      value: "Table Wine",
      confidence: 0.99,
      panel: "front",
    };
    observation.alcoholByVolume = undefined;
    observation.proof = undefined;
    const assessment = evaluateCompliance(application, observation);
    expect(
      assessment.results.find((item) => item.ruleId === "wine.alcohol-content"),
    ).toMatchObject({ status: "not_applicable" });
    expect(assessment.outcome).toBe("precheck_passed");
  });

  it("fails an applicable sulfites disclosure that is missing", () => {
    const application: ApplicationData = {
      ...spiritsApplication,
      profile: "faa_wine",
      beverageFamily: "wine",
      declarations: { containsSulfites: true },
    };
    const assessment = evaluateCompliance(application, compliantObservation());
    expect(
      assessment.results.find((item) => item.ruleId === "wine.sulfites"),
    ).toMatchObject({ status: "fail" });
    expect(assessment.outcome).toBe("correction_needed");
  });

  it("passes an applicable exact aspartame disclosure", () => {
    const application: ApplicationData = {
      ...spiritsApplication,
      declarations: { containsAspartame: true },
    };
    const observation = compliantObservation();
    observation.conditionalStatements = {
      aspartame: {
        value: "PHENYLKETONURICS: CONTAINS PHENYLALANINE.",
        confidence: 0.98,
        panel: "back",
      },
    };
    expect(
      evaluateCompliance(application, observation).results.find(
        (item) => item.ruleId === "spirits.aspartame",
      ),
    ).toMatchObject({ status: "pass" });

    observation.conditionalStatements.aspartame!.value =
      "Phenylketonurics: Contains Phenylalanine.";
    expect(
      evaluateCompliance(application, observation).results.find(
        (item) => item.ruleId === "spirits.aspartame",
      ),
    ).toMatchObject({ status: "fail" });
  });
});
