import { z } from "zod";

import {
  labelPanels,
  type ApplicationData,
  type ConditionalStatementKey,
  type FieldEvidence,
  type LabelObservation,
  type NetContents,
} from "./types";

export const FAST_PATH_CONFIDENCE = 0.9;

const volumeFactors: Record<NetContents["unit"], number> = {
  mL: 1,
  L: 1000,
  fl_oz: 29.5735295625,
  pt: 473.176473,
  qt: 946.352946,
  gal: 3785.411784,
};

function volumeInMl(volume: NetContents): number {
  return volume.value * volumeFactors[volume.unit];
}

export const wireTextFieldKeys = [
  "bn",
  "ct",
  "rn",
  "ra",
  "rr",
  "co",
  "ap",
  "ag",
  "sd",
] as const;

export const wireNumberFieldKeys = ["av", "pf", "fw"] as const;
export const wireConditionalFieldKeys = [
  "su",
  "y5",
  "cc",
  "as",
  "ns",
  "wc",
  "cm",
] as const;

export type WireTextFieldKey = (typeof wireTextFieldKeys)[number];
export type WireNumberFieldKey = (typeof wireNumberFieldKeys)[number];
export type WireConditionalFieldKey = (typeof wireConditionalFieldKeys)[number];
export type WirePrimaryFieldKey = WireTextFieldKey | WireNumberFieldKey | "nc";

const confidenceSchema = z.number().min(0).max(1);
const panelSchema = z.enum(labelPanels).nullable();
const evidenceShape = {
  c: confidenceSchema,
  p: panelSchema,
  r: z.string().nullable(),
};

const textFieldSchema = z.object({
  k: z.enum(wireTextFieldKeys),
  v: z.string().nullable(),
  ...evidenceShape,
});

const numberFieldSchema = z.object({
  k: z.enum(wireNumberFieldKeys),
  v: z.number().nullable(),
  ...evidenceShape,
});

const volumeFieldSchema = z.object({
  k: z.literal("nc"),
  v: z
    .object({
      a: z.number().positive(),
      u: z.enum(["mL", "L", "fl_oz", "pt", "qt", "gal"]),
    })
    .nullable(),
  ...evidenceShape,
});

const conditionalFieldSchema = z.object({
  k: z.enum(wireConditionalFieldKeys),
  v: z.string().nullable(),
  ...evidenceShape,
});

const wireObjectSchema = z.object({
  raw: z.string(),
  f: z.array(z.union([textFieldSchema, numberFieldSchema, volumeFieldSchema])),
  d: z.array(conditionalFieldSchema),
  w: z.object({
    t: z.string().nullable(),
    c: confidenceSchema,
    p: panelSchema,
    uc: z.boolean().nullable(),
    bd: z.boolean().nullable(),
    ct: z.boolean().nullable(),
    sp: z.boolean().nullable(),
    lg: z.boolean().nullable(),
    bg: z.boolean().nullable(),
    mm: z.number().positive().nullable(),
    ml: z.number().positive().nullable(),
  }),
  sf: z.boolean().nullable(),
  q: confidenceSchema,
  iq: z.enum(["good", "fair", "poor", "unreadable"]),
  notes: z.array(z.string()),
});

type WireObject = z.infer<typeof wireObjectSchema>;

function rejectDuplicateKeys(value: WireObject, context: z.RefinementCtx) {
  const primaryKeys = value.f.map((field) => field.k);
  const declarationKeys = value.d.map((field) => field.k);
  for (const keys of [primaryKeys as string[], declarationKeys as string[]]) {
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) {
      context.addIssue({
        code: "custom",
        message: `Duplicate wire field key: ${duplicate}`,
      });
    }
  }
}

export const labelExtractionWireSchema =
  wireObjectSchema.superRefine(rejectDuplicateKeys);

export type LabelExtractionWire = z.infer<typeof labelExtractionWireSchema>;

