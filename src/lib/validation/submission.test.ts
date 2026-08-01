import { describe, expect, it } from "vitest";

import {
  demoRequestSchema,
  manualApplicationData,
  parseAbv,
  parseManifest,
  parseNetContents,
} from "@/lib/validation/submission";

const HEADER =
  "application_id,label_filename,panel_type,regulatory_profile,brand_name,class_type,abv,net_contents,responsible_name,responsible_address,country_of_origin,imported";

function row(index: number, filename = `label-${index}.png`) {
  return `APP-${index},${filename},front,faa_distilled_spirits,Brand ${index},Bourbon Whiskey,45,750 mL,Example Bottler,Lexington KY,,false`;
}

describe("submission value parsing", () => {
  it("accepts only the twenty generated unseen-image benchmark variants", () => {
    expect(
      demoRequestSchema.parse({
        scenarioId: "compliant-bourbon",
        performanceVariant: 20,
      }).performanceVariant,
    ).toBe(20);
    expect(() => demoRequestSchema.parse({ performanceVariant: 21 })).toThrow();
  });

  it("parses alcohol percentages and rejects values outside the legal range", () => {
    expect(parseAbv("45% Alc./Vol.")).toBe(45);
    expect(parseAbv("")).toBeUndefined();
    expect(() => parseAbv("101%")).toThrow("INVALID_ABV");
    expect(() => parseAbv("not a number")).toThrow("INVALID_ABV");
  });

  it.each([
    ["750 mL", { unit: "mL", value: 750 }],
    ["0.75 L", { unit: "L", value: 0.75 }],
    ["25.4 fl. oz.", { unit: "fl_oz", value: 25.4 }],
    ["1 fluid ounce", { unit: "fl_oz", value: 1 }],
  ])("parses supported net contents %s", (input, expected) => {
    expect(parseNetContents(input)).toEqual(expected);
  });

  it("rejects net contents without a supported unit", () => {
    expect(() => parseNetContents("one bottle")).toThrow(
      "INVALID_NET_CONTENTS",
    );
  });

  it("builds a typed imported application from manual fields", () => {
    expect(
      manualApplicationData({
        abv: "13.5%",
        brandName: "Côte House",
        classType: "Red Wine",
        countryOfOrigin: "France",
        imported: true,
        netContents: "750 mL",
        producerAddress: "New York, NY",
        producerName: "Imported by Example Imports",
        profile: "faa_wine",
        appellation: "Bordeaux",
        appellationRequired: true,
        containsSulfites: true,
      }),
    ).toMatchObject({
      alcoholByVolume: 13.5,
      beverageFamily: "wine",
      countryOfOrigin: "France",
      declarations: {
        appellationRequired: true,
        containsSulfites: true,
        imported: true,
      },
      profile: "faa_wine",
      appellation: "Bordeaux",
    });
  });
});

describe("batch manifest parsing", () => {
  it("handles UTF-8 BOM, quoted commas, and repeated multi-panel applications", () => {
    const manifest = parseManifest(
      `\uFEFF${HEADER}\n` +
        'APP-1,"front,one.png",front,faa_wine,"Côte, House",Red Wine,13.5,750 mL,Example Winery,"Napa, CA",,false\n' +
        'APP-1,back-one.png,back,faa_wine,"Côte, House",Red Wine,13.5,750 mL,Example Winery,"Napa, CA",,false',
    );
    expect(manifest).toHaveLength(1);
    expect(manifest[0].application.brandName).toBe("Côte, House");
    expect(manifest[0].artwork).toEqual([
      { filename: "front,one.png", panelType: "front" },
      { filename: "back-one.png", panelType: "back" },
    ]);
  });

  it("accepts exactly 300 applications", () => {
    const text = [
      HEADER,
      ...Array.from({ length: 300 }, (_, i) => row(i + 1)),
    ].join("\n");
    expect(parseManifest(text)).toHaveLength(300);
  });

  it("rejects 301 applications", () => {
    const text = [
      HEADER,
      ...Array.from({ length: 301 }, (_, i) => row(i + 1)),
    ].join("\n");
    expect(() => parseManifest(text)).toThrow("BATCH_TOO_LARGE");
  });

  it("rejects duplicate artwork mappings and malformed rows", () => {
    expect(() => parseManifest(`${HEADER}\n${row(1)}\n${row(1)}`)).toThrow(
      "DUPLICATE_FILE",
    );
    expect(() =>
      parseManifest(
        `${HEADER}\nAPP-1,label.png,invalid,faa_wine,Brand,Wine,12,750 mL,Winery,Napa CA,,false`,
      ),
    ).toThrow("INVALID_PANEL");
    expect(() =>
      parseManifest(
        `${HEADER}\n${row(1)}\n${row(1, "second.png").replace("Brand 1", "Different Brand")}`,
      ),
    ).toThrow("CONFLICTING_APPLICATION");
  });

  it("rejects unclosed quoted fields and missing headers", () => {
    expect(() => parseManifest(`${HEADER}\n"APP-1,label.png`)).toThrow(
      "CSV_UNCLOSED_QUOTE",
    );
    expect(() =>
      parseManifest("application_id,label_filename\nA,a.png"),
    ).toThrow("CSV_MISSING_PANEL_TYPE");
  });
});
