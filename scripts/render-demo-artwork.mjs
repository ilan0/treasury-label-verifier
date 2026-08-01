import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const demoDirectory = path.join(process.cwd(), "public", "demo");
const files = (await readdir(demoDirectory)).filter((file) =>
  file.endsWith(".svg"),
);

for (const file of files) {
  await sharp(path.join(demoDirectory, file), { density: 180 })
    .resize({ width: 1_000, withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(path.join(demoDirectory, file.replace(/\.svg$/, ".png")));
}

const performanceDirectory = path.join(demoDirectory, "performance");
await mkdir(performanceDirectory, { recursive: true });
const benchmarkSource = await readFile(
  path.join(demoDirectory, "old-tom-bourbon.png"),
);
for (let variant = 1; variant <= 20; variant += 1) {
  const marker = Buffer.from([16 + variant, 32 + variant, 48 + variant, 255]);
  await sharp(benchmarkSource)
    .composite([
      {
        input: marker,
        raw: { width: 1, height: 1, channels: 4 },
        left: variant,
        top: 0,
      },
    ])
    .jpeg({ quality: 88, mozjpeg: false })
    .toFile(
      path.join(
        performanceDirectory,
        `old-tom-${String(variant).padStart(2, "0")}.jpg`,
      ),
    );
}

console.log(
  `Rendered ${files.length} user demo labels and 20 unique benchmark rasters.`,
);
