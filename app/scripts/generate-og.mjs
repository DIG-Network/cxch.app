// Regenerates app/public/og.png (the 1200x630 social card).
//
// The card is defined as the SVG below and rasterized with @resvg/resvg-js so
// it can be regenerated deterministically when the copy changes. Run with:
//   node scripts/generate-og.mjs        (from the app/ directory)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../public/og.png");

const BG = "#0b0f17";
const ACCENT = "#3fb950";
const ACCENT_DIM = "#2ea043";
const FG = "#f0f6fc";
const MUTED = "#8b949e";
const FONT = "Arial, 'Segoe UI', sans-serif";

// Three feature chips — text centered within generously-sized rounded rects.
const chips = [
  { x: 80, w: 224, label: "1:1-backed" },
  { x: 328, w: 300, label: "Permissionless" },
  { x: 652, w: 432, label: "Consensus-enforced peg" },
];
const chipSvg = chips
  .map(
    ({ x, w, label }) => `
    <rect x="${x}" y="412" width="${w}" height="58" rx="29" fill="none" stroke="${ACCENT_DIM}" stroke-width="2.5"/>
    <text x="${x + w / 2}" y="441" font-family="${FONT}" font-size="30" font-weight="600" fill="${ACCENT}" text-anchor="middle" dominant-baseline="central">${label}</text>`
  )
  .join("");

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <polygon points="262,165 221,236 139,236 98,165 139,94 221,94" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linejoin="round"/>
  <text x="180" y="165" font-family="${FONT}" font-size="92" font-weight="700" fill="${ACCENT}" text-anchor="middle" dominant-baseline="central">c</text>
  <text x="300" y="178" font-family="${FONT}" font-size="126" font-weight="700" fill="${FG}" text-anchor="start">cXCH</text>
  <text x="305" y="248" font-family="${FONT}" font-size="54" font-weight="600" fill="${ACCENT}" text-anchor="start">Wrapped XCH on Chia</text>
  <text x="80" y="356" font-family="${FONT}" font-size="40" font-weight="500" fill="#e6edf3" text-anchor="start">Wrap XCH into a 1:1-backed CAT2 token — and melt it back.</text>
  ${chipSvg}
  <text x="80" y="565" font-family="${FONT}" font-size="32" font-weight="400" fill="${MUTED}" text-anchor="start">XCH embedded in every coin · Powered by Chia</text>
</svg>`;

const resvg = new Resvg(svg, {
  background: BG,
  fitTo: { mode: "width", value: 1200 },
  font: { loadSystemFonts: true },
});
const png = resvg.render().asPng();
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${png.length} bytes)`);
