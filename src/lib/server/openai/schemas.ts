import { z } from "zod";

import { labelPanels, regulatoryProfiles } from "@/lib/domain";

const panelSchema = z.enum(labelPanels);
const nullableTextEvidence = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  panel: panelSchema.nullable(),
  rawText: z.string().nullable(),
});
const nullableNumberEvidence = z.object({
  value: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  panel: panelSchema.nullable(),
  rawText: z.string().nullable(),
});

export const labelExtractionSchema = z.object({
  rawText: z.string(),
  brandName: nullableTextEvidence,
  classType: nullableTextEvidence,
  alcoholByVolume: nullableNumberEvidence,
  proof: nullableNumberEvidence,
  netContents: z.object({
    value: z
      .object({
        value: z.number().positive(),
        unit: z.enum(["mL", "L", "fl_oz", "pt", "qt", "gal"]),
      })
      .nullable(),
    confidence: z.number().min(0).max(1),
    panel: panelSchema.nullable(),
    rawText: z.string().nullable(),
  }),
  responsibleName: nullableTextEvidence,
  responsibleAddress: nullableTextEvidence,
  responsibleRole: nullableTextEvidence,
  countryOfOrigin: nullableTextEvidence,
  appellation: nullableTextEvidence,
  ageStatement: nullableTextEvidence,
  stateOfDistillation: nullableTextEvidence,
  conditionalStatements: z.object({
    sulfites: nullableTextEvidence,
    yellow5: nullableTextEvidence,
    carmine_or_cochineal: nullableTextEvidence,
    aspartame: nullableTextEvidence,
    neutral_spirits: nullableTextEvidence,
    wood_treatment_or_coloring: nullableTextEvidence,
    composition: nullableTextEvidence,
  }),
  healthWarning: z.object({
    text: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    panel: panelSchema.nullable(),
    headingAllCaps: z.boolean().nullable(),
    headingBold: z.boolean().nullable(),
    continuous: z.boolean().nullable(),
    separateFromOtherInformation: z.boolean().nullable(),
    legible: z.boolean().nullable(),
    contrastingBackground: z.boolean().nullable(),
    measuredTypeSizeMm: z.number().positive().nullable(),
  }),
  sameFieldOfVision: z.object({ brandClassAlcohol: z.boolean().nullable() }),
  overallConfidence: z.number().min(0).max(1),
  imageQuality: z.enum(["good", "fair", "poor", "unreadable"]),
  qualityNotes: z.array(z.string()),
});

export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

export const applicationExtractionSchema = z.object({
  regulatoryProfile: z.enum(regulatoryProfiles).nullable(),
  beverageFamily: z
    .enum(["distilled_spirits", "wine", "malt_beverage", "other_fermented"])
    .nullable(),
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholByVolume: z.number().nullable(),
  proof: z.number().nullable(),
  netContentsValue: z.number().nullable(),
  netContentsUnit: z.enum(["mL", "L", "fl_oz", "pt", "qt", "gal"]).nullable(),
  responsibleName: z.string().nullable(),
  responsibleAddress: z.string().nullable(),
  responsibleRole: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  appellation: z.string().nullable(),
  ageStatement: z.string().nullable(),
  stateOfDistillation: z.string().nullable(),
  compositionStatement: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type ApplicationExtraction = z.infer<typeof applicationExtractionSchema>;
