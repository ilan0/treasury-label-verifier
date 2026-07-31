export const RULESET_VERSION = "2026-07-31.1" as const;

export const beverageFamilies = [
  "distilled_spirits",
  "wine",
  "malt_beverage",
  "other_fermented",
] as const;

export type BeverageFamily = (typeof beverageFamilies)[number];

export const regulatoryProfiles = [
  "faa_distilled_spirits",
  "faa_wine",
  "faa_malt_beverage",
  "irc_wine_under_7",
  "irc_beer_non_faa",
  "classification_review",
] as const;

export type RegulatoryProfile = (typeof regulatoryProfiles)[number];

export const labelPanels = [
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
] as const;

export type LabelPanel = (typeof labelPanels)[number];

export const jobStatuses = [
  "draft",
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
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export type RuleStatus =
  "pass" | "fail" | "review" | "not_applicable" | "not_assessed";

export type JobOutcome =
  "precheck_passed" | "human_review_required" | "correction_needed";

export type ReviewDecision =
  "confirmed_clear" | "accepted_with_override" | "return_for_correction";

export type RuleSeverity = "mandatory" | "conditional" | "advisory";

export type MatchKind =
  "exact" | "equivalent" | "review" | "mismatch" | "missing";

export interface SourceCitation {
  authority: "eCFR" | "TTB" | "CBP" | "FDA";
  citation: string;
  title: string;
  url: string;
  accessedOn: string;
}

export interface FieldEvidence<T> {
  value: T | null;
  confidence: number;
  rawText?: string;
  panel?: LabelPanel;
  boundingBox?: readonly [number, number, number, number];
}

export type VolumeUnit = "mL" | "L" | "fl_oz" | "pt" | "qt" | "gal";

export interface NetContents {
  value: number;
  unit: VolumeUnit;
}

export interface ResponsibleParty {
  name: string;
  address: string;
  role?: string;
}

export interface ConditionalDeclarations {
  imported?: boolean;
  alcoholContentRequired?: boolean;
  compositionStatementRequired?: boolean;
  appellationRequired?: boolean;
  foreignWinePercentageRequired?: boolean;
  ageStatementRequired?: boolean;
  stateOfDistillationRequired?: boolean;
  containsSulfites?: boolean;
  containsYellow5?: boolean;
  containsCarmineOrCochineal?: boolean;
  containsAspartame?: boolean;
  containsNeutralSpirits?: boolean;
  neutralSpiritsCommodity?: string;
  neutralSpiritsPercentage?: number;
  woodTreatmentOrColoringDisclosureRequired?: boolean;
}

export interface ApplicationData {
  profile: RegulatoryProfile;
  beverageFamily: BeverageFamily;
  brandName: string;
  classType: string;
  alcoholByVolume?: number;
  proof?: number;
  netContents: NetContents;
  responsibleParty: ResponsibleParty;
  countryOfOrigin?: string;
  appellation?: string;
  foreignWinePercentage?: number;
  ageStatement?: string;
  stateOfDistillation?: string;
  compositionStatement?: string;
  declarations?: ConditionalDeclarations;
}

export interface HealthWarningObservation {
  text: string | null;
  confidence: number;
  panel?: LabelPanel;
  headingAllCaps?: boolean;
  headingBold?: boolean;
  continuous?: boolean;
  separateFromOtherInformation?: boolean;
  legible?: boolean;
  contrastingBackground?: boolean;
  measuredTypeSizeMm?: number;
  containerVolumeMl?: number;
}

export type ConditionalStatementKey =
  | "sulfites"
  | "yellow5"
  | "carmine_or_cochineal"
  | "aspartame"
  | "neutral_spirits"
  | "wood_treatment_or_coloring"
  | "composition";

export interface LabelObservation {
  brandName?: FieldEvidence<string>;
  classType?: FieldEvidence<string>;
  alcoholByVolume?: FieldEvidence<number>;
  proof?: FieldEvidence<number>;
  netContents?: FieldEvidence<NetContents>;
  responsibleName?: FieldEvidence<string>;
  responsibleAddress?: FieldEvidence<string>;
  responsibleRole?: FieldEvidence<string>;
  countryOfOrigin?: FieldEvidence<string>;
  appellation?: FieldEvidence<string>;
  foreignWinePercentage?: FieldEvidence<number>;
  ageStatement?: FieldEvidence<string>;
  stateOfDistillation?: FieldEvidence<string>;
  conditionalStatements?: Partial<
    Record<ConditionalStatementKey, FieldEvidence<string>>
  >;
  healthWarning?: HealthWarningObservation;
  sameFieldOfVision?: {
    brandClassAlcohol?: boolean;
  };
  overallConfidence: number;
  imageQuality?: "good" | "fair" | "poor" | "unreadable";
}

export interface MatchResult {
  kind: MatchKind;
  confidence: number;
  expected: string;
  observed: string | null;
  explanation: string;
}

export interface RuleDefinition {
  id: string;
  title: string;
  description: string;
  profiles: readonly RegulatoryProfile[];
  severity: RuleSeverity;
  citation: SourceCitation;
  automated: boolean;
}

export interface RuleResult {
  ruleId: string;
  title: string;
  description: string;
  status: RuleStatus;
  severity: RuleSeverity;
  expected: string | null;
  observed: string | null;
  confidence: number | null;
  explanation: string;
  citation: SourceCitation;
  evidencePanel?: LabelPanel;
}

export interface ComplianceAssessment {
  rulesetVersion: typeof RULESET_VERSION;
  profile: RegulatoryProfile;
  outcome: JobOutcome;
  overallConfidence: number;
  results: RuleResult[];
  counts: Record<RuleStatus, number>;
}
