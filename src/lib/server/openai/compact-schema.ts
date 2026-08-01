import { z } from "zod";

import {
  labelPanels,
  type ApplicationData,
  type ConditionalStatementKey,
  type FieldEvidence,
  type LabelObservation,
  type NetContents,
} from "@/lib/domain";

const confidence = z.number().min(0).max(1);
const panel = z.enum(labelPanels).nullable();
const textEvidence = z.object({
  v: z.string().nullable(),
  c: confidence,
  p: panel,
});
const numberEvidence = z.object({
  v: z.number().nullable(),
  c: confidence,
  p: panel,
  r: z
    .string()
    .nullable()
    .describe("Exact visible wording containing the number"),
});
const volumeEvidence = z.object({
  v: z
    .object({
      a: z.number().positive(),
      u: z.enum(["mL", "L", "fl_oz", "pt", "qt", "gal"]),
    })
    .nullable(),
  c: confidence,
  p: panel,
  r: z.string().nullable().describe("Exact visible net-contents wording"),
});

const warning = z.object({
  t: z
    .string()
    .nullable()
    .describe("Complete government warning transcription"),
  c: confidence.describe("Warning transcription confidence"),
  p: panel.describe("Panel containing the warning"),
  uc: z.boolean().nullable().describe("GOVERNMENT WARNING heading is all caps"),
  bd: z.boolean().nullable().describe("Warning heading is visibly bold"),
  ct: z.boolean().nullable().describe("Warning is one continuous statement"),
  sp: z
    .boolean()
    .nullable()
    .describe("Warning is separate from unrelated information"),
  lg: z.boolean().nullable().describe("Warning is readily legible"),
  bg: z.boolean().nullable().describe("Warning contrasts with its background"),
  mm: z
    .number()
    .positive()
    .nullable()
    .describe("Measured type size in mm only with supplied scale"),
  ml: z
    .number()
    .positive()
    .nullable()
    .describe("Container volume in mL only when visibly stated"),
});

type CompactEvidence<T> = {
  c: number;
  p: (typeof labelPanels)[number] | null;
  r?: string | null;
  v: T | null;
};

export type CompactLabelExtraction = {
  ag?: CompactEvidence<string>;
  ap?: CompactEvidence<string>;
  as?: CompactEvidence<string>;
  av?: CompactEvidence<number>;
  bn: CompactEvidence<string>;
  cc?: CompactEvidence<string>;
  cm?: CompactEvidence<string>;
  co?: CompactEvidence<string>;
  ct: CompactEvidence<string>;
  fw?: CompactEvidence<number>;
  iq: "good" | "fair" | "poor" | "unreadable";
  nc: CompactEvidence<{ a: number; u: NetContents["unit"] }>;
  ns?: CompactEvidence<string>;
  pf?: CompactEvidence<number>;
  q: number;
  ra: CompactEvidence<string>;
  rn: CompactEvidence<string>;
  rr: CompactEvidence<string>;
  sd?: CompactEvidence<string>;
  sf: boolean | null;
  su?: CompactEvidence<string>;
  w: z.infer<typeof warning>;
  wc?: CompactEvidence<string>;
  y5?: CompactEvidence<string>;
};

