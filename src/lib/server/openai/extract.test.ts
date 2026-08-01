import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock("./client", () => ({
  APPLICATION_PROMPT_VERSION: "application-test",
  EXTRACTION_STRATEGY_VERSION: "compact-test",
  LABEL_PROMPT_VERSION: "label-test",
  OPENAI_MODEL: "test-model",
  configuredServiceTier: () => "default",
  getOpenAIClient: () => ({ responses: { parse: mocks.parse } }),
}));

import { extractApplicationDocument, extractLabelArtwork } from "./extract";

const missingText = {
  value: null,
  confidence: 0,
  panel: null,
  rawText: null,
};

const extraction = {
  rawText: "PROOFCHECK 45% Alc./Vol.",
  brandName: {
    value: "PROOFCHECK",
    confidence: 0.98,
    panel: "front" as const,
    rawText: "PROOFCHECK",
  },
  classType: {
    value: "Bourbon Whiskey",
    confidence: 0.97,
    panel: "front" as const,
    rawText: "Bourbon Whiskey",
  },
  alcoholByVolume: {
    value: 45,
    confidence: 0.99,
    panel: "front" as const,
    rawText: "45% Alc./Vol.",
  },
  proof: {
    value: 90,
    confidence: 0.99,
    panel: "front" as const,
    rawText: "90 Proof",
  },
  netContents: {
    value: { value: 750, unit: "mL" as const },
    confidence: 0.99,
    panel: "front" as const,
    rawText: "750 mL",
  },
  responsibleName: missingText,
  responsibleAddress: missingText,
  responsibleRole: missingText,
  countryOfOrigin: missingText,
  appellation: missingText,
  ageStatement: missingText,
  stateOfDistillation: missingText,
  conditionalStatements: {
    sulfites: missingText,
    yellow5: missingText,
    carmine_or_cochineal: missingText,
    aspartame: missingText,
    neutral_spirits: missingText,
    wood_treatment_or_coloring: missingText,
    composition: missingText,
  },
  healthWarning: {
    text: null,
    confidence: 0,
    panel: null,
    headingAllCaps: null,
    headingBold: null,
    continuous: null,
    separateFromOtherInformation: null,
    legible: null,
    contrastingBackground: null,
    measuredTypeSizeMm: null,
  },
  sameFieldOfVision: { brandClassAlcohol: true },
  overallConfidence: 0.97,
  imageQuality: "good" as const,
  qualityNotes: [],
};

