import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

const MAX_PIXELS = 40_000_000;

const extensionTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function declaredMimeType(name: string, type: string): string {
  if (type.trim()) return type.toLowerCase();
  return (
    extensionTypes[name.split(".").at(-1)?.toLowerCase() ?? ""] ??
    "application/octet-stream"
  );
}

export interface InspectedArtifact {
  height?: number;
  mimeType: string;
  sha256: string;
  width?: number;
}

export async function inspectArtifact(
  buffer: Buffer,
  input: {
    filename: string;
    purpose: "label_artwork" | "application_document";
  },
): Promise<InspectedArtifact> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  if (
    buffer.length >= 16 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-" &&
    buffer
      .subarray(Math.max(0, buffer.length - 1_024))
      .includes(Buffer.from("%%EOF"))
  )
    return { mimeType: "application/pdf", sha256 };

  try {
    const metadata = await sharp(buffer, {
      failOn: "warning",
      limitInputPixels: MAX_PIXELS,
    }).metadata();
    const mimeType =
      metadata.format === "jpeg"
        ? "image/jpeg"
        : metadata.format === "png"
          ? "image/png"
          : metadata.format === "webp"
            ? "image/webp"
            : undefined;
    if (mimeType && metadata.width && metadata.height)
      return {
        height: metadata.height,
        mimeType,
        sha256,
        width: metadata.width,
      };
  } catch {
    // Continue to restricted document formats below.
  }

  if (input.purpose === "application_document") {
    const extension = input.filename.split(".").at(-1)?.toLowerCase();
    if (
      extension === "txt" &&
      !buffer.includes(0) &&
      new TextDecoder("utf-8", { fatal: true }).decode(buffer).trim()
    )
      return { mimeType: "text/plain", sha256 };
    if (
      extension === "docx" &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer.includes(Buffer.from("word/"))
    )
      return {
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sha256,
      };
    if (
      extension === "doc" &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    )
      return { mimeType: "application/msword", sha256 };
  }
  throw new Error("INVALID_ARTIFACT_CONTENT");
}
