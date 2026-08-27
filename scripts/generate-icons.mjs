// Generates simple placeholder PNG icons for the PWA manifest.
// No external dependencies — builds raw PNG bytes (IHDR/IDAT/IEND) by hand
// so icon generation doesn't require ImageMagick/sharp/canvas to be installed.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk("IHDR", ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = chunk("IDAT", deflateSync(raw, { level: 9 }));
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// --- geometry helpers -------------------------------------------------

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [13, 148, 136]; // teal-600, matches app theme color
  const fg = [255, 255, 255];

  // Handset glyph: a capsule (rounded stroke) from top-left-ish to
  // bottom-right-ish, plus two small "earpiece/mouthpiece" pads —
  // a simplified classic phone-receiver silhouette.
  const s = size;
  const capsuleR = s * 0.1;
  const p1 = { x: s * 0.30, y: s * 0.30 };
  const p2 = { x: s * 0.70, y: s * 0.70 };
  const padR = s * 0.135;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let r = bg[0], g = bg[1], b = bg[2], a = 255;

      const dLine = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      const dPad1 = Math.hypot(x - p1.x, y - p1.y);
      const dPad2 = Math.hypot(x - p2.x, y - p2.y);

      if (dLine <= capsuleR || dPad1 <= padR || dPad2 <= padR) {
        r = fg[0]; g = fg[1]; b = fg[2];
      }

      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return rgba;
}

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });

const sizes = [192, 512];
for (const size of sizes) {
  const rgba = drawIcon(size);
  const png = encodePNG(size, size, rgba);
  const path = new URL(`../public/icons/icon-${size}.png`, import.meta.url);
  writeFileSync(path, png);
  console.log(`wrote ${path.pathname} (${png.length} bytes)`);
}
