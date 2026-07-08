// Generates PWA icons from an inline SVG (shield-check on brand blue) via sharp.
// Outputs: src/app/icon.png + apple-icon.png (Next auto-links these) and
// public/icon-192.png, icon-512.png, icon-maskable-512.png (referenced by the manifest).
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BRAND = "#1f8fff";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BRAND}"/>
  <g transform="translate(106,106) scale(12.5)" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  </g>
</svg>`;
const buf = Buffer.from(svg);

mkdirSync("public", { recursive: true });
mkdirSync("src/app", { recursive: true });

await sharp(buf).resize(512, 512).png().toFile("src/app/icon.png");
await sharp(buf).resize(180, 180).png().toFile("src/app/apple-icon.png");
await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(buf).resize(512, 512).png().toFile("public/icon-maskable-512.png");

console.log("PWA icons generated.");
