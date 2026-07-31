import {
  RULESET_VERSION,
  type RegulatoryProfile,
  type RuleDefinition,
  type SourceCitation,
} from "@/lib/domain";

const ACCESSED_ON = "2026-07-31";

function ecfr(citation: string, title: string, path: string): SourceCitation {
  return {
    authority: "eCFR",
    citation,
    title,
    url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/${path}`,
    accessedOn: ACCESSED_ON,
  };
}

function ttb(citation: string, title: string, url: string): SourceCitation {
  return {
    authority: "TTB",
    citation,
    title,
    url,
    accessedOn: ACCESSED_ON,
  };
}

const allProfiles: readonly RegulatoryProfile[] = [
  "faa_distilled_spirits",
  "faa_wine",
  "faa_malt_beverage",
  "irc_wine_under_7",
  "irc_beer_non_faa",
  "classification_review",
];

const warningCitation = ecfr(
  "27 CFR 16.21–16.22",
  "Mandatory health warning statement and format",
  "part-16/subpart-C",
);

const spiritsCitation = ecfr(
  "27 CFR 5.61–5.74",
  "Distilled spirits mandatory label information",
  "part-5/subpart-E",
);

const wineCitation = ecfr(
  "27 CFR 4.30–4.39",
  "Wine label requirements",
  "part-4/subpart-D",
);

const maltCitation = ecfr(
  "27 CFR 7.61–7.71",
  "Malt beverage mandatory label information",
  "part-7/subpart-E",
);

function rule(
  definition: Omit<RuleDefinition, "automated"> & { automated?: boolean },
): RuleDefinition {
  return { ...definition, automated: definition.automated ?? true };
}

export const ruleset = {
  version: RULESET_VERSION,
  reviewedOn: ACCESSED_ON,
  rules: [
    rule({
      id: "warning.exact-text",
      title: "Exact government health warning",
      description:
        "The complete statutory warning must appear with the prescribed wording, punctuation, and capitalization.",
      profiles: allProfiles,
      severity: "mandatory",
      citation: warningCitation,
    }),
    rule({
      id: "warning.heading-format",
      title: "Warning heading is uppercase and bold",
      description:
        "GOVERNMENT WARNING: must appear in capital letters and bold type.",
      profiles: allProfiles,
      severity: "mandatory",
      citation: warningCitation,
    }),
    rule({
      id: "warning.presentation",
      title: "Warning is continuous, separate, and legible",
      description:
        "The warning must appear as a continuous statement, separate and apart, and readily legible on a contrasting background.",
      profiles: allProfiles,
      severity: "mandatory",
      citation: warningCitation,
    }),
    rule({
      id: "warning.minimum-type-size",
      title: "Warning minimum type size",
      description:
        "The warning must meet the minimum type size for the container volume; unscaled photos cannot establish physical size.",
      profiles: allProfiles,
      severity: "mandatory",
      citation: warningCitation,
    }),

    rule({
      id: "spirits.brand-name",
      title: "Brand name",
      description: "The brand name must appear and match the application.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.class-type",
      title: "Class, type, or designation",
      description: "The class/type designation must match the application.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.alcohol-content",
      title: "Alcohol content",
      description:
        "Distilled spirits must state alcohol content as percent alcohol by volume.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.same-field-of-vision",
      title: "Same field of vision",
      description:
        "Brand, class/type, and alcohol content must be viewable in the same field of vision.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.net-contents",
      title: "Net contents",
      description:
        "Net contents must appear on a qualifying label or container marking.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.responsible-party",
      title: "Responsible party name, address, and role",
      description:
        "The required bottler, distiller, processor, or importer statement must appear.",
      profiles: ["faa_distilled_spirits"],
      severity: "mandatory",
      citation: spiritsCitation,
    }),
    rule({
      id: "spirits.import-origin",
      title: "Imported product origin",
      description:
        "An imported product must include the declared country of origin.",
      profiles: ["faa_distilled_spirits"],
      severity: "conditional",
      citation: ttb(
        "TTB Distilled Spirits Labeling Checklist — Country of Origin",
        "Distilled Spirits Labeling Checklist",
        "https://www.ttb.gov/system/files/images/labeling-ds/ds-labeling-checklist.pdf",
      ),
    }),
    ...[
      ["neutral-spirits", "Neutral spirits source disclosure"],
      ["wood-treatment-or-coloring", "Coloring or wood-treatment disclosure"],
      ["age-statement", "Required age statement"],
      ["state-of-distillation", "Required state of distillation"],
      ["yellow5", "FD&C Yellow No. 5 disclosure"],
      ["carmine-or-cochineal", "Carmine or cochineal disclosure"],
      ["sulfites", "Sulfites disclosure"],
      ["aspartame", "Aspartame phenylalanine disclosure"],
    ].map(([id, title]) =>
      rule({
        id: `spirits.${id}`,
        title,
        description: `${title} must appear when the application facts make it applicable.`,
        profiles: ["faa_distilled_spirits"],
        severity: "conditional",
        citation: spiritsCitation,
      }),
    ),

    ...[
      ["brand-name", "Brand name", "mandatory"],
      ["class-type", "Class or type designation", "mandatory"],
      ["alcohol-content", "Alcohol content", "conditional"],
      ["net-contents", "Net contents", "mandatory"],
      ["responsible-party", "Responsible party name and address", "mandatory"],
      ["import-origin", "Imported product origin", "conditional"],
      ["appellation", "Appellation of origin", "conditional"],
      ["foreign-wine-percentage", "Percentage of foreign wine", "conditional"],
      ["composition", "Composition statement", "conditional"],
      ["sulfites", "Sulfites disclosure", "conditional"],
      ["yellow5", "FD&C Yellow No. 5 disclosure", "conditional"],
      [
        "carmine-or-cochineal",
        "Carmine or cochineal disclosure",
        "conditional",
      ],
      ["aspartame", "Aspartame phenylalanine disclosure", "conditional"],
    ].map(([id, title, severity]) =>
      rule({
        id: `wine.${id}`,
        title,
        description: `${title} must be present and agree with the application when required.`,
        profiles: ["faa_wine"],
        severity: severity as "mandatory" | "conditional",
        citation: wineCitation,
      }),
    ),

    ...[
      ["brand-name", "Brand name", "mandatory"],
      ["class-type", "Class/type designation", "mandatory"],
      ["alcohol-content", "Alcohol content", "conditional"],
      ["net-contents", "Net contents", "mandatory"],
      ["responsible-party", "Responsible party name and address", "mandatory"],
      ["import-origin", "Imported product origin", "conditional"],
      ["composition", "Composition statement", "conditional"],
      ["sulfites", "Sulfites disclosure", "conditional"],
      ["yellow5", "FD&C Yellow No. 5 disclosure", "conditional"],
      [
        "carmine-or-cochineal",
        "Carmine or cochineal disclosure",
        "conditional",
      ],
      ["aspartame", "Aspartame phenylalanine disclosure", "conditional"],
    ].map(([id, title, severity]) =>
      rule({
        id: `malt.${id}`,
        title,
        description: `${title} must be present and agree with the application when required.`,
        profiles: ["faa_malt_beverage"],
        severity: severity as "mandatory" | "conditional",
        citation: maltCitation,
      }),
    ),

    rule({
      id: "jurisdiction.irc-wine-under-7",
      title: "Wine below 7 percent alcohol falls outside FAA wine labeling",
      description:
        "Part 4 is not applied automatically. TTB tax/health-warning and applicable FDA labeling require specialist review.",
      profiles: ["irc_wine_under_7"],
      severity: "mandatory",
      automated: false,
      citation: ttb(
        "TTB Label Approval Basics",
        "TTB Label Approval Basics",
        "https://www.ttb.gov/public-information/featured-stories/ttb-label-approval-basics",
      ),
    }),
    rule({
      id: "jurisdiction.irc-beer-non-faa",
      title: "Beer outside the FAA malt-beverage definition",
      description:
        "Part 7 is not applied automatically. TTB tax/health-warning and applicable FDA labeling require specialist review.",
      profiles: ["irc_beer_non_faa"],
      severity: "mandatory",
      automated: false,
      citation: ttb(
        "TTB Label Approval Basics",
        "TTB Label Approval Basics",
        "https://www.ttb.gov/public-information/featured-stories/ttb-label-approval-basics",
      ),
    }),
    rule({
      id: "jurisdiction.classification",
      title: "Product classification requires review",
      description:
        "The product cannot be assigned confidently to a supported regulatory profile from the submitted facts.",
      profiles: ["classification_review"],
      severity: "mandatory",
      automated: false,
      citation: ttb(
        "TTB Label Approval Basics",
        "TTB Label Approval Basics",
        "https://www.ttb.gov/public-information/featured-stories/ttb-label-approval-basics",
      ),
    }),
  ] satisfies RuleDefinition[],
} as const;

export function rulesForProfile(profile: RegulatoryProfile): RuleDefinition[] {
  return ruleset.rules.filter((item) => item.profiles.includes(profile));
}

export function findRule(id: string): RuleDefinition {
  const found = ruleset.rules.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown compliance rule: ${id}`);
  return found;
}
