import { readdir } from "node:fs/promises";
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

console.log(`Rendered ${files.length} user demo labels.`);
