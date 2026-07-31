import { describe, expect, it } from "vitest";

import { regulatoryProfiles, RULESET_VERSION } from "@/lib/domain";

import { ruleset, rulesForProfile } from "./ruleset";

describe("versioned compliance ruleset", () => {
  it("uses the approved version", () => {
    expect(ruleset.version).toBe(RULESET_VERSION);
    expect(ruleset.version).toBe("2026-07-31.1");
  });

  it("has unique stable rule identifiers and official citations", () => {
    const ids = ruleset.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const rule of ruleset.rules) {
      expect(rule.citation.url).toMatch(
        /^https:\/\/(www\.)?(ecfr\.gov|ttb\.gov)\//,
      );
      expect(rule.citation.citation).not.toBe("");
      expect(rule.citation.accessedOn).toBe("2026-07-31");
    }
  });

  it.each(regulatoryProfiles)("covers profile %s", (profile) => {
    const rules = rulesForProfile(profile);
    expect(rules.length).toBeGreaterThan(4);
    expect(rules.some((rule) => rule.id === "warning.exact-text")).toBe(true);
  });

  it("never represents an assessment as a legal approval", () => {
    expect(JSON.stringify(ruleset).toLowerCase()).not.toContain("ttb approved");
    expect(JSON.stringify(ruleset).toLowerCase()).not.toContain(
      "legal approval",
    );
  });
});
