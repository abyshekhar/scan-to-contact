// Generates every brand-derived image asset from the ScanToContact brand
// mark (camera-viewfinder brackets + person silhouette + scan beam, on the
// app's teal gradient) — app icons, favicons, and the social/OG/README
// share images. Source: the "Contact in the viewfinder" concept from the
// ScanToContact Brand design (Claude Design project fca73faa-eafe-4eca-9cf8-434c7a0452e7).
//
// NOT part of the standard install/build flow — it needs the `canvas`
// package (native compilation), which isn't worth making every contributor
// install just to run `npm install`. All output is committed as static
// assets; only run this again if the brand design changes:
//
//   npm install -D canvas && node scripts/generate-brand-assets.mjs && npm uninstall canvas
import { createCanvas } from "canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const OUT_ICONS = new URL("public/icons/", `file://${root}`).pathname;
const OUT_PUBLIC = new URL("public/", `file://${root}`).pathname;
const OUT_DOCS = new URL("docs/", `file://${root}`).pathname;
mkdirSync(OUT_ICONS, { recursive: true });
mkdirSync(OUT_DOCS, { recursive: true });

const TEAL_LIGHT = "#2dd4bf";
const TEAL_MID = "#0d9488";
const TEAL_DARK = "#0f766e";
const MINT = "#a7f3d0";

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tealGradient(ctx, size) {
  const g = ctx.createLinearGradient(0, 0, size * 0.55, size);
  g.addColorStop(0, TEAL_LIGHT);
  g.addColorStop(0.47, TEAL_MID);
  g.addColorStop(1, TEAL_DARK);
  return g;
}

// Draws the brand mark (camera-bracket viewfinder + person silhouette,
// optionally with the scan-beam bar) into a 100x100 coordinate space that
// has already been scaled onto the canvas via ctx.scale(unit, unit).
function drawGlyph(ctx, { strokeWidth, headRadius, shoulderRadius, withBeam, strokeColor, fillColor, beamColor }) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;

  // Four L-shaped viewfinder corner brackets, each a moveTo + rounded
  // corner (arcTo) + line, matching the source SVG's arc-based corners.
  const brackets = [
    [12, 32, 12, 12, 32, 12], // top-left
    [68, 12, 88, 12, 88, 32], // top-right
    [88, 68, 88, 88, 68, 88], // bottom-right
    [32, 88, 12, 88, 12, 68], // bottom-left
  ];
  for (const [sx, sy, cx, cy, ex, ey] of brackets) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arcTo(cx, cy, ex, ey, 7);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Scan beam bar, behind the silhouette.
  if (withBeam) {
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = beamColor;
    roundRectPath(ctx, 18, 28.5, 64, 5, 2.5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Person silhouette: head (circle) + shoulders (upper half of a circle).
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.arc(50, 48.5, headRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(50, 88, shoulderRadius, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

const STANDARD_GLYPH = {
  strokeWidth: 7,
  headRadius: 10.5,
  shoulderRadius: 19,
  withBeam: true,
  strokeColor: "#ffffff",
  fillColor: "#ffffff",
  beamColor: MINT,
};

// Used at favicon sizes: no beam (it disappears at small sizes anyway),
// thicker strokes and a slightly bigger silhouette so it still reads at 16px.
const FAVICON_GLYPH = {
  strokeWidth: 9,
  headRadius: 12,
  shoulderRadius: 20,
  withBeam: false,
  strokeColor: "#ffffff",
  fillColor: "#ffffff",
  beamColor: MINT,
};

// --- app icons: rounded-square, gradient background, full glyph ----------
function makeAppIcon(size, outPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  roundRectPath(ctx, 0, 0, size, size, size * 0.224);
  ctx.fillStyle = tealGradient(ctx, size);
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, 0, 0, size, size, size * 0.224);
  ctx.clip();
  ctx.scale(size / 100, size / 100);
  drawGlyph(ctx, STANDARD_GLYPH);
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${size}x${size})`);
}

// --- maskable icons: plain full-bleed square, glyph inset to the ~62%     --
// safe zone so aggressive OS masking (circle, squircle, etc.) never clips it.
function makeMaskableIcon(size, outPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = tealGradient(ctx, size);
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  const scale = (size / 100) * 0.62;
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  drawGlyph(ctx, STANDARD_GLYPH);
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${size}x${size})`);
}

// --- apple touch icon: plain square (iOS applies its own corner mask —    --
// pre-rounding here would double up), full glyph, no transparency.
function makeAppleTouchIcon(size, outPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = tealGradient(ctx, size);
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / 100, size / 100);
  drawGlyph(ctx, STANDARD_GLYPH);
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${size}x${size})`);
}

// --- favicon PNGs: solid background, simplified glyph ---------------------
function makeFaviconPng(size, outPath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  roundRectPath(ctx, 0, 0, size, size, size * 0.22);
  ctx.fillStyle = TEAL_MID;
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, 0, 0, size, size, size * 0.22);
  ctx.clip();
  ctx.scale(size / 100, size / 100);
  drawGlyph(ctx, FAVICON_GLYPH);
  ctx.restore();
  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${size}x${size})`);
}

