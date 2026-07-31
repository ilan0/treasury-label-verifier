import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  declaredMimeType,
  inspectArtifact,
} from "@/lib/server/uploads/inspect";

describe("artifact inspection", () => {
  it("uses extensions only when the browser omits a declared MIME type", () => {
    expect(declaredMimeType("LABEL.PNG", "")).toBe("image/png");
    expect(declaredMimeType("label.png", "image/webp")).toBe("image/webp");
    expect(declaredMimeType("payload.exe", "")).toBe(
      "application/octet-stream",
    );
  });

  it("decodes image bytes instead of trusting the filename", async () => {
    const png = await sharp({
      create: {
        background: "#ffffff",
        channels: 3,
        height: 12,
        width: 20,
      },
    })
      .png()
      .toBuffer();
    await expect(
      inspectArtifact(png, {
        filename: "renamed.jpg",
        purpose: "label_artwork",
      }),
    ).resolves.toMatchObject({ height: 12, mimeType: "image/png", width: 20 });
  });

  it("rejects executable bytes renamed as artwork", async () => {
    await expect(
      inspectArtifact(Buffer.from("MZ malicious payload"), {
        filename: "label.png",
        purpose: "label_artwork",
      }),
    ).rejects.toThrow("INVALID_ARTIFACT_CONTENT");
  });

  it("requires both a PDF header and terminal marker", async () => {
    await expect(
      inspectArtifact(Buffer.from("%PDF-1.7\nnot actually complete"), {
        filename: "form.pdf",
        purpose: "application_document",
      }),
    ).rejects.toThrow("INVALID_ARTIFACT_CONTENT");
    await expect(
      inspectArtifact(Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF"), {
        filename: "form.pdf",
        purpose: "application_document",
      }),
    ).resolves.toMatchObject({ mimeType: "application/pdf" });
  });

  it("allows non-empty valid UTF-8 text only for application documents", async () => {
    const text = Buffer.from("Brand Name: OLD TOM DISTILLERY");
    await expect(
      inspectArtifact(text, {
        filename: "application.txt",
        purpose: "application_document",
      }),
    ).resolves.toMatchObject({ mimeType: "text/plain" });
    await expect(
      inspectArtifact(text, {
        filename: "label.txt",
        purpose: "label_artwork",
      }),
    ).rejects.toThrow("INVALID_ARTIFACT_CONTENT");
  });
});
