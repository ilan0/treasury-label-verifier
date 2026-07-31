import { describe, expect, it } from "vitest";

import type {
  ApplicationData,
  LabelObservation,
  RegulatoryProfile,
  RuleStatus,
} from "@/lib/domain";

import { evaluateCompliance } from "./evaluate";
import { GOVERNMENT_HEALTH_WARNING } from "./health-warning";

function application(
  profile: RegulatoryProfile = "faa_distilled_spirits",
): ApplicationData {
  return {
    profile,
    beverageFamily:
      profile === "faa_distilled_spirits"
        ? "distilled_spirits"
        : profile === "faa_malt_beverage"
          ? "malt_beverage"
          : "wine",
    brandName: "Example Brand",
    classType: "Example Type",
    alcoholByVolume: 40,
    netContents: { value: 750, unit: "mL" },
    responsibleParty: {
      name: "Example Producer LLC",
      address: "Austin, Texas",
      role: "Produced by",
    },
    declarations: {},
  };
}

function observation(): LabelObservation {
  return {
    brandName: { value: "Example Brand", confidence: 0.99, panel: "front" },
    classType: { value: "Example Type", confidence: 0.99, panel: "front" },
    alcoholByVolume: {
      value: 40,
      confidence: 0.99,
      rawText: "40% Alcohol by Volume",
      panel: "front",
    },
    netContents: {
      value: { value: 750, unit: "mL" },
      confidence: 0.99,
      panel: "back",
    },
    responsibleName: {
      value: "Example Producer LLC",
      confidence: 0.99,
      panel: "back",
    },
    responsibleAddress: {
      value: "Austin, TX",
      confidence: 0.99,
      panel: "back",
    },
    responsibleRole: {
      value: "Produced by",
      confidence: 0.99,
      panel: "back",
    },
    healthWarning: {
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
    },
    sameFieldOfVision: { brandClassAlcohol: true },
    overallConfidence: 0.99,
  };
}

function statusFor(
  app: ApplicationData,
  observed: LabelObservation,
  ruleId: string,
): RuleStatus {
  const found = evaluateCompliance(app, observed).results.find(
    (result) => result.ruleId === ruleId,
  );
  if (!found) throw new Error(`Missing test finding ${ruleId}`);
  return found.status;
}

describe("observable placement and application gaps", () => {
  it("distinguishes unknown and visibly failing same-field-of-vision evidence", () => {
    const unknown = observation();
    unknown.sameFieldOfVision = undefined;
    expect(
      statusFor(application(), unknown, "spirits.same-field-of-vision"),
    ).toBe("not_assessed");

    const failing = observation();
    failing.sameFieldOfVision = { brandClassAlcohol: false };
    expect(
      statusFor(application(), failing, "spirits.same-field-of-vision"),
    ).toBe("fail");
  });

  it("reviews a required alcohol statement when the application ABV is absent", () => {
    const app = application();
    app.alcoholByVolume = undefined;
    expect(statusFor(app, observation(), "spirits.alcohol-content")).toBe(
      "review",
    );
  });

  it("catches inconsistent proof even when ABV matches", () => {
    const app = application();
    app.proof = 80;
    const observed = observation();
    observed.proof = { value: 90, confidence: 0.99, panel: "front" };
    expect(statusFor(app, observed, "spirits.alcohol-content")).toBe("fail");
  });

  it("reviews unavailable alcohol wording and rejects the ABV abbreviation", () => {
    const unavailable = observation();
    unavailable.alcoholByVolume = {
      value: 40,
      confidence: 0.99,
      panel: "front",
    };
    expect(
      statusFor(application(), unavailable, "spirits.alcohol-content"),
    ).toBe("review");

    const abv = observation();
    abv.alcoholByVolume = {
      value: 40,
      confidence: 0.99,
      rawText: "40% ABV",
      panel: "front",
    };
    expect(statusFor(application(), abv, "spirits.alcohol-content")).toBe(
      "fail",
    );
  });

  it("requires an observable role phrase when the application does not prescribe one", () => {
    const app = application();
    app.responsibleParty = { ...app.responsibleParty, role: undefined };
    const observed = observation();
    observed.responsibleRole = undefined;
    expect(statusFor(app, observed, "spirits.responsible-party")).toBe("fail");
  });

  it("reviews an authorized closure possibility but fails bottom placement", () => {
    const closure = observation();
    closure.netContents = { ...closure.netContents!, panel: "closure" };
    expect(statusFor(application(), closure, "spirits.net-contents")).toBe(
      "review",
    );

    const bottom = observation();
    bottom.netContents = { ...bottom.netContents!, panel: "bottom" };
    expect(statusFor(application(), bottom, "spirits.net-contents")).toBe(
      "fail",
    );
  });

  it("enforces metric measure for spirits and U.S. standard measure for malt beverages", () => {
    const imperialSpirits = observation();
    imperialSpirits.netContents = {
      value: { value: 25.3605, unit: "fl_oz" },
      confidence: 0.99,
      panel: "back",
    };
    expect(
      statusFor(application(), imperialSpirits, "spirits.net-contents"),
    ).toBe("fail");

    const malt = application("faa_malt_beverage");
    const metricMalt = observation();
    expect(statusFor(malt, metricMalt, "malt.net-contents")).toBe("fail");
  });

  it("reviews an imported application with no confirmed country", () => {
    const app = application();
    app.declarations = { imported: true };
    expect(statusFor(app, observation(), "spirits.import-origin")).toBe(
      "review",
    );
  });
});

