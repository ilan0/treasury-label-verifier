import type {
  ApplicationData,
  ComplianceAssessment,
  ConditionalStatementKey,
  FieldEvidence,
  LabelObservation,
  MatchResult,
  RuleDefinition,
  RuleResult,
  RuleStatus,
} from "@/lib/domain";
import { RULESET_VERSION } from "@/lib/domain";
import { aggregateOutcome, countRuleStatuses } from "@/lib/confidence";
import {
  canonicalizeText,
  compareAddress,
  compareClassType,
  compareCountry,
  compareNetContents,
  compareNumber,
  compareText,
  normalizeWhitespace,
  volumeInMilliliters,
} from "@/lib/matching";

import { evaluateHealthWarning } from "./health-warning";
import { rulesForProfile } from "./ruleset";

const warningRuleIds = new Set([
  "warning.exact-text",
  "warning.heading-format",
  "warning.presentation",
  "warning.minimum-type-size",
]);

function ruleResult(
  rule: RuleDefinition,
  status: RuleStatus,
  options: {
    expected?: string | null;
    observed?: string | null;
    confidence?: number | null;
    explanation: string;
    evidencePanel?: RuleResult["evidencePanel"];
  },
): RuleResult {
  return {
    ruleId: rule.id,
    title: rule.title,
    description: rule.description,
    status,
    severity: rule.severity,
    expected: options.expected ?? null,
    observed: options.observed ?? null,
    confidence: options.confidence ?? null,
    explanation: options.explanation,
    citation: rule.citation,
    evidencePanel: options.evidencePanel,
  };
}

function matchStatus(match: MatchResult): RuleStatus {
  if (match.kind === "exact" || match.kind === "equivalent") return "pass";
  if (match.kind === "review") return "review";
  return "fail";
}

function fromMatch(
  rule: RuleDefinition,
  match: MatchResult,
  evidence?: FieldEvidence<unknown>,
): RuleResult {
  return ruleResult(rule, matchStatus(match), {
    expected: match.expected,
    observed: match.observed,
    confidence: match.confidence,
    explanation: match.explanation,
    evidencePanel: evidence?.panel,
  });
}

const matchPriority: Record<MatchResult["kind"], number> = {
  exact: 0,
  equivalent: 1,
  review: 2,
  missing: 3,
  mismatch: 4,
};

function combineMatches(matches: MatchResult[]): MatchResult {
  const decisive = [...matches].sort(
    (left, right) => matchPriority[right.kind] - matchPriority[left.kind],
  )[0];
  return {
    ...decisive,
    expected: matches.map((match) => match.expected).join(" | "),
    observed: matches.map((match) => match.observed ?? "not found").join(" | "),
    confidence: Math.min(...matches.map((match) => match.confidence)),
    explanation: matches.map((match) => match.explanation).join(" "),
  };
}

function notApplicable(rule: RuleDefinition): RuleResult {
  return ruleResult(rule, "not_applicable", {
    explanation:
      "The submitted application facts do not make this conditional requirement applicable.",
  });
}

function manualReview(rule: RuleDefinition): RuleResult {
  return ruleResult(rule, "review", {
    explanation:
      "This determination requires regulatory classification or specialist review and is not automated by the prototype.",
  });
}

function evaluateResponsibleParty(
  rule: RuleDefinition,
  application: ApplicationData,
  observation: LabelObservation,
): RuleResult {
  const matches = [
    compareText(application.responsibleParty.name, observation.responsibleName),
    compareAddress(
      application.responsibleParty.address,
      observation.responsibleAddress,
    ),
  ];

  if (application.responsibleParty.role) {
    matches.push(
      compareText(
        application.responsibleParty.role,
        observation.responsibleRole,
      ),
    );
  } else if (!observation.responsibleRole?.value) {
    matches.push({
      kind: "missing",
      confidence: 0,
      expected: "An appropriate responsible-party role phrase",
      observed: null,
      explanation:
        "A responsible-party role phrase such as bottled by, produced by, or imported by was not found.",
    });
  }

  return fromMatch(rule, combineMatches(matches), observation.responsibleName);
}