describe("OpenAI structured extraction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects empty artwork before contacting the provider", async () => {
    await expect(extractLabelArtwork([])).rejects.toThrow("ARTWORK_REQUIRED");
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("returns an observation from structured label output", async () => {
    mocks.parse.mockResolvedValue({
      model: "resolved-model",
      output_parsed: extraction,
      usage: { input_tokens: 10 },
    });

    const result = await extractLabelArtwork([
      {
        dataUrl: "data:image/png;base64,aW1hZ2U=",
        mimeType: "image/png",
        panel: "front",
      },
    ]);

    expect(result.observation.brandName?.value).toBe("PROOFCHECK");
    expect(result.observation.alcoholByVolume?.value).toBe(45);
    expect(result.model).toBe("resolved-model");
    expect(mocks.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "test-model",
        reasoning: { effort: "none" },
        store: false,
      }),
    );
  });

  it("uses the compact profile-aware wire contract on the worker fast path", async () => {
    mocks.parse.mockResolvedValue({
      model: "fast-model",
      output_parsed: {
        bn: { v: "PROOFCHECK", c: 0.99, p: "front" },
        ct: { v: "Bourbon Whiskey", c: 0.99, p: "front" },
        av: { v: 45, c: 0.99, p: "front", r: "45% Alc./Vol." },
        nc: { v: { a: 750, u: "mL" }, c: 0.99, p: "front", r: "750 mL" },
        rn: { v: "ProofCheck Distilling", c: 0.99, p: "front" },
        ra: { v: "Louisville, KY", c: 0.99, p: "front" },
        rr: { v: "Distilled by", c: 0.99, p: "front" },
        w: {
          t: "GOVERNMENT WARNING: (1) TEST. (2) TEST.",
          c: 0.99,
          p: "front",
          uc: true,
          bd: true,
          ct: true,
          sp: true,
          lg: true,
          bg: true,
          mm: null,
          ml: null,
        },
        sf: true,
        q: 0.99,
        iq: "good",
      },
      service_tier: "default",
      usage: { output_tokens: 220 },
    });

    const result = await extractLabelArtwork(
      [{ dataUrl: "data:image/jpeg;base64,aW1hZ2U=", panel: "front" }],
      {
        application: {
          profile: "faa_distilled_spirits",
          beverageFamily: "distilled_spirits",
          brandName: "PROOFCHECK",
          classType: "Bourbon Whiskey",
          alcoholByVolume: 45,
          netContents: { value: 750, unit: "mL" },
          responsibleParty: {
            name: "ProofCheck Distilling",
            address: "Louisville, KY",
            role: "Distilled by",
          },
        },
        strategy: "compact",
      },
    );

    expect(result.observation.netContents?.value).toEqual({
      value: 750,
      unit: "mL",
    });
    expect(result.strategyVersion).toBe("compact-test");
    expect(result.serviceTier).toBe("default");
    expect(mocks.parse.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        max_output_tokens: 1_500,
        service_tier: "default",
        text: expect.objectContaining({ verbosity: "low" }),
      }),
    );
  });

  it("keeps a MIME-qualified PDF data URI for OpenAI file input", async () => {
    mocks.parse.mockResolvedValue({
      model: "resolved-model",
      output_parsed: extraction,
    });
    const dataUrl = "data:application/pdf;base64,JVBERi0xLjQ=";

    await extractLabelArtwork([
      {
        dataUrl,
        filename: "artwork.pdf",
        mimeType: "application/pdf",
        panel: "front",
      },
    ]);

    const request = mocks.parse.mock.calls[0][0];
    expect(request.input[0].content[1]).toEqual(
      expect.objectContaining({
        file_data: dataUrl,
        filename: "artwork.pdf",
        type: "input_file",
      }),
    );
  });

  it("rejects refusal or malformed structured output", async () => {
    mocks.parse.mockResolvedValue({
      model: "resolved-model",
      output_parsed: null,
    });
    await expect(
      extractLabelArtwork([
        { dataUrl: "data:image/png;base64,eA==", panel: "front" },
      ]),
    ).rejects.toThrow("OPENAI_INVALID_OUTPUT");
  });

  it("propagates provider timeouts for worker retry classification", async () => {
    mocks.parse.mockRejectedValue(new Error("Request timed out"));
    await expect(
      extractLabelArtwork([
        { dataUrl: "data:image/png;base64,eA==", panel: "front" },
      ]),
    ).rejects.toThrow("Request timed out");
  });

  it("passes a MIME-qualified application document and returns its draft", async () => {
    const applicationExtraction = {
      regulatoryProfile: "faa_distilled_spirits" as const,
      beverageFamily: "distilled_spirits" as const,
      brandName: "PROOFCHECK",
      classType: "Bourbon Whiskey",
      alcoholByVolume: 45,
      proof: 90,
      netContentsValue: 750,
      netContentsUnit: "mL" as const,
      responsibleName: null,
      responsibleAddress: null,
      responsibleRole: null,
      countryOfOrigin: null,
      appellation: null,
      ageStatement: null,
      stateOfDistillation: null,
      compositionStatement: null,
      confidence: 0.96,
      warnings: [],
    };
    mocks.parse.mockResolvedValue({
      model: "resolved-model",
      output_parsed: applicationExtraction,
      usage: {},
    });
    const fileData = "data:text/plain;base64,QnJhbmQ6IFBST09GQ0hFQ0s=";

    const result = await extractApplicationDocument({
      fileData,
      filename: "application.txt",
    });

    expect(result.extraction.brandName).toBe("PROOFCHECK");
    const request = mocks.parse.mock.calls[0][0];
    expect(request.input[0].content[1]).toEqual(
      expect.objectContaining({ file_data: fileData, type: "input_file" }),
    );
  });
});
