import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GOVERNMENT_HEALTH_WARNING } from "@/lib/compliance/health-warning";

import type { ApplicationData } from "./types";
import {
  createLabelExtractionWireSchema,
  isObservationFastPathComplete,
  isWireExtractionFastPathComplete,
  labelExtractionWireSchema,
  type LabelExtractionWire,
  wireToLabelObservation,
} from "./extraction-wire";

const application: ApplicationData = {
  profile: "faa_distilled_spirits",
  beverageFamily: "distilled_spirits",
  brandName: "Old Tom Distillery",
  classType: "Kentucky Straight Bourbon Whiskey",
  alcoholByVolume: 45,
  proof: 90,
  netContents: { value: 750, unit: "mL" },
  responsibleParty: {
    name: "Old Tom Distilling Company",
    address: "Bardstown, Kentucky",
    role: "Distilled and bottled by",
  },
  declarations: {},
};

function textField(
  k: "bn" | "ct" | "rn" | "ra" | "rr" | "co" | "ap" | "ag" | "sd",
  v: string | null,
) {
  return {
    k,
    v,
    c: v === null ? 0 : 0.98,
    p: v === null ? null : ("front" as const),
    r: v,
  };
}

function numberField(
  k: "av" | "pf" | "fw",
  v: number | null,
  raw: string | null,
) {
  return {
    k,
    v,
    c: v === null ? 0 : 0.98,
    p: v === null ? null : ("front" as const),
    r: raw,
  };
}

function completeWire(): LabelExtractionWire {
  return {
    raw: `${GOVERNMENT_HEALTH_WARNING}\nOLD TOM DISTILLERY`,
    f: [
      textField("bn", "OLD TOM DISTILLERY"),
      textField("ct", "Kentucky Straight Bourbon Whiskey"),
      numberField("av", 45, "45% Alc./Vol."),
      numberField("pf", 90, "90 Proof"),
      {
        k: "nc",
        v: { a: 750, u: "mL" },
        c: 0.99,
        p: "back",
        r: "750 mL",
      },
      textField("rn", "Old Tom Distilling Company"),
      textField("ra", "Bardstown, Kentucky"),
      textField("rr", "Distilled and bottled by"),
    ],
    d: [],
    w: {
      t: GOVERNMENT_HEALTH_WARNING,
      c: 0.99,
      p: "back",
      uc: true,
      bd: true,
      ct: true,
      sp: true,
      lg: true,
      bg: true,
      mm: 2.1,
      ml: 750,
    },
    sf: true,
    q: 0.98,
    iq: "good",
    notes: [],
  };
}