describe("spirits conditional disclosures", () => {
  it("evaluates age and state statements when applicable", () => {
    const app = application();
    app.ageStatement = "Aged 4 Years";
    app.stateOfDistillation = "Kentucky";
    app.declarations = {
      ageStatementRequired: true,
      stateOfDistillationRequired: true,
    };
    const observed = observation();
    observed.ageStatement = { value: "Aged 4 Years", confidence: 0.99 };
    observed.stateOfDistillation = { value: "Kentucky", confidence: 0.99 };
    expect(statusFor(app, observed, "spirits.age-statement")).toBe("pass");
    expect(statusFor(app, observed, "spirits.state-of-distillation")).toBe(
      "pass",
    );
  });

  it("reviews applicable age/state requirements absent from the application", () => {
    const app = application();
    app.declarations = {
      ageStatementRequired: true,
      stateOfDistillationRequired: true,
    };
    expect(statusFor(app, observation(), "spirits.age-statement")).toBe(
      "review",
    );
    expect(statusFor(app, observation(), "spirits.state-of-distillation")).toBe(
      "review",
    );
  });

  it("validates the neutral-spirit commodity and percentage", () => {
    const app = application();
    app.declarations = {
      containsNeutralSpirits: true,
      neutralSpiritsCommodity: "corn",
      neutralSpiritsPercentage: 20,
    };
    const observed = observation();
    observed.conditionalStatements = {
      neutral_spirits: {
        value: "20% neutral spirits distilled from corn",
        confidence: 0.99,
      },
    };
    expect(statusFor(app, observed, "spirits.neutral-spirits")).toBe("pass");
    observed.conditionalStatements.neutral_spirits!.value =
      "10% neutral spirits distilled from grain";
    expect(statusFor(app, observed, "spirits.neutral-spirits")).toBe("fail");
  });

  it("recognizes applicable coloring, sulfite, Yellow 5, and carmine disclosures", () => {
    const app = application();
    app.declarations = {
      woodTreatmentOrColoringDisclosureRequired: true,
      containsSulfites: true,
      containsYellow5: true,
      containsCarmineOrCochineal: true,
    };
    const observed = observation();
    observed.conditionalStatements = {
      wood_treatment_or_coloring: {
        value: "Colored with caramel",
        confidence: 0.99,
      },
      sulfites: { value: "Contains sulphites", confidence: 0.99 },
      yellow5: { value: "Contains FD&C Yellow No. 5", confidence: 0.99 },
      carmine_or_cochineal: { value: "Contains carmine", confidence: 0.99 },
    };
    expect(statusFor(app, observed, "spirits.wood-treatment-or-coloring")).toBe(
      "pass",
    );
    expect(statusFor(app, observed, "spirits.sulfites")).toBe("pass");
    expect(statusFor(app, observed, "spirits.yellow5")).toBe("pass");
    expect(statusFor(app, observed, "spirits.carmine-or-cochineal")).toBe(
      "pass",
    );
  });
});

describe("wine and malt conditional requirements", () => {
  it("compares a required wine appellation", () => {
    const app = application("faa_wine");
    app.appellation = "Napa Valley";
    app.declarations = { appellationRequired: true };
    const observed = observation();
    observed.appellation = { value: "Napa Valley", confidence: 0.99 };
    expect(statusFor(app, observed, "wine.appellation")).toBe("pass");
  });

  it("compares a required foreign-wine percentage", () => {
    const app = application("faa_wine");
    app.foreignWinePercentage = 25;
    app.declarations = { foreignWinePercentageRequired: true };
    const observed = observation();
    observed.foreignWinePercentage = { value: 25, confidence: 0.99 };
    expect(statusFor(app, observed, "wine.foreign-wine-percentage")).toBe(
      "pass",
    );

    app.foreignWinePercentage = undefined;
    expect(statusFor(app, observed, "wine.foreign-wine-percentage")).toBe(
      "review",
    );
  });

  it("reviews a required appellation or composition absent from the application", () => {
    const wine = application("faa_wine");
    wine.declarations = { appellationRequired: true };
    expect(statusFor(wine, observation(), "wine.appellation")).toBe("review");

    const malt = application("faa_malt_beverage");
    malt.declarations = { compositionStatementRequired: true };
    expect(statusFor(malt, observation(), "malt.composition")).toBe("review");
  });

  it("compares a required malt composition statement", () => {
    const app = application("faa_malt_beverage");
    app.compositionStatement = "Ale brewed with natural flavors";
    app.declarations = { compositionStatementRequired: true };
    const observed = observation();
    observed.conditionalStatements = {
      composition: {
        value: "Ale brewed with natural flavors",
        confidence: 0.99,
      },
    };
    expect(statusFor(app, observed, "malt.composition")).toBe("pass");
  });

  it("finds a cochineal alternative and rejects an incomplete Yellow 5 statement", () => {
    const app = application("faa_malt_beverage");
    app.declarations = {
      containsCarmineOrCochineal: true,
      containsYellow5: true,
    };
    const observed = observation();
    observed.conditionalStatements = {
      carmine_or_cochineal: {
        value: "Contains cochineal extract",
        confidence: 0.99,
      },
      yellow5: { value: "Contains yellow coloring", confidence: 0.99 },
    };
    expect(statusFor(app, observed, "malt.carmine-or-cochineal")).toBe("pass");
    expect(statusFor(app, observed, "malt.yellow5")).toBe("fail");
  });

  it("recognizes a required malt-beverage sulfites disclosure", () => {
    const app = application("faa_malt_beverage");
    app.declarations = { containsSulfites: true };
    const observed = observation();
    observed.conditionalStatements = {
      sulfites: { value: "Contains sulfites", confidence: 0.99 },
    };
    expect(statusFor(app, observed, "malt.sulfites")).toBe("pass");
  });
});
