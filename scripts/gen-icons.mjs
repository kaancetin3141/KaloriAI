/**
 * PWA icon generator — rasterizes public/icon.svg into PNG icons.
 * Usage: bun scripts/gen-icons.mjs
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const svgPath = resolve(root, "public/icon.svg");
const svgBuffer = readFileSync(svgPath);

async function makePng(size, out, { maskable = false } = {}) {
  // For maskable icons, add ~10% safe-zone padding on a solid background
  const pad = maskable ? Math.round(size * 0.1) : 0;
  const inner = size - pad * 2;
  const base = maskable
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#f7faf5"/></svg>`
      )
    : null;
  const icon = await sharp(svgBuffer)
    .resize(inner, inner)
    .png()
    .toBuffer();

  let pipeline;
  if (maskable && base) {
    pipeline = sharp(base).composite([
      { input: icon, left: pad, top: pad },
    ]);
  } else {
    pipeline = sharp(icon);
  }
  await pipeline.png().toFile(out);
  console.log(`✓ ${out} (${size}x${size}${maskable ? " maskable" : ""})`);
}

await makePng(192, resolve(root, "public/icon-192.png"));
await makePng(512, resolve(root, "public/icon-512.png"));
await makePng(512, resolve(root, "public/icon-maskable-512.png"), { maskable: true });
await makePng(180, resolve(root, "public/apple-touch-icon.png"));

// favicon fallback (32x32)
await sharp(svgBuffer).resize(32, 32).png().toFile(resolve(root, "public/favicon-32.png"));
console.log("✓ favicon-32.png");