describe("compact extraction wire schema", () => {
  it("accepts the compact fully populated payload", () => {
    expect(labelExtractionWireSchema.safeParse(completeWire()).success).toBe(
      true,
    );
  });

  it("is serializable as a structured-output JSON schema", () => {
    const jsonSchema = z.toJSONSchema(labelExtractionWireSchema);
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toHaveProperty("f");
    expect(jsonSchema.properties).toHaveProperty("w");
  });

  it("rejects duplicate primary or conditional keys", () => {
    const duplicatePrimary = completeWire();
    duplicatePrimary.f.push(textField("bn", "Duplicate"));
    expect(labelExtractionWireSchema.safeParse(duplicatePrimary).success).toBe(
      false,
    );

    const duplicateConditional = completeWire();
    duplicateConditional.d = [
      { ...textField("bn", "Contains sulfites"), k: "su" },
      { ...textField("bn", "Contains sulfites"), k: "su" },
    ];
    expect(
      labelExtractionWireSchema.safeParse(duplicateConditional).success,
    ).toBe(false);
  });

  it("enforces confidence and positive volume", () => {
    const invalid = completeWire() as unknown as {
      q: number;
      f: Array<Record<string, unknown>>;
    };
    invalid.q = 1.1;
    expect(labelExtractionWireSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects fields outside the application profile/declaration allowlist", () => {
    const unexpected = completeWire();
    unexpected.f.push(textField("ag", "Aged 4 years"));
    expect(
      createLabelExtractionWireSchema(application).safeParse(unexpected)
        .success,
    ).toBe(false);

    const undeclared = completeWire();
    undeclared.d.push({
      ...textField("bn", "Contains sulfites"),
      k: "su",
    });
    expect(
      createLabelExtractionWireSchema(application).safeParse(undeclared)
        .success,
    ).toBe(false);
  });

  it("publishes narrowed contextual enums in the generated JSON schema", () => {
    const plainSpiritsSchema = JSON.stringify(
      z.toJSONSchema(createLabelExtractionWireSchema(application)),
    );
    expect(plainSpiritsSchema).not.toContain('"ag"');
    expect(plainSpiritsSchema).toContain('"maxItems":0');

    const declaredWine: ApplicationData = {
      ...application,
      profile: "faa_wine",
      beverageFamily: "wine",
      proof: undefined,
      declarations: {
        alcoholContentRequired: false,
        appellationRequired: true,
        containsSulfites: true,
      },
    };
    const wineSchema = JSON.stringify(
      z.toJSONSchema(createLabelExtractionWireSchema(declaredWine)),
    );
    expect(wineSchema).toContain('"ap"');
    expect(wineSchema).toContain('"su"');
    expect(wineSchema).not.toContain('"ag"');
    expect(wineSchema).not.toContain('"pf"');
  });
});

describe("lossless wire conversion", () => {
  it("preserves field values, raw text, confidence, panel, boxes, and warning format", () => {
    const observation = wireToLabelObservation(completeWire());
    expect(observation.brandName).toEqual({
      value: "OLD TOM DISTILLERY",
      confidence: 0.98,
      panel: "front",
      rawText: "OLD TOM DISTILLERY",
    });
    expect(observation.netContents?.value).toEqual({ value: 750, unit: "mL" });
    expect(observation.healthWarning).toEqual({
      text: GOVERNMENT_HEALTH_WARNING,
      confidence: 0.99,
      panel: "back",
      headingAllCaps: true,
      headingBold: true,
      continuous: true,
      separateFromOtherInformation: true,
      legible: true,
      contrastingBackground: true,
      measuredTypeSizeMm: 2.1,
      containerVolumeMl: 750,
    });
    expect(observation.sameFieldOfVision).toEqual({ brandClassAlcohol: true });
  });

  it("omits null field evidence and unknown warning-format facts", () => {
    const wire = completeWire();
    wire.f[0] = textField("bn", null);
    wire.w = {
      ...wire.w,
      t: null,
      p: null,
      uc: null,
      bd: null,
      ct: null,
      sp: null,
      lg: null,
      bg: null,
      mm: null,
      ml: null,
    };
    wire.sf = null;
    const observation = wireToLabelObservation(wire);
    expect(observation.brandName).toBeUndefined();
    expect(observation.healthWarning).toEqual({ text: null, confidence: 0.99 });
    expect(observation.sameFieldOfVision).toEqual({});
  });

  it("converts every conditional evidence key without changing text", () => {
    const wire = completeWire();
    wire.d = (
      [
        ["su", "Contains sulfites"],
        ["y5", "FD&C Yellow No. 5"],
        ["cc", "Contains carmine"],
        ["as", "PHENYLKETONURICS: CONTAINS PHENYLALANINE."],
        ["ns", "20% neutral spirits distilled from corn"],
        ["wc", "Colored with caramel"],
        ["cm", "Ale brewed with natural flavors"],
      ] as const
    ).map(([k, v]) => ({ ...textField("bn", v), k }));

    const statements = wireToLabelObservation(wire).conditionalStatements;
    expect(Object.keys(statements ?? {})).toEqual([
      "sulfites",
      "yellow5",
      "carmine_or_cochineal",
      "aspartame",
      "neutral_spirits",
      "wood_treatment_or_coloring",
      "composition",
    ]);
    expect(statements?.aspartame?.value).toBe(
      "PHENYLKETONURICS: CONTAINS PHENYLALANINE.",
    );
  });
});

describe("deterministic fast-path completeness", () => {
  it("accepts only a fully observed, high-confidence, internally consistent profile", () => {
    const wire = completeWire();
    expect(isWireExtractionFastPathComplete(application, wire)).toBe(true);
    expect(
      isObservationFastPathComplete(application, wireToLabelObservation(wire)),
    ).toBe(true);
  });

  it("is completeness-only and leaves negative warning evidence for compliance", () => {
    const wire = completeWire();
    wire.w.t = "Government Warning: visibly incorrect but fully transcribed";
    wire.w.uc = false;
    wire.w.bd = false;
    expect(isWireExtractionFastPathComplete(application, wire)).toBe(true);
  });

  it.each([
    ["low overall confidence", (wire: LabelExtractionWire) => (wire.q = 0.89)],
    ["poor image", (wire: LabelExtractionWire) => (wire.iq = "poor")],
    [
      "missing scaled warning size",
      (wire: LabelExtractionWire) => (wire.w.mm = null),
    ],
    ["wrong warning volume", (wire: LabelExtractionWire) => (wire.w.ml = 700)],
    ["missing mandatory field", (wire: LabelExtractionWire) => wire.f.shift()],
    [
      "inconsistent proof",
      (wire: LabelExtractionWire) => {
        const proof = wire.f.find((field) => field.k === "pf");
        if (proof && proof.k === "pf") proof.v = 80;
      },
    ],
  ])("rejects %s", (_name, mutate) => {
    const wire = completeWire();
    mutate(wire);
    expect(isWireExtractionFastPathComplete(application, wire)).toBe(false);
  });

  it("requires every activated primary and conditional declaration", () => {
    const declared: ApplicationData = {
      ...application,
      countryOfOrigin: "United States",
      ageStatement: "Aged 4 Years",
      stateOfDistillation: "Kentucky",
      declarations: {
        imported: true,
        ageStatementRequired: true,
        stateOfDistillationRequired: true,
        containsSulfites: true,
        containsYellow5: true,
        containsCarmineOrCochineal: true,
        containsAspartame: true,
        containsNeutralSpirits: true,
        woodTreatmentOrColoringDisclosureRequired: true,
      },
    };
    const wire = completeWire();
    expect(isWireExtractionFastPathComplete(declared, wire)).toBe(false);

    wire.f.push(
      textField("co", "United States"),
      textField("ag", "Aged 4 Years"),
      textField("sd", "Kentucky"),
    );
    wire.d = (
      [
        ["su", "Contains sulfites"],
        ["y5", "FD&C Yellow No. 5"],
        ["cc", "Contains carmine"],
        ["as", "PHENYLKETONURICS: CONTAINS PHENYLALANINE."],
        ["ns", "Neutral spirits distilled from corn"],
        ["wc", "Colored with caramel"],
      ] as const
    ).map(([k, v]) => ({ ...textField("bn", v), k }));
    expect(isWireExtractionFastPathComplete(declared, wire)).toBe(true);
  });

  it("supports wine and malt profile-specific optional/conditional fields", () => {
    const wine: ApplicationData = {
      ...application,
      profile: "faa_wine",
      beverageFamily: "wine",
      proof: undefined,
      appellation: "Napa Valley",
      foreignWinePercentage: 25,
      compositionStatement: "Red wine with natural flavors",
      declarations: {
        alcoholContentRequired: false,
        appellationRequired: true,
        foreignWinePercentageRequired: true,
        compositionStatementRequired: true,
      },
    };
    const wire = completeWire();
    wire.f = wire.f.filter((field) => field.k !== "av" && field.k !== "pf");
    wire.f.push(
      textField("ap", "Napa Valley"),
      numberField("fw", 25, "25% foreign wine"),
    );
    wire.d = [{ ...textField("bn", "Red wine with natural flavors"), k: "cm" }];
    wire.sf = null;
    expect(isWireExtractionFastPathComplete(wine, wire)).toBe(true);

    const malt: ApplicationData = {
      ...wine,
      profile: "faa_malt_beverage",
      beverageFamily: "malt_beverage",
      appellation: undefined,
      foreignWinePercentage: undefined,
      declarations: { alcoholContentRequired: false },
    };
    wire.f = wire.f.filter((field) => field.k !== "ap" && field.k !== "fw");
    wire.d = [];
    expect(isWireExtractionFastPathComplete(malt, wire)).toBe(true);
  });

  it.each([
    "classification_review",
    "irc_wine_under_7",
    "irc_beer_non_faa",
  ] as const)("never fast-paths jurisdiction profile %s", (profile) => {
    const app = { ...application, profile };
    expect(
      isObservationFastPathComplete(
        app,
        wireToLabelObservation(completeWire()),
      ),
    ).toBe(false);
  });

  it("rejects malformed unknown input without throwing", () => {
    expect(isWireExtractionFastPathComplete(application, { f: [] })).toBe(
      false,
    );
  });

  it("rejects incomplete observation values even when object keys exist", () => {
    const observed = wireToLabelObservation(completeWire());
    observed.responsibleAddress = {
      value: null,
      confidence: 0.99,
      panel: "back",
      rawText: "unreadable",
    };
    expect(isObservationFastPathComplete(application, observed)).toBe(false);
  });
});