const primaryKeyToObservation = {
  bn: "brandName",
  ct: "classType",
  av: "alcoholByVolume",
  pf: "proof",
  nc: "netContents",
  rn: "responsibleName",
  ra: "responsibleAddress",
  rr: "responsibleRole",
  co: "countryOfOrigin",
  ap: "appellation",
  fw: "foreignWinePercentage",
  ag: "ageStatement",
  sd: "stateOfDistillation",
} as const;

const conditionalKeyToObservation: Record<
  WireConditionalFieldKey,
  ConditionalStatementKey
> = {
  su: "sulfites",
  y5: "yellow5",
  cc: "carmine_or_cochineal",
  as: "aspartame",
  ns: "neutral_spirits",
  wc: "wood_treatment_or_coloring",
  cm: "composition",
};

function toEvidence(field: {
  v: unknown | null;
  c: number;
  p: (typeof labelPanels)[number] | null;
  r: string | null;
}): FieldEvidence<unknown> | undefined {
  if (field.v === null) return undefined;
  return {
    value: field.v,
    confidence: field.c,
    ...(field.p === null ? {} : { panel: field.p }),
    ...(field.r === null ? {} : { rawText: field.r }),
  };
}

export function wireToLabelObservation(
  wire: LabelExtractionWire,
): LabelObservation {
  const observation: LabelObservation = {
    overallConfidence: wire.q,
    imageQuality: wire.iq,
    healthWarning: {
      text: wire.w.t,
      confidence: wire.w.c,
      ...(wire.w.p === null ? {} : { panel: wire.w.p }),
      ...(wire.w.uc === null ? {} : { headingAllCaps: wire.w.uc }),
      ...(wire.w.bd === null ? {} : { headingBold: wire.w.bd }),
      ...(wire.w.ct === null ? {} : { continuous: wire.w.ct }),
      ...(wire.w.sp === null
        ? {}
        : { separateFromOtherInformation: wire.w.sp }),
      ...(wire.w.lg === null ? {} : { legible: wire.w.lg }),
      ...(wire.w.bg === null ? {} : { contrastingBackground: wire.w.bg }),
      ...(wire.w.mm === null ? {} : { measuredTypeSizeMm: wire.w.mm }),
      ...(wire.w.ml === null ? {} : { containerVolumeMl: wire.w.ml }),
    },
    sameFieldOfVision: wire.sf === null ? {} : { brandClassAlcohol: wire.sf },
  };

  for (const field of wire.f) {
    const evidence =
      field.k === "nc"
        ? toEvidence(
            field.v === null
              ? { ...field, v: null }
              : {
                  ...field,
                  v: {
                    value: field.v.a,
                    unit: field.v.u,
                  } satisfies NetContents,
                },
          )
        : toEvidence(field);
    if (evidence !== undefined) {
      Object.assign(observation, {
        [primaryKeyToObservation[field.k]]: evidence,
      });
    }
  }

  const statements: NonNullable<LabelObservation["conditionalStatements"]> = {};
  for (const field of wire.d) {
    const evidence = toEvidence(field);
    if (evidence !== undefined) {
      statements[conditionalKeyToObservation[field.k]] =
        evidence as FieldEvidence<string>;
    }
  }
  if (Object.keys(statements).length > 0) {
    observation.conditionalStatements = statements;
  }

  return observation;
}

function applicablePrimaryKeys(
  application: ApplicationData,
): Set<WirePrimaryFieldKey> {
  const declarations = application.declarations ?? {};
  const keys = new Set<WirePrimaryFieldKey>([
    "bn",
    "ct",
    "nc",
    "rn",
    "ra",
    "rr",
  ]);

  if (
    application.profile === "faa_distilled_spirits" ||
    declarations.alcoholContentRequired !== false
  ) {
    keys.add("av");
  }
  if (application.proof !== undefined) keys.add("pf");
  if (declarations.imported) keys.add("co");
  if (application.profile === "faa_wine") {
    if (declarations.appellationRequired) keys.add("ap");
    if (declarations.foreignWinePercentageRequired) keys.add("fw");
  }
  if (application.profile === "faa_distilled_spirits") {
    if (declarations.ageStatementRequired) keys.add("ag");
    if (declarations.stateOfDistillationRequired) keys.add("sd");
  }
  return keys;
}

