import { z } from "zod";

import {
  labelPanels,
  regulatoryProfiles,
  type ApplicationData,
  type LabelPanel,
  type NetContents,
  type RegulatoryProfile,
} from "@/lib/domain";

export const acceptedArtworkTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const acceptedApplicationTypes = [
  ...acceptedArtworkTypes,
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_FILES = 600;
export const MAX_BATCH_BYTES = 300 * 1024 * 1024;
export const MAX_BATCH_APPLICATIONS = 300;

const manualFieldsSchema = z.object({
  brandName: z.string().trim().min(1).max(200),
  classType: z.string().trim().min(1).max(300),
  abv: z.string().trim().max(30).default(""),
  proof: z.string().trim().max(30).default(""),
  netContents: z.string().trim().min(1).max(50),
  producerName: z.string().trim().min(1).max(300),
  producerAddress: z.string().trim().min(1).max(500),
  responsibleRole: z.string().trim().max(100).default(""),
  countryOfOrigin: z.string().trim().max(100).default(""),
  appellation: z.string().trim().max(200).default(""),
  foreignWinePercentage: z.string().trim().max(20).default(""),
  ageStatement: z.string().trim().max(200).default(""),
  stateOfDistillation: z.string().trim().max(100).default(""),
  compositionStatement: z.string().trim().max(500).default(""),
  neutralSpiritsCommodity: z.string().trim().max(100).default(""),
  neutralSpiritsPercentage: z.string().trim().max(20).default(""),
  profile: z.enum(regulatoryProfiles),
  imported: z.boolean().default(false),
  alcoholContentRequired: z.boolean().default(true),
  compositionStatementRequired: z.boolean().default(false),
  appellationRequired: z.boolean().default(false),
  foreignWinePercentageRequired: z.boolean().default(false),
  ageStatementRequired: z.boolean().default(false),
  stateOfDistillationRequired: z.boolean().default(false),
  containsSulfites: z.boolean().default(false),
  containsYellow5: z.boolean().default(false),
  containsCarmineOrCochineal: z.boolean().default(false),
  containsAspartame: z.boolean().default(false),
  containsNeutralSpirits: z.boolean().default(false),
  woodTreatmentOrColoringDisclosureRequired: z.boolean().default(false),
});

export const createBatchSchema = z.object({
  mode: z.enum(["single", "batch"]),
  name: z.string().trim().min(1).max(200),
  application: z
    .object({
      regulatoryProfile: z.enum(regulatoryProfiles),
      beverageProfile: z.string().optional(),
      originType: z.enum(["domestic", "imported", "unknown"]),
      fields: manualFieldsSchema,
    })
    .optional(),
  manifest: z
    .object({
      name: z.string().trim().min(1).max(255),
      text: z.string().min(1).max(2_000_000),
    })
    .optional(),
});

export const signUploadsSchema = z.object({
  batchId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  purpose: z.enum(["label_artwork", "application_document"]),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().positive().max(MAX_FILE_BYTES),
        type: z.string().trim().max(150),
        panelType: z.enum(labelPanels).optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH_FILES),
});

