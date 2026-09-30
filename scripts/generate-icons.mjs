import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

/**
 * Render the app icons from the logo.
 *
 * Run by hand when the logo changes: `node scripts/generate-icons.mjs`. The
 * PNGs are committed rather than generated during the build, so the build does
 * not depend on an image library being installable on the CI machine.
 *
 * The logo is the "Swords" icon from Lucide (ISC licence, © Lucide
 * Contributors), the same one the header shows next to the name.
 */

/** Lucide's Swords, on its native 24×24 grid. */
const SWORDS = `
  <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
  <line x1="13" x2="19" y1="19" y2="13"/>
  <line x1="16" x2="20" y1="16" y2="20"/>
  <line x1="19" x2="21" y1="21" y2="19"/>
  <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/>
  <line x1="5" x2="9" y1="14" y2="18"/>
  <line x1="7" x2="4" y1="17" y2="20"/>
  <line x1="3" x2="5" y1="19" y2="21"/>`;

/** The dark theme's background, oklch(0.245 0 0), in sRGB. */
const BACKGROUND = "#202020";
const INK = "#f5f5f5";

/**
 * @param size Output edge length in pixels.
 * @param coverage Share of the edge the logo spans.
 * @param radius Corner radius as a share of the edge; 0 for full bleed.
 */
function svg(size, coverage, radius) {
  const span = size * coverage;
  const offset = (size - span) / 2;
  const scale = span / 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * radius}" fill="${BACKGROUND}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${INK}"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SWORDS}</g>
  </svg>`;
}

const ICONS = [
  // Shown as drawn, so the rounding is part of the image.
  { file: "public/icons/icon-192.png", size: 192, coverage: 0.62, radius: 0.22 },
  { file: "public/icons/icon-512.png", size: 512, coverage: 0.62, radius: 0.22 },
  // Maskable: the platform cuts its own shape, keeping only a central circle
  // 80% of the edge across. Full bleed, and the logo small enough to survive
  // the tightest cut.
  { file: "public/icons/icon-maskable-512.png", size: 512, coverage: 0.5, radius: 0 },
  // iOS rounds the corners itself and shows transparency as black.
  { file: "src/app/apple-icon.png", size: 180, coverage: 0.58, radius: 0 },
];

await mkdir(join(process.cwd(), "public", "icons"), { recursive: true });

for (const icon of ICONS) {
  await sharp(Buffer.from(svg(icon.size, icon.coverage, icon.radius)))
    .png()
    .toFile(join(process.cwd(), icon.file));
  console.log(`wrote ${icon.file}`);
}
