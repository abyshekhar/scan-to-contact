// Generates the social-share images: public/og-image.png (1200x630, used by
// the Open Graph / Twitter Card meta tags in index.html) and
// docs/social-preview.png (1280x640, GitHub's recommended size for the
// repo's Settings → General → Social preview upload).
//
// NOT part of the standard install/build flow (unlike scripts/generate-icons.mjs)
// — it needs the `canvas` package, which requires native compilation and
// isn't worth making every contributor install just to run `npm install`.
// Run this manually, only when the marketing copy or design changes:
//
//   npm install -D canvas && node scripts/generate-social-image.mjs && npm uninstall canvas
import { createCanvas } from "canvas";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCard(width, height, outPath) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const scale = width / 1200; // base design at 1200px wide, scaled for other sizes

  // Background: teal gradient, matching the app's button gradient.
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0d9488");
  bg.addColorStop(1, "#0f5f58");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Soft decorative circles for visual depth.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(width * 0.88, height * 0.15, 220 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.08, height * 0.92, 260 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Wordmark.
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${Math.round(84 * scale)}px sans-serif`;
  ctx.fillText("ScanToContact", 90 * scale, 260 * scale);

  // Tagline.
  ctx.font = `${Math.round(34 * scale)}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  const line1 = "Scan a QR code, business card, or voice note —";
  const line2 = "straight to your phone's Contacts.";
  ctx.fillText(line1, 92 * scale, 340 * scale);
  ctx.fillText(line2, 92 * scale, 385 * scale);

  // Differentiator pills.
  const pills = ["Free", "Private", "No account", "Installable"];
  let px = 92 * scale;
  const py = height - 110 * scale;
  const pillH = 56 * scale;
  ctx.font = `bold ${Math.round(26 * scale)}px sans-serif`;
  for (const label of pills) {
    const textW = ctx.measureText(label).width;
    const pillW = textW + 48 * scale;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, px + 24 * scale, py + pillH / 2 + 9 * scale);
    px += pillW + 18 * scale;
  }

  writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`wrote ${outPath} (${width}x${height})`);
}

drawCard(1200, 630, new URL("public/og-image.png", `file://${root}`).pathname);
drawCard(1280, 640, new URL("docs/social-preview.png", `file://${root}`).pathname);