function evaluateNetContents(
  rule: RuleDefinition,
  application: ApplicationData,
  observation: LabelObservation,
): RuleResult {
  const result = fromMatch(
    rule,
    compareNetContents(application.netContents, observation.netContents),
    observation.netContents,
  );

  const observedUnit = observation.netContents?.value?.unit;
  const acceptedUnits =
    application.profile === "faa_malt_beverage"
      ? new Set(["fl_oz", "pt", "qt", "gal"])
      : new Set(["mL", "L"]);
  if (
    result.status === "pass" &&
    observedUnit &&
    !acceptedUnits.has(observedUnit)
  ) {
    return {
      ...result,
      status: "fail",
      explanation:
        application.profile === "faa_malt_beverage"
          ? "The amount matches, but malt beverage net contents require U.S. standard measure; metric may appear only in addition."
          : "The amount matches, but wine and distilled spirits net contents must use authorized metric units.",
    };
  }

  if (result.status === "pass" && observation.netContents?.panel === "bottom") {
    return {
      ...result,
      status: "fail",
      explanation:
        "The value matches, but a mandatory statement on the bottom surface does not satisfy label placement requirements.",
    };
  }
  if (
    result.status === "pass" &&
    observation.netContents?.panel === "closure"
  ) {
    return {
      ...result,
      status: "review",
      explanation:
        "The value matches, but mandatory information on a closure requires authorization to satisfy label placement.",
    };
  }

  return result;
}

function evaluateAlcohol(
  rule: RuleDefinition,
  application: ApplicationData,
  observation: LabelObservation,
  applicable: boolean,
): RuleResult {
  if (!applicable) return notApplicable(rule);
  if (application.alcoholByVolume === undefined) {
    return ruleResult(rule, "review", {
      expected: "A confirmed application alcohol value",
      explanation:
        "The requirement applies, but the application record does not contain a confirmed ABV for comparison.",
    });
  }

  const matches = [
    compareNumber(application.alcoholByVolume, observation.alcoholByVolume, {
      label: "alcohol content",
    }),
  ];

  const rawAlcoholText = observation.alcoholByVolume?.rawText;
  if (!rawAlcoholText) {
    matches.push({
      kind: "review",
      confidence: observation.alcoholByVolume?.confidence ?? 0,
      expected: "Authorized percent alcohol by volume wording",
      observed: null,
      explanation:
        "The numeric value was extracted, but the original wording is unavailable to verify the required statement format.",
    });
  } else {
    const canonicalRaw = canonicalizeText(rawAlcoholText);
    const usesAuthorizedFormat =
      /\b\d+(?:\.\d+)?\b/.test(canonicalRaw) &&
      (rawAlcoholText.includes("%") || canonicalRaw.includes("percent")) &&
      (canonicalRaw.includes("alcohol") || canonicalRaw.includes("alc")) &&
      (canonicalRaw.includes("volume") || canonicalRaw.includes("vol")) &&
      !canonicalRaw.includes("abv");
    if (!usesAuthorizedFormat) {
      matches.push({
        kind: "mismatch",
        confidence: observation.alcoholByVolume?.confidence ?? 0,
        expected: "Authorized percent alcohol by volume wording",
        observed: rawAlcoholText,
        explanation:
          "The alcohol statement does not use an authorized percent alcohol by volume format.",
      });
    }
  }

  if (application.proof !== undefined) {
    matches.push(
      compareNumber(application.proof, observation.proof, {
        tolerance: 0.1,
        label: "proof",
      }),
    );
  }

  if (
    observation.proof?.value !== null &&
    observation.proof?.value !== undefined &&
    observation.alcoholByVolume?.value !== null &&
    observation.alcoholByVolume?.value !== undefined
  ) {
    matches.push(
      compareNumber(observation.alcoholByVolume.value * 2, observation.proof, {
        tolerance: 0.1,
        label: "proof-to-ABV consistency",
      }),
    );
  }

  return fromMatch(rule, combineMatches(matches), observation.alcoholByVolume);
}

function evaluateImportOrigin(
  rule: RuleDefinition,
  application: ApplicationData,
  observation: LabelObservation,
): RuleResult {
  if (!application.declarations?.imported) return notApplicable(rule);
  if (!application.countryOfOrigin) {
    return ruleResult(rule, "review", {
      expected: "A confirmed country of origin",
      explanation:
        "The application identifies an imported product but does not provide a country for comparison.",
    });
  }
  return fromMatch(
    rule,
    compareCountry(application.countryOfOrigin, observation.countryOfOrigin),
    observation.countryOfOrigin,
  );
}

