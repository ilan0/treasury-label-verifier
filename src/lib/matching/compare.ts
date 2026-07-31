import type { FieldEvidence, MatchResult, NetContents } from "@/lib/domain";

import {
  canonicalizeAddress,
  canonicalizeClassType,
  canonicalizeCountry,
  canonicalizeText,
  characterSimilarity,
  normalizeWhitespace,
  tokenSimilarity,
} from "./normalize";

const REVIEW_SIMILARITY = 0.8;

function missingMatch(expected: string): MatchResult {
  return {
    kind: "missing",
    confidence: 0,
    expected,
    observed: null,
    explanation:
      "The expected value was not found in the supplied label artwork.",
  };
}

export function compareText(
  expected: string,
  evidence: FieldEvidence<string> | undefined,
): MatchResult {
  const observed = evidence?.value;
  if (!observed) return missingMatch(expected);

  if (normalizeWhitespace(expected) === normalizeWhitespace(observed)) {
    return {
      kind: "exact",
      confidence: evidence.confidence,
      expected,
      observed,
      explanation: "The label text exactly matches the application value.",
    };
  }

  if (canonicalizeText(expected) === canonicalizeText(observed)) {
    return {
      kind: "equivalent",
      confidence: evidence.confidence,
      expected,
      observed,
      explanation:
        "The values are equivalent after harmless capitalization, punctuation, or typography differences.",
    };
  }

  const similarity = Math.max(
    tokenSimilarity(expected, observed),
    characterSimilarity(expected, observed),
  );
  if (similarity >= REVIEW_SIMILARITY) {
    return {
      kind: "review",
      confidence: Math.min(evidence.confidence, similarity),
      expected,
      observed,
      explanation:
        "The values are similar but not deterministically equivalent; a reviewer must decide.",
    };
  }

  return {
    kind: "mismatch",
    confidence: evidence.confidence,
    expected,
    observed,
    explanation: "The label value does not match the application value.",
  };
}

export function compareClassType(
  expected: string,
  evidence: FieldEvidence<string> | undefined,
): MatchResult {
  const observed = evidence?.value;
  if (!observed) return missingMatch(expected);

  if (normalizeWhitespace(expected) === normalizeWhitespace(observed)) {
    return compareText(expected, evidence);
  }

  if (canonicalizeClassType(expected) === canonicalizeClassType(observed)) {
    return {
      kind: "equivalent",
      confidence: evidence.confidence,
      expected,
      observed,
      explanation:
        "The class/type uses a recognized equivalent spelling or designation.",
    };
  }

  return compareText(expected, evidence);
}

export function compareCountry(
  expected: string,
  evidence: FieldEvidence<string> | undefined,
): MatchResult {
  const observed = evidence?.value;
  if (!observed) return missingMatch(expected);

  if (canonicalizeCountry(expected) === canonicalizeCountry(observed)) {
    return {
      kind:
        normalizeWhitespace(expected) === normalizeWhitespace(observed)
          ? "exact"
          : "equivalent",
      confidence: evidence.confidence,
      expected,
      observed,
      explanation: "The country of origin matches the application value.",
    };
  }

  return {
    kind: "mismatch",
    confidence: evidence.confidence,
    expected,
    observed,
    explanation: "The country of origin conflicts with the application value.",
  };
}

export function compareAddress(
  expected: string,
  evidence: FieldEvidence<string> | undefined,
): MatchResult {
  const observed = evidence?.value;
  if (!observed) return missingMatch(expected);

  if (canonicalizeAddress(expected) === canonicalizeAddress(observed)) {
    return {
      kind:
        normalizeWhitespace(expected) === normalizeWhitespace(observed)
          ? "exact"
          : "equivalent",
      confidence: evidence.confidence,
      expected,
      observed,
      explanation:
        "The responsible-party address matches after standard postal normalization.",
    };
  }

  return compareText(expected, evidence);
}

export function compareNumber(
  expected: number,
  evidence: FieldEvidence<number> | undefined,
  options: { tolerance?: number; label?: string } = {},
): MatchResult {
  const observed = evidence?.value;
  const label = options.label ?? "numeric value";
  if (
    observed === null ||
    observed === undefined ||
    !Number.isFinite(observed)
  ) {
    return missingMatch(String(expected));
  }

  const tolerance = options.tolerance ?? 0.05;
  const matches = Math.abs(expected - observed) <= tolerance;
  return {
    kind: matches ? "exact" : "mismatch",
    confidence: evidence?.confidence ?? 0,
    expected: String(expected),
    observed: String(observed),
    explanation: matches
      ? `The ${label} matches the application value.`
      : `The ${label} does not match the application value.`,
  };
}

const toMilliliters: Record<NetContents["unit"], number> = {
  mL: 1,
  L: 1000,
  fl_oz: 29.5735295625,
  pt: 473.176473,
  qt: 946.352946,
  gal: 3785.411784,
};

export function volumeInMilliliters(volume: NetContents): number {
  return volume.value * toMilliliters[volume.unit];
}

export function formatNetContents(volume: NetContents): string {
  return `${volume.value} ${volume.unit.replace("_", " ")}`;
}

export function compareNetContents(
  expected: NetContents,
  evidence: FieldEvidence<NetContents> | undefined,
): MatchResult {
  const observed = evidence?.value;
  if (!observed) return missingMatch(formatNetContents(expected));

  const expectedMl = volumeInMilliliters(expected);
  const observedMl = volumeInMilliliters(observed);
  const toleranceMl = Math.max(0.5, expectedMl * 0.001);
  const matches = Math.abs(expectedMl - observedMl) <= toleranceMl;

  return {
    kind:
      matches &&
      expected.unit === observed.unit &&
      expected.value === observed.value
        ? "exact"
        : matches
          ? "equivalent"
          : "mismatch",
    confidence: evidence.confidence,
    expected: formatNetContents(expected),
    observed: formatNetContents(observed),
    explanation: matches
      ? "The net contents represent the same volume as the application value."
      : "The net contents do not match the application value.",
  };
}