function applicableConditionalKeys(
  application: ApplicationData,
): Set<WireConditionalFieldKey> {
  const declarations = application.declarations ?? {};
  const keys = new Set<WireConditionalFieldKey>();
  if (declarations.containsSulfites) keys.add("su");
  if (declarations.containsYellow5) keys.add("y5");
  if (declarations.containsCarmineOrCochineal) keys.add("cc");
  if (declarations.containsAspartame) keys.add("as");
  if (application.profile === "faa_distilled_spirits") {
    if (declarations.containsNeutralSpirits) keys.add("ns");
    if (declarations.woodTreatmentOrColoringDisclosureRequired) keys.add("wc");
  }
  if (
    (application.profile === "faa_wine" ||
      application.profile === "faa_malt_beverage") &&
    declarations.compositionStatementRequired
  ) {
    keys.add("cm");
  }
  return keys;
}

export function createLabelExtractionWireSchema(application: ApplicationData) {
  const primaryKeys = applicablePrimaryKeys(application);
  const declarationKeys = applicableConditionalKeys(application);
  const allowedTextKeys = wireTextFieldKeys.filter((key) =>
    primaryKeys.has(key),
  );
  const allowedNumberKeys = wireNumberFieldKeys.filter((key) =>
    primaryKeys.has(key),
  );
  const contextualTextFieldSchema = textFieldSchema.extend({
    k: z.enum(allowedTextKeys as [WireTextFieldKey, ...WireTextFieldKey[]]),
  });
  const contextualPrimaryFieldSchema =
    allowedNumberKeys.length === 0
      ? z.union([contextualTextFieldSchema, volumeFieldSchema])
      : z.union([
          contextualTextFieldSchema,
          numberFieldSchema.extend({
            k: z.enum(
              allowedNumberKeys as [
                WireNumberFieldKey,
                ...WireNumberFieldKey[],
              ],
            ),
          }),
          volumeFieldSchema,
        ]);
  const contextualDeclarationsSchema =
    declarationKeys.size === 0
      ? z.array(conditionalFieldSchema).max(0)
      : z
          .array(
            conditionalFieldSchema.extend({
              k: z.enum([...declarationKeys] as [
                WireConditionalFieldKey,
                ...WireConditionalFieldKey[],
              ]),
            }),
          )
          .length(declarationKeys.size);

  return wireObjectSchema
    .extend({
      f: z.array(contextualPrimaryFieldSchema).length(primaryKeys.size),
      d: contextualDeclarationsSchema,
    })
    .superRefine(rejectDuplicateKeys) as z.ZodType<LabelExtractionWire>;
}

function completeEvidence(
  evidence: FieldEvidence<unknown> | undefined,
): boolean {
  return Boolean(
    evidence &&
    evidence.value !== null &&
    evidence.confidence >= FAST_PATH_CONFIDENCE &&
    evidence.panel &&
    evidence.rawText?.trim(),
  );
}

function hasCompleteWarning(observation: LabelObservation): boolean {
  const warning = observation.healthWarning;
  return Boolean(
    warning &&
    warning.text?.trim() &&
    warning.confidence >= FAST_PATH_CONFIDENCE &&
    warning.panel &&
    typeof warning.headingAllCaps === "boolean" &&
    typeof warning.headingBold === "boolean" &&
    typeof warning.continuous === "boolean" &&
    typeof warning.separateFromOtherInformation === "boolean" &&
    typeof warning.legible === "boolean" &&
    typeof warning.contrastingBackground === "boolean" &&
    warning.measuredTypeSizeMm !== undefined &&
    warning.measuredTypeSizeMm > 0 &&
    warning.containerVolumeMl !== undefined &&
    warning.containerVolumeMl > 0,
  );
}

