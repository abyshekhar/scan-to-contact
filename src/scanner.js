// Camera capture, barcode detection, OCR, and phone-number extraction.
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import { createWorker } from "tesseract.js";

const BARCODE_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "code_128",
  "code_39",
  "upc_a",
  "upc_e",
  "codabar",
  "itf",
  "pdf417",
  "data_matrix",
];

const ZXING_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODABAR,
  BarcodeFormat.ITF,
  BarcodeFormat.PDF_417,
  BarcodeFormat.DATA_MATRIX,
];

// --- camera -------------------------------------------------------------

export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCamera(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

// --- barcode watching (continuous, while the live camera is open) -------

let zxingReader = null;
function getZxingReader() {
  if (!zxingReader) {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    zxingReader = new BrowserMultiFormatReader(hints, 400);
  }
  return zxingReader;
}

// Returns a `stop()` function. onDetected is called at most once with the
// raw decoded barcode string, then watching stops automatically.
export function watchForBarcode(videoEl, onDetected) {
  let done = false;
  let stop = () => {};
  const finish = (text) => {
    if (done) return;
    done = true;
    stop();
    onDetected(text);
  };

  if ("BarcodeDetector" in window) {
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    } catch {
      detector = new window.BarcodeDetector();
    }
    const intervalId = setInterval(async () => {
      if (done || videoEl.readyState < 2) return;
      try {
        const results = await detector.detect(videoEl);
        if (results.length > 0) finish(results[0].rawValue);
      } catch {
        // transient decode errors are expected between frames; ignore
      }
    }, 350);
    stop = () => clearInterval(intervalId);
    return stop;
  }

  // Fallback: zxing-js, which works on iOS Safari and other browsers
  // without a native BarcodeDetector implementation.
  const reader = getZxingReader();
  stop = () => reader.reset();
  reader.decodeFromVideoElementContinuously(videoEl, (result) => {
    if (result) finish(result.getText());
  });
  return stop;
}

// One-shot barcode detection on a still frame (canvas), used for the
// file-input fallback path (no live video available).
export async function detectBarcodeOnCanvas(canvas) {
  if ("BarcodeDetector" in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
      const results = await detector.detect(canvas);
      if (results.length > 0) return results[0].rawValue;
      return null;
    } catch {
      return null;
    }
  }
  try {
    // zxing's synchronous `decode()` only supports <video>/<img> sources
    // (it reads `.naturalWidth`/`.videoWidth`, which a bare <canvas> doesn't
    // have), so route through an image URL instead.
    const reader = getZxingReader();
    const result = await reader.decodeFromImageUrl(canvas.toDataURL("image/png"));
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

// --- OCR (fallback for printed digits with no barcode) -------------------

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
      langPath: "/tessdata",
      cacheMethod: "none",
      gzip: true,
    }).then(async (worker) => {
      // SPARSE_TEXT: the number may sit among other text/logos/graphics
      // rather than filling the whole frame.
      //
      // Deliberately NOT using tessedit_char_whitelist here: restricting
      // recognition to digits/punctuation makes Tesseract force-fit every
      // letter it sees (e.g. a business name) into the nearest allowed
      // character instead of ignoring it, which injects bogus digits right
      // next to the real number. Letting it recognize full text and then
      // extracting the phone-shaped run with a regex is more accurate.
      await worker.setParameters({ tessedit_pageseg_mode: "11" });
      return worker;
    });
  }
  return workerPromise;
}

// Requests block/paragraph/line structure (not just flat text) so callers
// can use each line's height as a proxy for font size — on a business card,
// the person's name and the company name are usually the tallest printed
// text, which is a much stronger signal than word order alone.
export async function ocrImage(canvas) {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const lines = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = (line.text || "").trim();
        if (!text) continue;
        const height = line.bbox ? line.bbox.y1 - line.bbox.y0 : 0;
        lines.push({ text, height });
      }
    }
  }
  return { text: data.text || "", lines };
}

// --- phone number extraction ---------------------------------------------

// Longest digit run of plausible phone-number length (7-15 digits per
// E.164), tolerant of spaces, dashes, dots, and parentheses.
export function extractPhoneNumberFromText(text) {
  if (!text) return null;
  let best = null;
  let bestDigits = 0;
  // Match within a single line at a time — OCR output separates unrelated
  // numbers (e.g. a phone number and a nearby "24/7" or address) onto
  // different lines, and a whitespace class that spans newlines would
  // otherwise bridge two of them into one bogus candidate.
  for (const line of text.split(/\r?\n/)) {
    const candidates = line.match(/\+?\(?\d[\d ().-]{5,18}\d/g) || [];
    for (const candidate of candidates) {
      const digits = candidate.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15 && digits.length > bestDigits) {
        best = candidate.trim();
        bestDigits = digits.length;
      }
    }
  }
  return best;
}

const COMPANY_SUFFIX_RE =
  /\b(inc|llc|ltd|corp(oration)?|co\.?|company|group|solutions|services|enterprises|partners|associates|studio|agency|consulting|technolog(y|ies)|systems|industries|holdings|international|labs?)\b/i;
const JOB_TITLE_RE =
  /\b(ceo|cfo|cto|coo|president|vice president|vp|director|manager|founder|co-founder|owner|engineer|sales|marketing|executive|consultant|specialist|representative|coordinator|officer|partner|attorney|accountant|analyst|architect|designer|developer|realtor|broker)\b/i;
