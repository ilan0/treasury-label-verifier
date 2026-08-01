import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { getDemoScenario } from "@/lib/demo/scenarios";
import {
  canonicalizeText,
  compareNetContents,
  normalizeWhitespace,
} from "@/lib/matching";
import { asDataUrl } from "@/lib/server/preprocess/image";

import { extractLabelArtwork } from "./extract";

const enabled = process.env.RUN_LIVE_OPENAI_BAKEOFF === "1";
const candidates = (process.env.OPENAI_BAKEOFF_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

async function uniqueArtwork(file: string, marker: number) {
  const original = await readFile(path.join(process.cwd(), "public", file));
  const data = await sharp(original)
    .extend({
      top: 0,
      bottom: marker + 1,
      left: 0,
      right: 0,
      background: { r: 255, g: 255 - marker, b: 255, alpha: 1 },
    })
    .jpeg({ quality: 88, mozjpeg: false })
    .toBuffer();
  return asDataUrl(data, "image/jpeg");
}

describe.skipIf(!enabled)("live OpenAI latency bake-off", () => {
  it.each(candidates)(
    "screens %s on three verified labels",
    async (model) => {
      const ids = (
        process.env.OPENAI_BAKEOFF_SCENARIOS ??
        "compliant-bourbon,warning-format,imported-wine"
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const rows = [];
      for (const [index, id] of ids.entries()) {
        const scenario = getDemoScenario(id)!;
        const result = await extractLabelArtwork(
          [
            {
              dataUrl: await uniqueArtwork(
                scenario.artworkPath.replace("/demo/", "demo/"),
                index,
              ),
              detail: "high",
              panel: "front",
            },
          ],
          {
            application: scenario.application,
            model,
            serviceTier:
              process.env.OPENAI_BAKEOFF_TIER === "priority"
                ? "priority"
                : "default",
            strategy: "compact",
          },
        );
        const observed = result.observation;
        const expected = scenario.observation;
        expect
          .soft(canonicalizeText(String(observed.brandName?.value ?? "")))
          .toBe(canonicalizeText(String(expected.brandName?.value ?? "")));
        expect
          .soft(canonicalizeText(String(observed.classType?.value ?? "")))
          .toBe(canonicalizeText(String(expected.classType?.value ?? "")));
        expect
          .soft(canonicalizeText(String(observed.responsibleName?.value ?? "")))
          .toBe(
            canonicalizeText(String(expected.responsibleName?.value ?? "")),
          );
        expect
          .soft(
            canonicalizeText(String(observed.responsibleAddress?.value ?? "")),
          )
          .toBe(
            canonicalizeText(String(expected.responsibleAddress?.value ?? "")),
          );
        expect
          .soft(canonicalizeText(String(observed.responsibleRole?.value ?? "")))
          .toBe(
            canonicalizeText(String(expected.responsibleRole?.value ?? "")),
          );
        if (expected.alcoholByVolume?.value != null) {
          expect
            .soft(observed.alcoholByVolume?.value ?? Number.NaN)
            .toBeCloseTo(expected.alcoholByVolume.value, 2);
        }
        expect
          .soft(["exact", "equivalent"])
          .toContain(
            compareNetContents(
              scenario.application.netContents,
              observed.netContents,
            ).kind,
          );
        expect
          .soft(normalizeWhitespace(observed.healthWarning?.text ?? ""))
          .toBe(normalizeWhitespace(expected.healthWarning?.text ?? ""));
        expect
          .soft(observed.healthWarning?.headingAllCaps)
          .toBe(expected.healthWarning?.headingAllCaps);
        rows.push({
          id,
          input: (result.usage as { input_tokens?: number }).input_tokens ?? 0,
          latencyMs: result.latencyMs,
          output:
            (result.usage as { output_tokens?: number }).output_tokens ?? 0,
          tier: result.serviceTier,
          warningExact:
            normalizeWhitespace(observed.healthWarning?.text ?? "") ===
            normalizeWhitespace(expected.healthWarning?.text ?? ""),
        });
      }
      // Deliberately sanitized: no provider payloads, artwork, or credentials.
      process.stdout.write(`${JSON.stringify({ model, rows })}\n`);
    },
    90_000,
  );
});
