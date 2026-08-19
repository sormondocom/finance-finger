/**
 * Converts public/icons/icon.svg to PNG at each size Chrome requires.
 * Renders at the target density so the SVG vector is rasterized cleanly
 * rather than scaled up from a small raster.
 *
 * Run via: npm run prebuild:chrome (auto-invoked before build:chrome)
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icons/icon.svg');
const outDir = resolve(__dirname, '../public/icons');

const svgBuffer = readFileSync(svgPath);

// SVG natural size at 96 DPI is 48×48 (matches viewBox="0 0 48 48")
const SVG_NATURAL_PX = 48;
const BASE_DPI = 96;

const sizes = [16, 32, 48, 128];

mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const density = Math.ceil(BASE_DPI * (size / SVG_NATURAL_PX));
  const outPath = resolve(outDir, `icon-${size}.png`);

  await sharp(svgBuffer, { density })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`  icon-${size}.png`);
}

console.log('Chrome icons generated.');