export function isObservationFastPathComplete(
  application: ApplicationData,
  observation: LabelObservation,
): boolean {
  if (
    application.profile === "classification_review" ||
    application.profile === "irc_wine_under_7" ||
    application.profile === "irc_beer_non_faa"
  ) {
    return false;
  }
  if (
    observation.overallConfidence < FAST_PATH_CONFIDENCE ||
    observation.imageQuality !== "good" ||
    !hasCompleteWarning(observation)
  ) {
    return false;
  }

  const requiredEvidence = [
    observation.brandName,
    observation.classType,
    observation.netContents,
    observation.responsibleName,
    observation.responsibleAddress,
    observation.responsibleRole,
  ] as Array<FieldEvidence<unknown> | undefined>;
  if (
    requiredEvidence.length !== 6 ||
    !requiredEvidence.every(completeEvidence)
  ) {
    return false;
  }

  const declarations = application.declarations ?? {};
  const alcoholRequired =
    application.profile === "faa_distilled_spirits" ||
    declarations.alcoholContentRequired !== false;
  if (alcoholRequired && !completeEvidence(observation.alcoholByVolume)) {
    return false;
  }
  if (application.proof !== undefined && !completeEvidence(observation.proof)) {
    return false;
  }
  if (
    application.profile === "faa_distilled_spirits" &&
    typeof observation.sameFieldOfVision?.brandClassAlcohol !== "boolean"
  ) {
    return false;
  }

  const optionalPrimaryEvidence: Partial<
    Record<WirePrimaryFieldKey, FieldEvidence<unknown> | undefined>
  > = {
    co: observation.countryOfOrigin,
    ap: observation.appellation,
    fw: observation.foreignWinePercentage,
    ag: observation.ageStatement,
    sd: observation.stateOfDistillation,
  };
  for (const key of applicablePrimaryKeys(application)) {
    if (
      key !== "bn" &&
      key !== "ct" &&
      key !== "nc" &&
      key !== "rn" &&
      key !== "ra" &&
      key !== "rr" &&
      key !== "av" &&
      key !== "pf" &&
      !completeEvidence(optionalPrimaryEvidence[key])
    ) {
      return false;
    }
  }

  const conditionalEvidenceKey: Record<
    WireConditionalFieldKey,
    ConditionalStatementKey
  > = {
    su: "sulfites",
    y5: "yellow5",
    cc: "carmine_or_cochineal",
    as: "aspartame",
    ns: "neutral_spirits",
    wc: "wood_treatment_or_coloring",
    cm: "composition",
  };
  for (const key of applicableConditionalKeys(application)) {
    if (
      !completeEvidence(
        observation.conditionalStatements?.[conditionalEvidenceKey[key]],
      )
    ) {
      return false;
    }
  }

  const warningVolume = observation.healthWarning?.containerVolumeMl;
  const applicationVolume = volumeInMl(application.netContents);
  if (
    warningVolume === undefined ||
    Math.abs(warningVolume - applicationVolume) >
      Math.max(0.5, applicationVolume * 0.001)
  ) {
    return false;
  }

  const observedAbv = observation.alcoholByVolume?.value;
  const observedProof = observation.proof?.value;
  if (
    observedAbv !== null &&
    observedAbv !== undefined &&
    observedProof !== null &&
    observedProof !== undefined &&
    Math.abs(observedProof - observedAbv * 2) > 0.1
  ) {
    return false;
  }

  return true;
}

export function isWireExtractionFastPathComplete(
  application: ApplicationData,
  input: unknown,
): input is LabelExtractionWire {
  const parsed = createLabelExtractionWireSchema(application).safeParse(input);
  return (
    parsed.success &&
    isObservationFastPathComplete(
      application,
      wireToLabelObservation(parsed.data),
    )
  );
}
