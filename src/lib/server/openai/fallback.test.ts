import { describe, expect, it } from "vitest";

import type { ApplicationData, LabelObservation } from "@/lib/domain";
import { GOVERNMENT_HEALTH_WARNING } from "@/lib/compliance/health-warning";

import { needsThoroughVisionFallback } from "./fallback";

const application: ApplicationData = {
  profile: "faa_distilled_spirits",
  beverageFamily: "distilled_spirits",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholByVolume: 45,
  netContents: { value: 750, unit: "mL" },
  responsibleParty: {
    name: "Producer",
    address: "City, ST",
    role: "Distilled by",
  },
};
const evidence = <T>(value: T) => ({
  value,
  confidence: 0.98,
  panel: "front" as const,
});
const clean: LabelObservation = {
  brandName: evidence(application.brandName),
  classType: evidence(application.classType),
  alcoholByVolume: evidence(45),
  netContents: evidence(application.netContents),
  responsibleName: evidence("Producer"),
  responsibleAddress: evidence("City, ST"),
  responsibleRole: evidence("Distilled by"),
  healthWarning: {
    text: GOVERNMENT_HEALTH_WARNING,
    confidence: 0.99,
    panel: "front",
  },
  overallConfidence: 0.98,
  imageQuality: "good",
};

describe("adaptive thorough vision fallback", () => {
  it("keeps complete clean artwork on the fast path without physical scale", () => {
    expect(needsThoroughVisionFallback(application, clean)).toBe(false);
  });

  it("falls back for poor evidence and truncated warnings", () => {
    expect(
      needsThoroughVisionFallback(application, {
        ...clean,
        imageQuality: "poor",
      }),
    ).toBe(true);
    expect(
      needsThoroughVisionFallback(application, {
        ...clean,
        healthWarning: { text: "GOVERNMENT WARNING:", confidence: 0.99 },
      }),
    ).toBe(true);
  });

  it("does not retry a fully transcribed deterministic warning defect", () => {
    expect(
      needsThoroughVisionFallback(application, {
        ...clean,
        healthWarning: {
          text: GOVERNMENT_HEALTH_WARNING.replace(
            "GOVERNMENT WARNING:",
            "Government Warning:",
          ),
          confidence: 0.99,
        },
      }),
    ).toBe(false);
  });

  it("falls back when profile-required alcohol content is unclear", () => {
    expect(
      needsThoroughVisionFallback(application, {
        ...clean,
        alcoholByVolume: undefined,
      }),
    ).toBe(true);
  });
});
