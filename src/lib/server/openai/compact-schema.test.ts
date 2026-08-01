import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";

import type { ApplicationData } from "@/lib/domain";

import {
  compactExtractionToObservation,
  createCompactLabelExtractionSchema,
  type CompactLabelExtraction,
} from "./compact-schema";

const application: ApplicationData = {
  profile: "faa_distilled_spirits",
  beverageFamily: "distilled_spirits",
  brandName: "OLD TOM DISTILLERY",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholByVolume: 45,
  proof: 90,
  netContents: { value: 750, unit: "mL" },
  responsibleParty: {
    name: "Old Tom Distilling Company",
    address: "Bardstown, Kentucky",
    role: "Distilled and Bottled by",
  },
};

function output(heading = "GOVERNMENT WARNING:"): CompactLabelExtraction {
  const text = { c: 0.99, p: "front" as const };
  return {
    bn: { ...text, v: "OLD TOM DISTILLERY" },
    ct: { ...text, v: "Kentucky Straight Bourbon Whiskey" },
    av: { ...text, v: 45, r: "45% Alc./Vol." },
    pf: { ...text, v: 90, r: "90 Proof" },
    nc: { ...text, v: { a: 750, u: "mL" }, r: "750 mL" },
    rn: { ...text, v: "Old Tom Distilling Company" },
    ra: { ...text, v: "Bardstown, Kentucky" },
    rr: { ...text, v: "Distilled and Bottled by" },
    w: {
      t: `${heading} (1) Test. (2) Test.`,
      c: 0.99,
      p: "front",
      uc: null,
      bd: true,
      ct: true,
      sp: true,
      lg: true,
      bg: true,
      mm: null,
      ml: null,
    },
    sf: true,
    q: 0.99,
    iq: "good",
  };
}

describe("compact OpenAI extraction schema", () => {
  it("can be represented by strict OpenAI Structured Outputs", () => {
    expect(() =>
      zodTextFormat(
        createCompactLabelExtractionSchema(application),
        "compact_label",
      ),
    ).not.toThrow();
  });

  it("requires fixed semantic properties instead of swappable array keys", () => {
    const invalid = output() as unknown as Record<string, unknown>;
    delete invalid.ct;
    expect(
      createCompactLabelExtractionSchema(application).safeParse(invalid)
        .success,
    ).toBe(false);
  });

  it("derives warning-heading capitalization from exact text", () => {
    expect(
      compactExtractionToObservation(output()).healthWarning?.headingAllCaps,
    ).toBe(true);
    expect(
      compactExtractionToObservation(output("Government Warning:"))
        .healthWarning?.headingAllCaps,
    ).toBe(false);
    expect(
      compactExtractionToObservation(output()).healthWarning?.headingBold,
    ).toBeUndefined();
  });

  it("includes only declared conditional fields", () => {
    const plain = zodTextFormat(
      createCompactLabelExtractionSchema(application),
      "plain",
    );
    const declared = zodTextFormat(
      createCompactLabelExtractionSchema({
        ...application,
        declarations: { containsYellow5: true },
      }),
      "declared",
    );
    expect(JSON.stringify(plain)).not.toContain('"y5"');
    expect(JSON.stringify(declared)).toContain('"y5"');
  });
});
