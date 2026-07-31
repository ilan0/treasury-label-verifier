import { describe, expect, it } from "vitest";

import {
  batchStatusEnum,
  jobOutcomeEnum,
  jobStatusEnum,
  labelPanelEnum,
  regulatoryProfileEnum,
  ruleStatusEnum,
} from "./schema";

describe("database domain enums", () => {
  it("keeps persisted regulatory profiles aligned with the public contract", () => {
    expect(regulatoryProfileEnum.enumValues).toEqual([
      "faa_distilled_spirits",
      "faa_wine",
      "faa_malt_beverage",
      "irc_wine_under_7",
      "irc_beer_non_faa",
      "classification_review",
    ]);
  });

  it("contains every durable processing and outcome state", () => {
    expect(jobStatusEnum.enumValues).toEqual(
      expect.arrayContaining([
        "queued",
        "validating",
        "extracting",
        "verifying",
        "completed",
        "review_required",
        "correction_needed",
        "rejected",
        "failed",
        "cancelled",
        "expired",
      ]),
    );
    expect(batchStatusEnum.enumValues).toContain("partial");
    expect(jobOutcomeEnum.enumValues).toEqual([
      "precheck_passed",
      "human_review_required",
      "correction_needed",
    ]);
    expect(ruleStatusEnum.enumValues).toContain("not_assessed");
  });

  it("supports complete multi-panel evidence sets", () => {
    expect(labelPanelEnum.enumValues).toEqual(
      expect.arrayContaining([
        "brand",
        "front",
        "back",
        "side",
        "strip",
        "neck",
        "collarette",
        "keg",
        "container_marking",
        "carton",
        "closure",
        "bottom",
        "other",
      ]),
    );
  });
});