export function createCompactLabelExtractionSchema(
  application: ApplicationData,
) {
  const declarations = application.declarations ?? {};
  const shape: Record<string, z.ZodType> = {
    bn: textEvidence.describe("Complete prominent brand name or lockup"),
    ct: textEvidence.describe("Alcohol beverage class/type designation only"),
    nc: volumeEvidence.describe("Declared net contents"),
    rn: textEvidence.describe(
      "Responsible producer/bottler/importer company name only",
    ),
    ra: textEvidence.describe(
      "Responsible-party street or city/state address only",
    ),
    rr: textEvidence.describe(
      "Responsible-party role phrase such as Distilled and Bottled by",
    ),
  };
  if (
    application.profile === "faa_distilled_spirits" ||
    declarations.alcoholContentRequired !== false
  ) {
    shape.av = numberEvidence.describe(
      "Alcohol by volume percentage, not proof",
    );
  }
  if (application.proof !== undefined)
    shape.pf = numberEvidence.describe("Proof number, not ABV percentage");
  if (declarations.imported)
    shape.co = textEvidence.describe("Country-of-origin statement");
  if (application.profile === "faa_wine") {
    if (declarations.appellationRequired)
      shape.ap = textEvidence.describe("Wine appellation of origin");
    if (declarations.foreignWinePercentageRequired) shape.fw = numberEvidence;
  }
  if (application.profile === "faa_distilled_spirits") {
    if (declarations.ageStatementRequired)
      shape.ag = textEvidence.describe("Spirits age statement");
    if (declarations.stateOfDistillationRequired)
      shape.sd = textEvidence.describe("State of distillation statement");
    if (declarations.containsNeutralSpirits) shape.ns = textEvidence;
    if (declarations.woodTreatmentOrColoringDisclosureRequired)
      shape.wc = textEvidence;
  }
  if (declarations.containsSulfites) shape.su = textEvidence;
  if (declarations.containsYellow5) shape.y5 = textEvidence;
  if (declarations.containsCarmineOrCochineal) shape.cc = textEvidence;
  if (declarations.containsAspartame) shape.as = textEvidence;
  if (
    (application.profile === "faa_wine" ||
      application.profile === "faa_malt_beverage") &&
    declarations.compositionStatementRequired
  ) {
    shape.cm = textEvidence;
  }
  return z.object({
    ...shape,
    w: warning,
    sf: z.boolean().nullable(),
    q: confidence,
    iq: z.enum(["good", "fair", "poor", "unreadable"]),
  }) as unknown as z.ZodType<CompactLabelExtraction>;
}

function field<T>(input: CompactEvidence<T> | undefined) {
  if (!input || input.v === null) return undefined;
  return {
    value: input.v,
    confidence: input.c,
    ...(input.p ? { panel: input.p } : {}),
    rawText:
      input.r ??
      (typeof input.v === "object" ? JSON.stringify(input.v) : String(input.v)),
  } satisfies FieldEvidence<T>;
}

const conditionalMap = {
  su: "sulfites",
  y5: "yellow5",
  cc: "carmine_or_cochineal",
  as: "aspartame",
  ns: "neutral_spirits",
  wc: "wood_treatment_or_coloring",
  cm: "composition",
} as const satisfies Record<string, ConditionalStatementKey>;

export function compactExtractionToObservation(
  compact: CompactLabelExtraction,
): LabelObservation {
  const statements: NonNullable<LabelObservation["conditionalStatements"]> = {};
  for (const [wireKey, observationKey] of Object.entries(conditionalMap)) {
    const evidence = field(
      compact[wireKey as keyof CompactLabelExtraction] as
        CompactEvidence<string> | undefined,
    );
    if (evidence) statements[observationKey] = evidence;
  }
  return {
    brandName: field(compact.bn),
    classType: field(compact.ct),
    alcoholByVolume: field(compact.av),
    proof: field(compact.pf),
    netContents: field(
      compact.nc.v === null
        ? undefined
        : {
            ...compact.nc,
            v: { value: compact.nc.v.a, unit: compact.nc.v.u },
          },
    ),
    responsibleName: field(compact.rn),
    responsibleAddress: field(compact.ra),
    responsibleRole: field(compact.rr),
    countryOfOrigin: field(compact.co),
    appellation: field(compact.ap),
    foreignWinePercentage: field(compact.fw),
    ageStatement: field(compact.ag),
    stateOfDistillation: field(compact.sd),
    ...(Object.keys(statements).length
      ? { conditionalStatements: statements }
      : {}),
    healthWarning: {
      text: compact.w.t,
      confidence: compact.w.c,
      ...(compact.w.p ? { panel: compact.w.p } : {}),
      ...(compact.w.t
        ? {
            // Capitalization is textual evidence, not a subjective visual
            // judgment. Deriving it from the exact transcription prevents a
            // model from calling title case uppercase (or vice versa).
            headingAllCaps: compact.w.t
              .trimStart()
              .startsWith("GOVERNMENT WARNING:"),
          }
        : compact.w.uc === null
          ? {}
          : { headingAllCaps: compact.w.uc }),
      // Subjective visual presentation remains unassessed on the compact
      // transcription path. Trusted fixtures or the thorough fallback may add
      // that evidence; a fast result can therefore never falsely pass it.
      ...(compact.w.mm === null ? {} : { measuredTypeSizeMm: compact.w.mm }),
      ...(compact.w.ml === null ? {} : { containerVolumeMl: compact.w.ml }),
    },
    sameFieldOfVision:
      compact.sf === null ? {} : { brandClassAlcohol: compact.sf },
    overallConfidence: compact.q,
    imageQuality: compact.iq,
  };
}
