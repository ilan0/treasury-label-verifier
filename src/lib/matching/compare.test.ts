import { describe, expect, it } from "vitest";

import {
  canonicalizeAddress,
  canonicalizeClassType,
  canonicalizeCountry,
  canonicalizeText,
  characterSimilarity,
  compareAddress,
  compareClassType,
  compareCountry,
  compareNetContents,
  compareNumber,
  compareText,
  formatNetContents,
  tokenSimilarity,
  volumeInMilliliters,
} from "./index";

describe("deterministic text matching", () => {
  it("treats the stakeholder punctuation/casing example as equivalent", () => {
    expect(
      compareText("Stone's Throw", {
        value: "STONE’S THROW",
        confidence: 0.98,
      }),
    ).toMatchObject({ kind: "equivalent", confidence: 0.98 });
  });

  it("does not silently pass a merely similar brand", () => {
    expect(
      compareText("Old Tom Distillery", {
        value: "Old Tom Distilling",
        confidence: 0.96,
      }).kind,
    ).toBe("review");
  });

  it("normalizes Unicode and ampersands deterministically", () => {
    expect(canonicalizeText("Café & Sons™")).toBe("cafe and sons");
  });

  it("recognizes whisky spelling aliases", () => {
    expect(
      compareClassType("Straight Bourbon Whiskey", {
        value: "straight bourbon whisky",
        confidence: 0.95,
      }).kind,
    ).toBe("equivalent");
  });

  it("recognizes common country aliases", () => {
    expect(
      compareCountry("United States", { value: "U.S.A.", confidence: 0.99 })
        .kind,
    ).toBe("equivalent");
  });

  it("normalizes postal state abbreviations in responsible-party addresses", () => {
    expect(
      compareAddress("Frankfort, Kentucky", {
        value: "Frankfort, KY",
        confidence: 0.98,
      }).kind,
    ).toBe("equivalent");
  });

  it("returns bounded token similarity", () => {
    expect(tokenSimilarity("one two", "one three")).toBe(0.5);
    expect(tokenSimilarity("", "")).toBe(1);
    expect(tokenSimilarity("one", "")).toBe(0);
    expect(characterSimilarity("same", "same")).toBe(1);
    expect(characterSimilarity("", "value")).toBe(0);
  });

  it("covers known and unknown canonical aliases", () => {
    expect(canonicalizeClassType("bourbon")).toBe("bourbon whisky");
    expect(canonicalizeClassType("gin")).toBe("gin");
    expect(canonicalizeCountry("Canada")).toBe("canada");
    expect(canonicalizeAddress("Portland, OR")).toBe("portland oregon");
  });

  it("distinguishes exact, missing, and mismatched plain text", () => {
    expect(compareText("Exact", { value: "Exact", confidence: 1 }).kind).toBe(
      "exact",
    );
    expect(compareText("Expected", undefined).kind).toBe("missing");
    expect(
      compareText("Old Tom Distillery", {
        value: "Completely Different",
        confidence: 0.9,
      }).kind,
    ).toBe("mismatch");
  });

  it("covers exact, missing, and mismatch address/country outcomes", () => {
    expect(
      compareAddress("Austin, Texas", {
        value: "Austin, Texas",
        confidence: 1,
      }).kind,
    ).toBe("exact");
    expect(compareAddress("Austin, Texas", undefined).kind).toBe("missing");
    expect(
      compareAddress("Austin, Texas", {
        value: "Paris, France",
        confidence: 1,
      }).kind,
    ).toBe("mismatch");
    expect(compareCountry("Canada", undefined).kind).toBe("missing");
    expect(
      compareCountry("Canada", { value: "Canada", confidence: 1 }).kind,
    ).toBe("exact");
    expect(
      compareCountry("Canada", { value: "Mexico", confidence: 1 }).kind,
    ).toBe("mismatch");
    expect(compareClassType("Gin", undefined).kind).toBe("missing");
  });
});

describe("numeric matching", () => {
  it("compares ABV within parse precision", () => {
    expect(
      compareNumber(45, { value: 45.01, confidence: 0.98 }, { label: "ABV" })
        .kind,
    ).toBe("exact");
    expect(
      compareNumber(45, { value: 46, confidence: 0.98 }, { label: "ABV" }).kind,
    ).toBe("mismatch");
  });

  it("recognizes equivalent metric net contents", () => {
    expect(
      compareNetContents(
        { value: 750, unit: "mL" },
        { value: { value: 0.75, unit: "L" }, confidence: 0.99 },
      ).kind,
    ).toBe("equivalent");
  });

  it("rejects materially different net contents", () => {
    expect(
      compareNetContents(
        { value: 750, unit: "mL" },
        { value: { value: 700, unit: "mL" }, confidence: 0.99 },
      ).kind,
    ).toBe("mismatch");
  });

  it("covers exact/missing volumes and conversion factors", () => {
    expect(
      compareNetContents(
        { value: 750, unit: "mL" },
        { value: { value: 750, unit: "mL" }, confidence: 1 },
      ).kind,
    ).toBe("exact");
    expect(compareNetContents({ value: 750, unit: "mL" }, undefined).kind).toBe(
      "missing",
    );
    expect(volumeInMilliliters({ value: 1, unit: "fl_oz" })).toBeCloseTo(
      29.5735,
    );
    expect(volumeInMilliliters({ value: 1, unit: "pt" })).toBeCloseTo(473.176);
    expect(volumeInMilliliters({ value: 1, unit: "qt" })).toBeCloseTo(946.353);
    expect(volumeInMilliliters({ value: 1, unit: "gal" })).toBeCloseTo(
      3785.412,
    );
    expect(formatNetContents({ value: 12, unit: "fl_oz" })).toBe("12 fl oz");
  });

  it("returns missing number evidence", () => {
    expect(compareNumber(45, undefined).kind).toBe("missing");
    expect(compareNumber(45, { value: Number.NaN, confidence: 1 }).kind).toBe(
      "missing",
    );
  });
});
