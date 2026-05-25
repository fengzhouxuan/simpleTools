import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const rootDir = new URL("..", import.meta.url);
const buildDir = path.join(rootDir.pathname, "build");
const iconsetDir = path.join(buildDir, "icon.iconset");
const svgPath = path.join(buildDir, "icon.svg");

const iconSizes = [
  16,
  32,
  64,
  128,
  256,
  512,
  1024,
];

async function ensureSvgAsset() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>
  <rect x="168" y="188" width="688" height="648" rx="136" fill="rgba(15,23,42,0.9)" />
  <rect x="232" y="252" width="560" height="520" rx="104" fill="url(#panel)" stroke="rgba(125,211,252,0.18)" stroke-width="18"/>
  <path d="M350 658L470 390L548 560L632 442L706 658H350Z" fill="#E0F2FE"/>
  <circle cx="385" cy="384" r="44" fill="#67E8F9"/>
  <path d="M300 744C378 682 446 652 504 652C563 652 632 682 712 744" stroke="#38BDF8" stroke-width="42" stroke-linecap="round"/>
  <defs>
    <linearGradient id="bg" x1="134" y1="86" x2="898" y2="980" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38BDF8"/>
      <stop offset="0.55" stop-color="#0F172A"/>
      <stop offset="1" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="panel" x1="232" y1="252" x2="792" y2="772" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F172A"/>
      <stop offset="1" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
</svg>
`;

  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(svgPath, svg, "utf8");
}

async function generatePngs() {
  await fs.rm(iconsetDir, { recursive: true, force: true });
  await fs.mkdir(iconsetDir, { recursive: true });

  for (const size of iconSizes) {
    const baseName = `icon_${size}x${size}.png`;
    const retinaName = `icon_${size}x${size}@2x.png`;
    await sharp(svgPath).resize(size, size).png().toFile(path.join(iconsetDir, baseName));
    if (size < 1024) {
      await sharp(svgPath)
        .resize(size * 2, size * 2)
        .png()
        .toFile(path.join(iconsetDir, retinaName));
    }
  }

  await sharp(svgPath).resize(512, 512).png().toFile(path.join(buildDir, "icon.png"));
}

async function generateIcns() {
  await execFileAsync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(buildDir, "icon.icns")]);
}

async function main() {
  await ensureSvgAsset();
  await generatePngs();
  await generateIcns();
  console.log("Generated app icons in build/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
