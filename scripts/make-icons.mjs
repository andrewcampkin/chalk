import sharp from "sharp";
import { mkdirSync } from "fs";

/**
 * Chalk's mark is a tally group — four strokes and a diagonal.
 *
 * It is the oldest way of recording "I did this, again", which is the whole
 * app. Strokes are drawn slightly off-vertical with uneven ends so it reads as
 * chalk on slate rather than a clean vector, and it stays legible at 48dp.
 */

const BG = "#12100E";
const CHALK = "#F5C542";

/** @param {number} size @param {number} inset fraction of the canvas left as margin */
function mark(size, inset, withBg) {
  const s = size;
  const w = s * (1 - inset * 2);
  const x0 = s * inset;
  const cy = s / 2;
  const h = w * 0.62;
  const top = cy - h / 2;
  const bot = cy + h / 2;
  const stroke = Math.max(2, w * 0.075);

  // Four uprights, each leaning a touch differently.
  const leans = [0.035, -0.02, 0.028, -0.03];
  const gap = w / 5.1;
  const uprights = leans
    .map((lean, i) => {
      const x = x0 + gap * (i + 0.55);
      const dx = w * lean;
      return `<line x1="${x - dx}" y1="${top}" x2="${x + dx}" y2="${bot}" />`;
    })
    .join("");

  // The fifth stroke, crossing them.
  const dx = gap * 0.25;
  const diagonal = `<line x1="${x0 + gap * 0.2 - dx}" y1="${bot - h * 0.14}" x2="${
    x0 + gap * 4.0 + dx
  }" y2="${top + h * 0.12}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${withBg ? `<rect width="${s}" height="${s}" fill="${BG}"/>` : ""}
    <g stroke="${CHALK}" stroke-width="${stroke}" stroke-linecap="round" fill="none" opacity="0.97">
      ${uprights}${diagonal}
    </g>
  </svg>`;
}

function splash(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    ${mark(size, 0.3, false).replace(/^<svg[^>]*>|<\/svg>$/g, "")}
  </svg>`;
}

mkdirSync("assets", { recursive: true });

const jobs = [
  ["assets/icon.png", mark(1024, 0.16, true), 1024],
  // Android masks the adaptive foreground; keep art inside the middle ~66%.
  ["assets/adaptive-icon.png", mark(1024, 0.28, false), 1024],
  ["assets/splash.png", splash(1284), 1284],
  ["assets/favicon.png", mark(64, 0.14, true), 64],
];

for (const [out, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log("wrote", out);
}