const ADDRESS_HINT_RE = /\b(street|st|avenue|ave|road|rd|suite|ste|floor|fl|blvd|drive|dr|lane|ln|p\.?o\.? box)\.?\b/i;
const WEBSITE_RE = /(www\.|https?:\/\/|\.(com|net|org|io|co|biz)\b)/i;
const NAME_WORD_RE = /^[A-Za-z][A-Za-z.'-]*$/;

function looksLikePhoneLine(text) {
  return extractPhoneNumberFromText(text) !== null;
}

// Best-effort heuristic for pulling a person's name and company/organization
// out of OCR'd business-card text, which — unlike a barcode payload — has no
// structured fields to read. There is no way to be certain, so this trades
// some false positives for not leaving the fields blank; both are shown in
// an editable form before saving, so a wrong guess just needs a quick edit.
//
// `lines` comes from ocrImage() and includes each line's pixel height, used
// as a stand-in for font size: on a business card, the name and company are
// almost always the most prominent (tallest) printed lines.
export function extractNameAndOrgFromLines(lines) {
  if (!lines || lines.length === 0) return { name: "", org: "" };

  const candidates = lines.filter(
    (line) => line.text && !looksLikePhoneLine(line.text) && !line.text.includes("@")
  );

  const isNoise = (text) => JOB_TITLE_RE.test(text) || ADDRESS_HINT_RE.test(text) || WEBSITE_RE.test(text) || /\d/.test(text);

  const nameCandidates = candidates.filter((line) => {
    if (isNoise(line.text) || COMPANY_SUFFIX_RE.test(line.text)) return false;
    const words = line.text.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4 || line.text.length > 40) return false;
    return words.every((w) => NAME_WORD_RE.test(w));
  });
  nameCandidates.sort((a, b) => b.height - a.height);
  const name = nameCandidates[0]?.text || "";

  const orgWithSuffix = candidates.filter(
    (line) => line.text !== name && COMPANY_SUFFIX_RE.test(line.text) && !JOB_TITLE_RE.test(line.text)
  );
  orgWithSuffix.sort((a, b) => b.height - a.height);

  let org = orgWithSuffix[0]?.text || "";
  if (!org) {
    // No recognizable "Inc/LLC/Co./Group/..." suffix — fall back to the
    // next most prominent line that isn't the name and isn't obviously a
    // title/address/phone/email/website line.
    const fallback = candidates.filter((line) => {
      if (line.text === name || isNoise(line.text)) return false;
      const words = line.text.split(/\s+/).filter(Boolean);
      return words.length > 0 && words.length <= 6 && line.text.length <= 40;
    });
    fallback.sort((a, b) => b.height - a.height);
    org = fallback[0]?.text || "";
  }

  return { name, org };
}

// Well-delimited by `@` and surrounding whitespace/punctuation, so unlike
// phone numbers this is safe to match against the whole text at once — it
// won't accidentally bridge two unrelated lines together.
export function extractEmailFromText(text) {
  if (!text) return null;
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

const EMPTY_CONTACT = { number: "", name: "", email: "", org: "" };

// Parses a decoded barcode payload, recognizing tel: URIs, MECARD, and
// vCard formats, and pulling out whatever contact fields are present: phone
// number, name, email, and organization/company.
export function parseBarcodePayload(raw) {
  const text = (raw || "").trim();

  const telUri = text.match(/^tel:(.+)$/i);
  if (telUri) {
    return { ...EMPTY_CONTACT, number: decodeURIComponent(telUri[1]).trim() };
  }

  const mailtoUri = text.match(/^mailto:([^?]+)/i);
  if (mailtoUri) {
    return { ...EMPTY_CONTACT, email: decodeURIComponent(mailtoUri[1]).trim() };
  }

  if (/^MECARD:/i.test(text)) {
    const telMatch = text.match(/TEL:([^;]+)/i);
    const nameMatch = text.match(/N:([^;]+)/i);
    const emailMatch = text.match(/EMAIL:([^;]+)/i);
    const orgMatch = text.match(/ORG:([^;]+)/i);
    return {
      number: telMatch ? telMatch[1].trim() : extractPhoneNumberFromText(text) || "",
      name: nameMatch ? nameMatch[1].trim() : "",
      email: emailMatch ? emailMatch[1].trim() : extractEmailFromText(text) || "",
      org: orgMatch ? orgMatch[1].trim() : "",
    };
  }

  if (/BEGIN:VCARD/i.test(text)) {
    const telMatch = text.match(/TEL[^:\r\n]*:([^\r\n]+)/i);
    const fnMatch = text.match(/FN:([^\r\n]+)/i);
    const emailMatch = text.match(/EMAIL[^:\r\n]*:([^\r\n]+)/i);
    const orgMatch = text.match(/ORG:([^;\r\n]+)/i);
    return {
      number: telMatch ? telMatch[1].trim() : extractPhoneNumberFromText(text) || "",
      name: fnMatch ? fnMatch[1].trim() : "",
      email: emailMatch ? emailMatch[1].trim() : extractEmailFromText(text) || "",
      org: orgMatch ? orgMatch[1].trim() : "",
    };
  }

  return {
    ...EMPTY_CONTACT,
    number: extractPhoneNumberFromText(text) || (extractEmailFromText(text) ? "" : text),
    email: extractEmailFromText(text) || "",
  };
}
