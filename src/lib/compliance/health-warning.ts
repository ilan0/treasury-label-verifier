import type {
  HealthWarningObservation,
  RuleDefinition,
  RuleResult,
  RuleStatus,
} from "@/lib/domain";
import { normalizeWhitespace } from "@/lib/matching";

import { findRule } from "./ruleset";

export const GOVERNMENT_HEALTH_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

function result(
  definition: RuleDefinition,
  status: RuleStatus,
  observation: HealthWarningObservation | undefined,
  expected: string,
  observed: string | null,
  explanation: string,
): RuleResult {
  return {
    ruleId: definition.id,
    title: definition.title,
    description: definition.description,
    status,
    severity: definition.severity,
    expected,
    observed,
    confidence: observation?.confidence ?? null,
    explanation,
    citation: definition.citation,
    evidencePanel: observation?.panel,
  };
}

export function minimumWarningTypeSizeMm(containerVolumeMl: number): number {
  if (containerVolumeMl <= 237) return 1;
  if (containerVolumeMl <= 3000) return 2;
  return 3;
}

export function hasExactGovernmentWarning(text: string | null): boolean {
  return (
    text !== null && normalizeWhitespace(text) === GOVERNMENT_HEALTH_WARNING
  );
}

export function evaluateHealthWarning(
  observation: HealthWarningObservation | undefined,
  expectedContainerVolumeMl?: number,
): RuleResult[] {
  const exactRule = findRule("warning.exact-text");
  const headingRule = findRule("warning.heading-format");
  const presentationRule = findRule("warning.presentation");
  const sizeRule = findRule("warning.minimum-type-size");
  const text = observation?.text ?? null;

  const exactTextResult = result(
    exactRule,
    hasExactGovernmentWarning(text) ? "pass" : "fail",
    observation,
    GOVERNMENT_HEALTH_WARNING,
    text,
    text
      ? hasExactGovernmentWarning(text)
        ? "The statutory warning wording, punctuation, and capitalization are exact."
        : "The warning differs from the prescribed statutory text."
      : "The government health warning was not found.",
  );

  const headingValues = [observation?.headingAllCaps, observation?.headingBold];
  const headingStatus: RuleStatus = headingValues.some(
    (value) => value === false,
  )
    ? "fail"
    : headingValues.every((value) => value === true)
      ? "pass"
      : "not_assessed";
  const headingResult = result(
    headingRule,
    headingStatus,
    observation,
    "GOVERNMENT WARNING: in capital letters and bold type",
    observation
      ? `uppercase: ${String(observation.headingAllCaps)}, bold: ${String(observation.headingBold)}`
      : null,
    headingStatus === "pass"
      ? "The warning heading is uppercase and bold."
      : headingStatus === "fail"
        ? "The warning heading is not both uppercase and bold."
        : "The artwork does not provide enough reliable visual evidence to assess both capitalization and bold type.",
  );

  const presentationValues = [
    observation?.continuous,
    observation?.separateFromOtherInformation,
    observation?.legible,
    observation?.contrastingBackground,
  ];
  const presentationStatus: RuleStatus = presentationValues.some(
    (value) => value === false,
  )
    ? "fail"
    : presentationValues.every((value) => value === true)
      ? "pass"
      : "not_assessed";
  const presentationResult = result(
    presentationRule,
    presentationStatus,
    observation,
    "Continuous, separate and apart, readily legible, and on a contrasting background",
    observation
      ? [
          `continuous: ${String(observation.continuous)}`,
          `separate: ${String(observation.separateFromOtherInformation)}`,
          `legible: ${String(observation.legible)}`,
          `contrast: ${String(observation.contrastingBackground)}`,
        ].join(", ")
      : null,
    presentationStatus === "pass"
      ? "The warning presentation satisfies the observable requirements."
      : presentationStatus === "fail"
        ? "At least one required presentation characteristic is visibly noncompliant."
        : "The supplied artwork does not establish every required presentation characteristic.",
  );

  const volumeMl = observation?.containerVolumeMl ?? expectedContainerVolumeMl;
  const requiredSize =
    volumeMl === undefined ? undefined : minimumWarningTypeSizeMm(volumeMl);
  const measuredSize = observation?.measuredTypeSizeMm;
  const sizeStatus: RuleStatus =
    requiredSize === undefined || measuredSize === undefined
      ? "not_assessed"
      : measuredSize >= requiredSize
        ? "pass"
        : "fail";
  const sizeResult = result(
    sizeRule,
    sizeStatus,
    observation,
    requiredSize === undefined
      ? "Minimum physical type size based on container volume"
      : `At least ${requiredSize} mm`,
    measuredSize === undefined ? null : `${measuredSize} mm`,
    sizeStatus === "pass"
      ? "The measured type meets the minimum size for this container."
      : sizeStatus === "fail"
        ? "The measured type is below the minimum size for this container."
        : "Physical type size cannot be proven without reliable artwork scale and container volume.",
  );

  return [exactTextResult, headingResult, presentationResult, sizeResult];
}
