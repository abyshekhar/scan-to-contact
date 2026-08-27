// Voice-note contact capture using the browser's built-in Web Speech API.
//
// Deliberately Android/Chrome-only for now: iOS Safari has never
// implemented SpeechRecognition, and there's no cross-platform web API for
// on-device speech-to-text the way there is (sort of) for barcodes. Bundling
// a WASM speech model (e.g. Whisper) would work on both platforms but adds
// tens of MB to the app's first load — that tradeoff was deliberately
// deferred in favor of keeping the app lightweight, matching how the rest of
// this app prefers a native browser API first. `isVoiceSupported()` gates
// the UI so unsupported browsers see an explanatory note instead of a
// broken button.
import { extractEmailFromText } from "./scanner.js";

// Resolved lazily (not at module load) so this module — and its pure text
// extraction functions below — can be imported/tested outside a browser.
function getSpeechRecognitionImpl() {
  return typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isVoiceSupported() {
  return Boolean(getSpeechRecognitionImpl());
}

// Starts continuous listening. `onTranscript` is called with the full
// transcript so far (final segments + the current in-progress one) every
// time recognition produces a new result. Returns a `stop()` function.
export function startVoiceRecognition({ onTranscript, onError }) {
  const SpeechRecognitionImpl = getSpeechRecognitionImpl();
  const recognition = new SpeechRecognitionImpl();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  let finalTranscript = "";
  let manuallyStopped = false;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += `${result[0].transcript} `;
      } else {
        interim += result[0].transcript;
      }
    }
    onTranscript((finalTranscript + interim).trim());
  };

  recognition.onerror = (event) => {
    onError?.(event.error);
  };

  recognition.onend = () => {
    // Some browsers/OSes stop listening after a short silence even with
    // `continuous: true` — keep going until the user explicitly stops, so
    // pauses mid-sentence don't cut the note short.
    if (!manuallyStopped) {
      try {
        recognition.start();
      } catch {
        // already starting/running — ignore
      }
    }
  };

  recognition.start();

  return () => {
    manuallyStopped = true;
    recognition.stop();
  };
}

// --- extracting contact fields from natural spoken phrasing ---------------
//
// Unlike a barcode's structured fields or a business card's font-size cues,
// a spoken sentence like "this is Alex Rivera from Rivera Consulting, my
// number is 555-222-3333" has no visual structure to lean on — only common
// phrasing patterns. This is even more of a best-effort guess than the OCR
// heuristics, which is why it's paired with an editable "what we heard"
// transcript and editable result fields: wrong guesses are a quick fix.

function titleCaseWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// Words that typically start the next clause in a dictated contact note —
// used as a lookahead boundary so a capture group doesn't run on into
// unrelated words (Web Speech API transcripts usually carry no punctuation).
const NEXT_CLAUSE = "my|i|is|it's|calling|call|work|works|from|with|at|phone|number|email|thanks|thank you|please";
const STOP_LOOKAHEAD = `(?=\\s+(?:${NEXT_CLAUSE})\\b|$)`;

const NAME_PATTERNS = [
  new RegExp(`\\bmy name is ([a-z][a-z' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bthis is ([a-z][a-z' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bi'?m ([a-z][a-z' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bi am ([a-z][a-z' -]*?)${STOP_LOOKAHEAD}`, "i"),
];

export function extractNameFromSpokenText(text) {
  if (!text) return "";
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1].trim()) return titleCaseWords(match[1]);
  }
  return "";
}

const ORG_PATTERNS = [
  new RegExp(`\\bfrom ([a-z][a-z0-9' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bi work at ([a-z][a-z0-9' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bcompany is ([a-z][a-z0-9' -]*?)${STOP_LOOKAHEAD}`, "i"),
  new RegExp(`\\bwith ([a-z][a-z0-9' -]*?)${STOP_LOOKAHEAD}`, "i"),
];

export function extractOrgFromSpokenText(text) {
  if (!text) return "";
  for (const pattern of ORG_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1].trim()) return titleCaseWords(match[1]);
  }
  return "";
}

// Speech recognizers usually transcribe a dictated email literally
// ("alex at rivera dot com") rather than as symbols. Try the strict email
// regex first (some engines do render "@"/"." directly for clear dictation),
// then fall back to normalizing common spoken patterns and retrying.
export function extractEmailFromSpokenText(text) {
  if (!text) return "";
  const direct = extractEmailFromText(text);
  if (direct) return direct;
  const normalized = text
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+underscore\s+/g, "_")
    .replace(/\s+dash\s+/g, "-");
  return extractEmailFromText(normalized) || "";
}