makeAppIcon(192, `${OUT_ICONS}icon-192.png`);
makeAppIcon(512, `${OUT_ICONS}icon-512.png`);
makeMaskableIcon(192, `${OUT_ICONS}icon-192-maskable.png`);
makeMaskableIcon(512, `${OUT_ICONS}icon-512-maskable.png`);
makeAppleTouchIcon(180, `${OUT_ICONS}apple-touch-icon.png`);
makeFaviconPng(32, `${OUT_PUBLIC}favicon-32.png`);
makeFaviconPng(16, `${OUT_PUBLIC}favicon-16.png`);

// --- favicon.svg: hand-written (no rasterization needed for a vector) -----
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="${TEAL_MID}"/>
  <path d="M12 32V19a7 7 0 0 1 7-7h13M68 12h13a7 7 0 0 1 7 7v13M88 68v13a7 7 0 0 1-7 7H68M32 88H19a7 7 0 0 1-7-7V68" fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round"/>
  <circle cx="50" cy="48.5" r="12" fill="#ffffff"/>
  <path d="M30 88a20 20 0 0 1 40 0z" fill="#ffffff"/>
</svg>
`;
writeFileSync(`${OUT_PUBLIC}favicon.svg`, faviconSvg);
console.log(`wrote ${OUT_PUBLIC}favicon.svg`);

// --- pill badge helper -----------------------------------------------------
function drawPill(ctx, x, y, label, { font, textColor, fillStyle, strokeStyle, padX = 24, height = 56 }) {
  ctx.font = font;
  const textW = ctx.measureText(label).width;
  const w = textW + padX * 2;
  roundRectPath(ctx, x, y, w, height, height / 2);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = strokeStyle;
    ctx.stroke();
  }
  ctx.fillStyle = textColor;
  // NB: match the *whole* number (including decimals) before "px" — a naive
  // /(\d+)px/ matches only the fractional digits of a scaled size like
  // "15.9375px" (i.e. "9375"), producing a wildly wrong vertical offset.
  const fontSize = Number(font.match(/(\d+(?:\.\d+)?)px/)[1]);
  ctx.fillText(label, x + padX, y + height / 2 + fontSize * 0.32);
  return w;
}

// --- social / OG card: 1280x640 (also doubles as the 1200x630 og-image) ---
function makeSocialCard(width, height, outPath) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const s = width / 1280; // scale factor from the 1280-wide base design

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, width, height);

  // Decorative radial glow, upper right.
  const glow = ctx.createRadialGradient(
    width * 0.88, height * -0.05, 0,
    width * 0.88, height * -0.05, 340 * s
  );
  glow.addColorStop(0, "rgba(13,148,136,0.55)");
  glow.addColorStop(1, "rgba(13,148,136,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Faint vertical grid lines.
  ctx.strokeStyle = "rgba(148,163,184,0.09)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 64 * s) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  const padX = 92 * s;
  const iconSize = 216 * s;
  const iconY = height / 2 - iconSize / 2;

  ctx.save();
  roundRectPath(ctx, padX, iconY, iconSize, iconSize, iconSize * 0.24);
  ctx.fillStyle = tealGradient(ctx, iconSize);
  ctx.fill();
  roundRectPath(ctx, padX, iconY, iconSize, iconSize, iconSize * 0.24);
  ctx.clip();
  ctx.translate(padX, iconY);
  ctx.scale(iconSize / 100, iconSize / 100);
  drawGlyph(ctx, STANDARD_GLYPH);
  ctx.restore();

  const textX = padX + iconSize + 72 * s;

  ctx.fillStyle = "#5eead4";
  ctx.font = `${17 * s}px "JetBrains Mono", monospace`;
  ctx.fillText("ABYSHEKHAR / SCAN-TO-CONTACT", textX, height / 2 - 118 * s);

  ctx.fillStyle = "#f8fafc";
  ctx.font = `bold ${66 * s}px sans-serif`;
  ctx.fillText("ScanToContact", textX, height / 2 - 40 * s);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = `${26 * s}px sans-serif`;
  ctx.fillText("Scan a QR code, business card, or voice note —", textX, height / 2 + 12 * s);
  ctx.fillText("get a contact ready to save.", textX, height / 2 + 46 * s);

  let px = textX;
  const py = height / 2 + 78 * s;
  const pillFont = `bold ${17 * s}px sans-serif`;
  px += drawPill(ctx, px, py, "100% on-device", {
    font: pillFont,
    textColor: "#0b1220",
    fillStyle: "#5eead4",
    height: 46 * s,
  }) + 12 * s;
  for (const label of ["no backend", "installable PWA", "MIT"]) {
    px += drawPill(ctx, px, py, label, {
      font: pillFont,
      textColor: "#a7f3d0",
      strokeStyle: "rgba(94,234,212,0.4)",
      height: 46 * s,
    }) + 12 * s;
  }

  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${width}x${height})`);
}

