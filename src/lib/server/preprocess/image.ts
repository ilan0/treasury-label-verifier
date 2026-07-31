import "server-only";

import sharp from "sharp";

const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 2_400;

export interface NormalizedImage {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export async function normalizeArtwork(
  buffer: Buffer,
): Promise<NormalizedImage> {
  const original = await sharp(buffer, {
    failOn: "warning",
    limitInputPixels: MAX_PIXELS,
  }).metadata();
  if (!original.width || !original.height) throw new Error("INVALID_IMAGE");

  const output = sharp(buffer, {
    failOn: "warning",
    limitInputPixels: MAX_PIXELS,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true });
  const { data, info } = await output.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mimeType: "image/jpeg",
    width: info.width,
    height: info.height,
    originalWidth: original.width,
    originalHeight: original.height,
  };
}

export function asDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