export const completeUploadsSchema = z.object({
  batchId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  purpose: z.enum(["label_artwork", "application_document"]),
  uploads: z
    .array(
      z.object({
        id: z.string().uuid(),
        path: z.string().min(1).max(1000),
        token: z.string().optional(),
        name: z.string().trim().min(1).max(255),
        size: z.number().int().positive().max(MAX_FILE_BYTES),
        type: z.string().trim().max(150),
        panelType: z.enum(labelPanels).optional(),
        applicationId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH_FILES),
});

export const demoRequestSchema = z.object({
  scenario: z.string().optional(),
  scenarioId: z.string().optional(),
});

export const reviewRequestSchema = z.object({
  decision: z.enum([
    "confirmed_clear",
    "accepted_with_override",
    "return_for_correction",
  ]),
  notes: z.string().trim().max(2_000).optional(),
  overrides: z.record(z.string(), z.unknown()).default({}),
  reviewVersion: z.number().int().nonnegative(),
});

export const confirmApplicationSchema = z.object({
  fields: manualFieldsSchema,
  expectedUpdatedAt: z.string().datetime().optional(),
  confirm: z.literal(true),
});

export function parseAbv(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(
    value.replace(/%|alc\.?\/?vol\.?/gi, "").trim(),
  );
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("INVALID_ABV");
  }
  return parsed;
}

export function parseNetContents(input: string): NetContents {
  const match = input
    .trim()
    .replace(/fluid\s+ounces?/i, "fl oz")
    .match(/^(\d+(?:\.\d+)?)\s*(ml|l|fl\.?\s*oz\.?|pt|qt|gal)$/i);
  if (!match) throw new Error("INVALID_NET_CONTENTS");
  const unitMap: Record<string, NetContents["unit"]> = {
    ml: "mL",
    l: "L",
    floz: "fl_oz",
    pt: "pt",
    qt: "qt",
    gal: "gal",
  };
  const key = match[2].toLowerCase().replace(/[.\s]/g, "");
  return { value: Number(match[1]), unit: unitMap[key] };
}

export function manualApplicationData(
  input: z.input<typeof manualFieldsSchema>,
): ApplicationData {
  const fields = manualFieldsSchema.parse(input);
  const familyByProfile: Record<
    RegulatoryProfile,
    ApplicationData["beverageFamily"]
  > = {
    faa_distilled_spirits: "distilled_spirits",
    faa_wine: "wine",
    faa_malt_beverage: "malt_beverage",
    irc_wine_under_7: "wine",
    irc_beer_non_faa: "malt_beverage",
    classification_review: "other_fermented",
  };
  return {
    profile: fields.profile,
    beverageFamily: familyByProfile[fields.profile],
    brandName: fields.brandName,
    classType: fields.classType,
    ...(parseAbv(fields.abv) === undefined
      ? {}
      : { alcoholByVolume: parseAbv(fields.abv) }),
    ...(!fields.proof.trim()
      ? {}
      : { proof: parseOptionalPercentage(fields.proof) }),
    netContents: parseNetContents(fields.netContents),
    responsibleParty: {
      name: fields.producerName,
      address: fields.producerAddress,
      ...(fields.responsibleRole ? { role: fields.responsibleRole } : {}),
    },
    ...(fields.countryOfOrigin
      ? { countryOfOrigin: fields.countryOfOrigin }
      : {}),
    ...(fields.appellation ? { appellation: fields.appellation } : {}),
    ...(!fields.foreignWinePercentage.trim()
      ? {}
      : {
          foreignWinePercentage: parseOptionalPercentage(
            fields.foreignWinePercentage,
          ),
        }),
    ...(fields.ageStatement ? { ageStatement: fields.ageStatement } : {}),
    ...(fields.stateOfDistillation
      ? { stateOfDistillation: fields.stateOfDistillation }
      : {}),
    ...(fields.compositionStatement
      ? { compositionStatement: fields.compositionStatement }
      : {}),
    declarations: {
      imported: fields.imported,
      alcoholContentRequired: fields.alcoholContentRequired,
      compositionStatementRequired: fields.compositionStatementRequired,
      appellationRequired: fields.appellationRequired,
      foreignWinePercentageRequired: fields.foreignWinePercentageRequired,
      ageStatementRequired: fields.ageStatementRequired,
      stateOfDistillationRequired: fields.stateOfDistillationRequired,
      containsSulfites: fields.containsSulfites,
      containsYellow5: fields.containsYellow5,
      containsCarmineOrCochineal: fields.containsCarmineOrCochineal,
      containsAspartame: fields.containsAspartame,
      containsNeutralSpirits: fields.containsNeutralSpirits,
      ...(fields.neutralSpiritsCommodity
        ? { neutralSpiritsCommodity: fields.neutralSpiritsCommodity }
        : {}),
      ...(!fields.neutralSpiritsPercentage.trim()
        ? {}
        : {
            neutralSpiritsPercentage: parseOptionalPercentage(
              fields.neutralSpiritsPercentage,
            ),
          }),
      woodTreatmentOrColoringDisclosureRequired:
        fields.woodTreatmentOrColoringDisclosureRequired,
    },
  };
}

function parseOptionalPercentage(input: string): number {
  const value = Number.parseFloat(input.replace("%", "").trim());
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error("INVALID_PERCENTAGE");
  return value;
}

export interface ManifestArtwork {
  filename: string;
  panelType: LabelPanel;
}

export interface ManifestApplication {
  externalId: string;
  application: ApplicationData;
  artwork: ManifestArtwork[];
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (quoted) {
      if (character === '"' && clean[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(value.trim());
      value = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseManifest(text: string): ManifestApplication[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV_EMPTY");
  const headers = rows[0].map((header) =>
    header.toLowerCase().replace(/\s+/g, "_"),
  );
  const required = [
    "application_id",
    "label_filename",
    "panel_type",
    "regulatory_profile",
    "brand_name",
    "class_type",
    "net_contents",
    "responsible_name",
    "responsible_address",
  ];
  for (const header of required) {
    if (!headers.includes(header))
      throw new Error(`CSV_MISSING_${header.toUpperCase()}`);
  }
  const valueAt = (row: string[], name: string) =>
    row[headers.indexOf(name)] ?? "";
  const grouped = new Map<string, ManifestApplication>();
  for (const [offset, row] of rows.slice(1).entries()) {
    const line = offset + 2;
    const externalId = valueAt(row, "application_id");
    const filename = valueAt(row, "label_filename");
    const panel = valueAt(row, "panel_type") as LabelPanel;
    const profile = valueAt(row, "regulatory_profile") as RegulatoryProfile;
    if (!externalId || !filename)
      throw new Error(`CSV_ROW_${line}_MISSING_IDENTIFIER`);
    if (!labelPanels.includes(panel))
      throw new Error(`CSV_ROW_${line}_INVALID_PANEL`);
    if (!regulatoryProfiles.includes(profile))
      throw new Error(`CSV_ROW_${line}_INVALID_PROFILE`);
    const imported = /^(true|yes|1)$/i.test(valueAt(row, "imported"));
    const flag = (name: string, defaultValue = false) => {
      const value = valueAt(row, name);
      return value ? /^(true|yes|1)$/i.test(value) : defaultValue;
    };
    const fields = manualFieldsSchema.parse({
      brandName: valueAt(row, "brand_name"),
      classType: valueAt(row, "class_type"),
      abv: valueAt(row, "abv"),
      proof: valueAt(row, "proof"),
      netContents: valueAt(row, "net_contents"),
      producerName: valueAt(row, "responsible_name"),
      producerAddress: valueAt(row, "responsible_address"),
      responsibleRole: valueAt(row, "responsible_role"),
      countryOfOrigin: valueAt(row, "country_of_origin"),
      appellation: valueAt(row, "appellation"),
      foreignWinePercentage: valueAt(row, "foreign_wine_percentage"),
      ageStatement: valueAt(row, "age_statement"),
      stateOfDistillation: valueAt(row, "state_of_distillation"),
      compositionStatement: valueAt(row, "composition_statement"),
      neutralSpiritsCommodity: valueAt(row, "neutral_spirits_commodity"),
      neutralSpiritsPercentage: valueAt(row, "neutral_spirits_percentage"),
      profile,
      imported,
      alcoholContentRequired: flag("alcohol_content_required", true),
      compositionStatementRequired: flag("composition_statement_required"),
      appellationRequired: flag("appellation_required"),
      foreignWinePercentageRequired: flag("foreign_wine_percentage_required"),
      ageStatementRequired: flag("age_statement_required"),
      stateOfDistillationRequired: flag("state_of_distillation_required"),
      containsSulfites: flag("contains_sulfites"),
      containsYellow5: flag("contains_yellow_5"),
      containsCarmineOrCochineal: flag("contains_carmine_or_cochineal"),
      containsAspartame: flag("contains_aspartame"),
      containsNeutralSpirits: flag("contains_neutral_spirits"),
      woodTreatmentOrColoringDisclosureRequired: flag(
        "wood_treatment_or_coloring_disclosure_required",
      ),
    });
    const application = manualApplicationData(fields);
    const current = grouped.get(externalId);
    if (current) {
      if (current.artwork.some((item) => item.filename === filename))
        throw new Error(`CSV_ROW_${line}_DUPLICATE_FILE`);
      if (JSON.stringify(current.application) !== JSON.stringify(application))
        throw new Error(`CSV_ROW_${line}_CONFLICTING_APPLICATION`);
      current.artwork.push({ filename, panelType: panel });
    } else {
      grouped.set(externalId, {
        externalId,
        application,
        artwork: [{ filename, panelType: panel }],
      });
    }
  }
  if (grouped.size > MAX_BATCH_APPLICATIONS) throw new Error("BATCH_TOO_LARGE");
  return [...grouped.values()];
}