function evaluateStatement(
  rule: RuleDefinition,
  observation: LabelObservation,
  applicable: boolean,
  key: ConditionalStatementKey,
  expected: string,
  predicate: (canonicalText: string, rawText: string) => boolean,
): RuleResult {
  if (!applicable) return notApplicable(rule);
  const evidence = observation.conditionalStatements?.[key];
  const observed = evidence?.value;
  if (!observed) {
    return ruleResult(rule, "fail", {
      expected,
      explanation:
        "The applicable disclosure was not found in the supplied artwork.",
      evidencePanel: evidence?.panel,
    });
  }

  const passes = predicate(canonicalizeText(observed), observed);
  return ruleResult(rule, passes ? "pass" : "fail", {
    expected,
    observed,
    confidence: evidence.confidence,
    explanation: passes
      ? "The applicable disclosure was found."
      : "A related statement was found, but it does not contain the required disclosure.",
    evidencePanel: evidence.panel,
  });
}

function includesAll(...tokens: string[]): (value: string) => boolean {
  return (value) => tokens.every((token) => value.includes(token));
}

function evaluateProfileRule(
  rule: RuleDefinition,
  application: ApplicationData,
  observation: LabelObservation,
): RuleResult {
  const declarations = application.declarations ?? {};
  const profilePrefix =
    application.profile === "faa_distilled_spirits"
      ? "spirits"
      : application.profile === "faa_wine"
        ? "wine"
        : "malt";

  if (rule.id.startsWith("jurisdiction.")) return manualReview(rule);

  switch (rule.id) {
    case `${profilePrefix}.brand-name`:
      return fromMatch(
        rule,
        compareText(application.brandName, observation.brandName),
        observation.brandName,
      );
    case `${profilePrefix}.class-type`:
      return fromMatch(
        rule,
        compareClassType(application.classType, observation.classType),
        observation.classType,
      );
    case `${profilePrefix}.net-contents`:
      return evaluateNetContents(rule, application, observation);
    case `${profilePrefix}.responsible-party`:
      return evaluateResponsibleParty(rule, application, observation);
    case `${profilePrefix}.import-origin`:
      return evaluateImportOrigin(rule, application, observation);
    case `${profilePrefix}.alcohol-content`:
      return evaluateAlcohol(
        rule,
        application,
        observation,
        profilePrefix === "spirits" ||
          declarations.alcoholContentRequired !== false,
      );
    case "spirits.same-field-of-vision": {
      const observed = observation.sameFieldOfVision?.brandClassAlcohol;
      return ruleResult(
        rule,
        observed === undefined ? "not_assessed" : observed ? "pass" : "fail",
        {
          expected: "Brand, class/type, and ABV visible together",
          observed:
            observed === undefined
              ? null
              : observed
                ? "Visible together"
                : "Not visible together",
          confidence:
            observed === undefined ? null : observation.overallConfidence,
          explanation:
            observed === undefined
              ? "The submitted panel mapping does not establish the same field of vision."
              : observed
                ? "All three statements are shown in the same field of vision."
                : "The required statements are not shown in the same field of vision.",
        },
      );
    }
    case "spirits.age-statement":
      if (!declarations.ageStatementRequired) return notApplicable(rule);
      if (!application.ageStatement) return manualReview(rule);
      return fromMatch(
        rule,
        compareText(application.ageStatement, observation.ageStatement),
        observation.ageStatement,
      );
    case "spirits.state-of-distillation":
      if (!declarations.stateOfDistillationRequired) return notApplicable(rule);
      if (!application.stateOfDistillation) return manualReview(rule);
      return fromMatch(
        rule,
        compareText(
          application.stateOfDistillation,
          observation.stateOfDistillation,
        ),
        observation.stateOfDistillation,
      );
    case "wine.appellation":
      if (!declarations.appellationRequired) return notApplicable(rule);
      if (!application.appellation) return manualReview(rule);
      return fromMatch(
        rule,
        compareText(application.appellation, observation.appellation),
        observation.appellation,
      );
    case "wine.foreign-wine-percentage":
      if (!declarations.foreignWinePercentageRequired)
        return notApplicable(rule);
      if (application.foreignWinePercentage === undefined)
        return manualReview(rule);
      return fromMatch(
        rule,
        compareNumber(
          application.foreignWinePercentage,
          observation.foreignWinePercentage,
          { tolerance: 0.05, label: "foreign wine percentage" },
        ),
        observation.foreignWinePercentage,
      );
    case "wine.composition":
    case "malt.composition":
      if (!declarations.compositionStatementRequired)
        return notApplicable(rule);
      if (!application.compositionStatement) return manualReview(rule);
      return fromMatch(
        rule,
        compareText(
          application.compositionStatement,
          observation.conditionalStatements?.composition,
        ),
        observation.conditionalStatements?.composition,
      );
    case "spirits.neutral-spirits": {
      const commodity = declarations.neutralSpiritsCommodity;
      const percentage = declarations.neutralSpiritsPercentage;
      return evaluateStatement(
        rule,
        observation,
        declarations.containsNeutralSpirits === true,
        "neutral_spirits",
        "Neutral spirits commodity and applicable percentage",
        (text) =>
          text.includes("neutral spirits") &&
          (!commodity || text.includes(canonicalizeText(commodity))) &&
          (percentage === undefined || text.includes(String(percentage))),
      );
    }
    case "spirits.wood-treatment-or-coloring":
      return evaluateStatement(
        rule,
        observation,
        declarations.woodTreatmentOrColoringDisclosureRequired === true,
        "wood_treatment_or_coloring",
        "Required coloring or wood-treatment disclosure",
        (text) => text.length > 0,
      );
    case "spirits.sulfites":
    case "wine.sulfites":
    case "malt.sulfites":
      return evaluateStatement(
        rule,
        observation,
        declarations.containsSulfites === true,
        "sulfites",
        "Contains sulfites or an authorized equivalent",
        (text) =>
          (text.includes("contain") && text.includes("sulfit")) ||
          (text.includes("contain") && text.includes("sulphit")) ||
          text.includes("sulfur dioxide") ||
          text.includes("metabisulfite") ||
          text.includes("bisulfite"),
      );
    case "spirits.yellow5":
    case "wine.yellow5":
    case "malt.yellow5":
      return evaluateStatement(
        rule,
        observation,
        declarations.containsYellow5 === true,
        "yellow5",
        "FD&C Yellow No. 5 disclosure",
        includesAll("yellow", "5"),
      );
    case "spirits.carmine-or-cochineal":
    case "wine.carmine-or-cochineal":
    case "malt.carmine-or-cochineal":
      return evaluateStatement(
        rule,
        observation,
        declarations.containsCarmineOrCochineal === true,
        "carmine_or_cochineal",
        "Contains carmine or contains cochineal extract",
        (text) => text.includes("carmine") || text.includes("cochineal"),
      );
    case "spirits.aspartame":
    case "wine.aspartame":
    case "malt.aspartame":
      return evaluateStatement(
        rule,
        observation,
        declarations.containsAspartame === true,
        "aspartame",
        "PHENYLKETONURICS: CONTAINS PHENYLALANINE.",
        (_text, rawText) =>
          normalizeWhitespace(rawText) ===
          "PHENYLKETONURICS: CONTAINS PHENYLALANINE.",
      );
    default:
      throw new Error(`Rule ${rule.id} does not have an implementation.`);
  }
}

