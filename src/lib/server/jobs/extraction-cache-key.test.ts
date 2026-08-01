import { describe, expect, it } from "vitest";

import type { ApplicationData } from "@/lib/domain";

import { createExtractionCacheKey } from "./extraction-cache-key";

const application: ApplicationData = {
  profile: "faa_wine",
  beverageFamily: "wine",
  brandName: "Cache Test",
  classType: "Red Wine",
  alcoholByVolume: 13,
  netContents: { value: 750, unit: "mL" },
  responsibleParty: { name: "Cache Cellars", address: "Napa, CA" },
};

function key(
  overrides: Partial<Parameters<typeof createExtractionCacheKey>[0]> = {},
) {
  return createExtractionCacheKey({
    application,
    artwork: [{ panelType: "front", sha256: "a".repeat(64) }],
    model: "gpt-test",
    promptVersion: "prompt.1",
    scopeId: "session-one",
    strategyVersion: "strategy.1",
    ...overrides,
  });
}

describe("extraction cache key", () => {
  it("is stable for identical ordered inputs", () => {
    expect(key()).toBe(key());
    expect(key()).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    { scopeId: "session-two" },
    { model: "gpt-other" },
    { promptVersion: "prompt.2" },
    { strategyVersion: "strategy.2" },
    { application: { ...application, brandName: "Changed" } },
    { artwork: [{ panelType: "back", sha256: "a".repeat(64) }] },
    { artwork: [{ panelType: "front", sha256: "b".repeat(64) }] },
  ])(
    "invalidates on version, scope, application, panel, or content changes",
    (change) => {
      expect(key(change)).not.toBe(key());
    },
  );

  it("preserves ordered multi-panel identity", () => {
    const front = { panelType: "front", sha256: "a".repeat(64) };
    const back = { panelType: "back", sha256: "b".repeat(64) };
    expect(key({ artwork: [front, back] })).not.toBe(
      key({ artwork: [back, front] }),
    );
  });
});