// --- README banner: 1280x280, light theme ----------------------------------
function makeReadmeBanner(outPath) {
  const width = 1280;
  const height = 280;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width * Math.cos((105 * Math.PI) / 180), height);
  bg.addColorStop(0, "#f8fafc");
  bg.addColorStop(1, "#ecfdf5");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Faint diagonal hatch texture.
  ctx.strokeStyle = "rgba(13,148,136,0.07)";
  ctx.lineWidth = 1;
  for (let x = -height; x < width; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }

  const padX = 68;
  const iconSize = 124;
  const iconY = height / 2 - iconSize / 2;

  ctx.save();
  roundRectPath(ctx, padX, iconY, iconSize, iconSize, iconSize * 0.24);
  ctx.fillStyle = tealGradient(ctx, iconSize);
  ctx.fill();
  roundRectPath(ctx, padX, iconY, iconSize, iconSize, iconSize * 0.24);
  ctx.clip();
  ctx.translate(padX, iconY);
  ctx.scale(iconSize / 100, iconSize / 100);
  drawGlyph(ctx, STANDARD_GLYPH);
  ctx.restore();

  const textX = padX + iconSize + 34;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("ScanToContact", textX, height / 2 - 6);
  ctx.fillStyle = "#475569";
  ctx.font = "19px sans-serif";
  ctx.fillText("Point your phone at it — get a contact ready to save.", textX, height / 2 + 28);

  ctx.fillStyle = "#0f766e";
  ctx.font = "14px \"JetBrains Mono\", monospace";
  ctx.textAlign = "right";
  const lines = ["QR · barcode", "business card OCR", "voice note"];
  const rightX = width - 68;
  const startY = height / 2 - 14;
  lines.forEach((line, i) => ctx.fillText(line, rightX, startY + i * 22));
  ctx.textAlign = "left";

  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${width}x${height})`);
}

makeSocialCard(1200, 630, `${OUT_PUBLIC}og-image.png`);
makeSocialCard(1280, 640, `${OUT_DOCS}social-preview.png`);
makeReadmeBanner(`${OUT_DOCS}readme-banner.png`);

console.log("\nAll brand assets done.");
