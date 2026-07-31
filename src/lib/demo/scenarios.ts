import type {
  ApplicationData,
  LabelObservation,
  LabelPanel,
} from "@/lib/domain";
import { GOVERNMENT_HEALTH_WARNING } from "@/lib/compliance/health-warning";

export const demoScenarioIds = [
  "compliant-bourbon",
  "stones-throw",
  "warning-format",
  "imported-wine",
  "malt-conditional",
  "low-quality",
  "batch-250",
] as const;

export type DemoScenarioId = (typeof demoScenarioIds)[number];

export interface DemoScenario {
  id: Exclude<DemoScenarioId, "batch-250">;
  title: string;
  artworkPath: string;
  warningTypeSizeMm?: number;
  application: ApplicationData;
  observation: LabelObservation;
}

function text(value: string, panel: LabelPanel = "front", confidence = 0.98) {
  return { value, panel, confidence, rawText: value } as const;
}

function number(value: number, panel: LabelPanel = "front", confidence = 0.98) {
  return { value, panel, confidence, rawText: String(value) } as const;
}

function abv(value: number, panel: LabelPanel = "front", confidence = 0.98) {
  return { value, panel, confidence, rawText: `${value}% Alc./Vol.` } as const;
}

function baseObservation(
  overrides: Partial<LabelObservation> = {},
): LabelObservation {
  return {
    brandName: text("OLD TOM DISTILLERY"),
    classType: text("Kentucky Straight Bourbon Whiskey"),
    alcoholByVolume: abv(45),
    proof: number(90),
    netContents: {
      value: { value: 750, unit: "mL" },
      panel: "front",
      confidence: 0.99,
      rawText: "750 mL",
    },
    responsibleName: text("Old Tom Distilling Company", "back"),
    responsibleAddress: text("Bardstown, Kentucky", "back"),
    responsibleRole: text("Distilled and Bottled by", "back"),
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
      measuredTypeSizeMm: 2.2,
      containerVolumeMl: 750,
    },
    sameFieldOfVision: { brandClassAlcohol: true },
    overallConfidence: 0.97,
    imageQuality: "good",
    ...overrides,
  };
}

const bourbonApplication: ApplicationData = {
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

export const demoScenarios: Record<
  Exclude<DemoScenarioId, "batch-250">,
  DemoScenario
> = {
  "compliant-bourbon": {
    id: "compliant-bourbon",
    title: "Compliant bourbon",
    artworkPath: "/demo/old-tom-bourbon.png",
    warningTypeSizeMm: 2.1,
    application: bourbonApplication,
    observation: baseObservation(),
  },
  "stones-throw": {
    id: "stones-throw",
    title: "Formatting, not a mismatch",
    artworkPath: "/demo/stones-throw.png",
    warningTypeSizeMm: 2.1,
    application: { ...bourbonApplication, brandName: "Stone's Throw" },
    observation: baseObservation({ brandName: text("STONE’S THROW") }),
  },
  "warning-format": {
    id: "warning-format",
    title: "Warning statement issue",
    artworkPath: "/demo/warning-error.png",
    warningTypeSizeMm: 2.1,
    application: {
      profile: "faa_wine",
      beverageFamily: "wine",
      brandName: "Bellweather Cellars",
      classType: "Red Wine",
      alcoholByVolume: 13.5,
      netContents: { value: 750, unit: "mL" },
      responsibleParty: {
        name: "Bellweather Cellars",
        address: "Napa, California",
        role: "Produced and Bottled by",
      },
    },
    observation: baseObservation({
      brandName: text("Bellweather Cellars"),
      classType: text("Red Wine"),
      alcoholByVolume: abv(13.5),
      proof: undefined,
      responsibleName: text("Bellweather Cellars", "back"),
      responsibleAddress: text("Napa, California", "back"),
      responsibleRole: text("Produced and Bottled by", "back"),
      healthWarning: {
        text: GOVERNMENT_HEALTH_WARNING.replace(
          "GOVERNMENT WARNING:",
          "Government Warning:",
        ),
        confidence: 0.99,
        panel: "back",
        headingAllCaps: false,
        headingBold: false,
        continuous: true,
        separateFromOtherInformation: true,
        legible: true,
        contrastingBackground: true,
        measuredTypeSizeMm: 2.1,
        containerVolumeMl: 750,
      },
      overallConfidence: 0.98,
    }),
  },
  "imported-wine": {
    id: "imported-wine",
    title: "Imported origin discrepancy",
    artworkPath: "/demo/imported-wine.png",
    warningTypeSizeMm: 2.1,
    application: {
      profile: "faa_wine",
      beverageFamily: "wine",
      brandName: "Maison Rivage",
      classType: "Red Wine",
      alcoholByVolume: 13,
      netContents: { value: 750, unit: "mL" },
      responsibleParty: {
        name: "Atlantic Selections LLC",
        address: "New York, New York",
        role: "Imported by",
      },
      countryOfOrigin: "France",
      declarations: { imported: true },
    },
    observation: baseObservation({
      brandName: text("Maison Rivage"),
      classType: text("Red Wine"),
      alcoholByVolume: abv(13),
      proof: undefined,
      responsibleName: text("Atlantic Selections LLC", "back"),
      responsibleAddress: text("New York, New York", "back"),
      responsibleRole: text("Imported by", "back"),
      countryOfOrigin: text("Product of Spain", "back"),
      overallConfidence: 0.96,
    }),
  },
  "malt-conditional": {
    id: "malt-conditional",
    title: "Conditional malt beverage",
    artworkPath: "/demo/harbor-lager.png",
    warningTypeSizeMm: 2.1,
    application: {
      profile: "faa_malt_beverage",
      beverageFamily: "malt_beverage",
      brandName: "Harbor Light",
      classType: "Lager",
      alcoholByVolume: 4.8,
      netContents: { value: 12, unit: "fl_oz" },
      responsibleParty: {
        name: "Harbor Brewing Company",
        address: "Portland, Maine",
        role: "Brewed and Canned by",
      },
      declarations: { alcoholContentRequired: false },
    },
    observation: baseObservation({
      brandName: text("Harbor Light"),
      classType: text("Lager"),
      alcoholByVolume: undefined,
      proof: undefined,
      netContents: {
        value: { value: 12, unit: "fl_oz" },
        panel: "front",
        confidence: 0.99,
        rawText: "12 FL. OZ.",
      },
      responsibleName: text("Harbor Brewing Company", "back"),
      responsibleAddress: text("Portland, Maine", "back"),
      responsibleRole: text("Brewed and Canned by", "back"),
      overallConfidence: 0.94,
    }),
  },
  "low-quality": {
    id: "low-quality",
    title: "Low-quality photograph",
    artworkPath: "/demo/glare-label.png",
    application: bourbonApplication,
    observation: baseObservation({
      brandName: text("OLD TOM DISTILLERY", "front", 0.72),
      classType: {
        value: null,
        panel: "front",
        confidence: 0.2,
        rawText: "[obscured by glare]",
      },
      alcoholByVolume: undefined,
      healthWarning: {
        text: null,
        confidence: 0.18,
        panel: "back",
        legible: false,
      },
      overallConfidence: 0.42,
      imageQuality: "poor",
    }),
  },
};

export function getDemoScenario(id: string): DemoScenario | undefined {
  if (id === "batch-250") return undefined;
  return demoScenarios[id as keyof typeof demoScenarios];
}

export function benchmarkScenarios(count = 250): DemoScenario[] {
  const values = Object.values(demoScenarios);
  return Array.from(
    { length: count },
    (_, index) => values[index % values.length],
  );
}