export function evaluateCompliance(
  application: ApplicationData,
  observation: LabelObservation,
): ComplianceAssessment {
  const profileRules = rulesForProfile(application.profile);
  const expectedVolumeMl = volumeInMilliliters(application.netContents);
  const evaluatedResults = [
    ...evaluateHealthWarning(observation.healthWarning, expectedVolumeMl),
    ...profileRules
      .filter((rule) => !warningRuleIds.has(rule.id))
      .map((rule) => evaluateProfileRule(rule, application, observation)),
  ];

  const evidenceIsUncertain =
    observation.overallConfidence < 0.9 ||
    observation.imageQuality === "poor" ||
    observation.imageQuality === "unreadable";
  const results = evidenceIsUncertain
    ? evaluatedResults.map((result) =>
        result.status === "fail"
          ? {
              ...result,
              status: "review" as const,
              explanation: `${result.explanation} The source evidence is low quality, so a person must confirm the apparent issue before requesting a correction.`,
            }
          : result,
      )
    : evaluatedResults;

  const outcome = aggregateOutcome(results, observation.overallConfidence);
  return {
    rulesetVersion: RULESET_VERSION,
    profile: application.profile,
    outcome,
    overallConfidence: observation.overallConfidence,
    results,
    counts: countRuleStatuses(results),
  };
}
