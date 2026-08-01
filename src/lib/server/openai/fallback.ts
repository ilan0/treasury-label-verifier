import type {
  ApplicationData,
  FieldEvidence,
  LabelObservation,
} from "@/lib/domain";

const MINIMUM_FAST_CONFIDENCE = 0.85;

function missingOrUnclear(evidence: FieldEvidence<unknown> | undefined) {
  return (
    !evidence ||
    evidence.value === null ||
    evidence.confidence < MINIMUM_FAST_CONFIDENCE
  );
}

export function needsThoroughVisionFallback(
  application: ApplicationData,
  observation: LabelObservation,
) {
  if (
    observation.imageQuality === "poor" ||
    observation.imageQuality === "unreadable" ||
    observation.overallConfidence < MINIMUM_FAST_CONFIDENCE
  ) {
    return true;
  }
  const critical = [
    observation.brandName,
    observation.classType,
    observation.netContents,
    observation.responsibleName,
    observation.responsibleAddress,
    observation.responsibleRole,
  ];
  if (critical.some(missingOrUnclear)) return true;

  const declarations = application.declarations ?? {};
  if (
    (application.profile === "faa_distilled_spirits" ||
      declarations.alcoholContentRequired !== false) &&
    missingOrUnclear(observation.alcoholByVolume)
  ) {
    return true;
  }
  if (application.proof !== undefined && missingOrUnclear(observation.proof))
    return true;
  if (declarations.imported && missingOrUnclear(observation.countryOfOrigin))
    return true;

  const warning = observation.healthWarning;
  if (
    !warning?.text ||
    warning.confidence < MINIMUM_FAST_CONFIDENCE ||
    !warning.text.includes("(1)") ||
    !warning.text.includes("(2)") ||
    warning.text.length < 180
  ) {
    return true;
  }
  return false;
}
