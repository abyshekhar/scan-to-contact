// Copies the tesseract.js worker/core/language files that the app needs for
// OCR out of node_modules and into public/, so they:
//   1. are served as plain static files (no bundler transform needed — the
//      worker is spawned with `new Worker(url)` / `importScripts(url)`), and
//   2. can be precached by the service worker for offline use after first load.
//
// We deliberately pick the LSTM-only, SIMD-enabled, wasm-inlined-as-base64
// core build (tesseract-core-simd-lstm.wasm.js). It's larger as a single file
// than the raw .wasm + loader pair, but it's one HTTP request/cache entry
// instead of two, which is simpler to reason about in the service worker and
// avoids relative-path resolution issues inside the worker's importScripts
// context. WASM SIMD is supported by all current iOS Safari / Android Chrome.
//
// We use the "4.0.0_best_int" (quantized) English trained data, matching
// tesseract.js's own default choice for LSTM-only mode — a good size/accuracy
// tradeoff for reading printed digits off a phone camera frame.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const files = [
  {
    from: "node_modules/tesseract.js/dist/worker.min.js",
    to: "public/tesseract/worker.min.js",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    to: "public/tesseract/tesseract-core-simd-lstm.wasm.js",
  },
  {
    from: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    to: "public/tessdata/eng.traineddata.gz",
  },
];

for (const { from, to } of files) {
  const src = new URL(from, `file://${root}`).pathname;
  const dest = new URL(to, `file://${root}`).pathname;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  const { size } = statSync(dest);
  console.log(`copied ${from} -> ${to} (${(size / 1024 / 1024).toFixed(2)} MB)`);
}
