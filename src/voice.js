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

// --- guiding the user through what to say ---------------------------------
//
// A silent mic icon gives no clue what "the right thing to say" looks like.
// An on-screen example (see index.html) is the primary, always-visible
// guidance. This adds two optional audio cues on top, both opt-in only —
// nothing here ever plays automatically:
//   - a spoken example, via the browser's built-in text-to-speech
//     (`speechSynthesis` — supported far more broadly than
//     `SpeechRecognition`, including iOS Safari), triggered only by the
//     "Hear an example" button;
//   - a short "ready" tone, synthesized on the fly via the Web Audio API
//     (no bundled audio file needed), played right before recognition
//     starts listening in earnest.
// A synthesized voice narrating instructions unprompted on every visit is
// exactly the kind of unsolicited auto-play UI this app avoids elsewhere
// (the help modal is opt-in for the same reason) — and not everyone finds a
// given TTS voice pleasant, so it's a tap-to-hear extra rather than a
// default.

const EXAMPLE_PHRASE =
  "This is Jane Doe from Acme Incorporated. My number is 5 5 5, 1 2 3, 4 5 6 7.";
const INSTRUCTION_TEXT = `After the tone, speak the contact's details. For example: ${EXAMPLE_PHRASE}`;

// getVoices() often returns an empty list on the very first call, before the
// platform has finished loading its voice list asynchronously — wait for
// `voiceschanged`, with a timeout so a browser that never fires it doesn't
// stall the intro.
function waitForVoices() {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", finish);
    setTimeout(finish, 1000);
  });
}

// Prefers the platform's own marked-default voice for the current language
// over whatever `speechSynthesis` falls back to when no voice is explicitly
// assigned — on some platforms that fallback is a noticeably lower-quality
// or more robotic-sounding voice than the one the OS actually recommends.
function pickPreferredVoice(voices) {
  if (!voices.length) return null;
  const langPrefix = (navigator.language || "en").slice(0, 2).toLowerCase();
  const matchesLang = (v) => v.lang.toLowerCase().startsWith(langPrefix);
  return (
    voices.find((v) => matchesLang(v) && v.default) ||
    voices.find((v) => matchesLang(v) && v.localService) ||
    voices.find(matchesLang) ||
    voices.find((v) => v.default) ||
    voices[0]
  );
}

// Speaks the example instructions aloud, resolving once finished (or
// immediately if speech synthesis isn't available in this browser). Guarded
// by a timeout — if the platform's voice engine ever fails to fire `end` or
// `error` (seen occasionally when no voice data is installed/loaded), this
// still resolves instead of stalling the rest of the flow forever.
export async function speakInstructions() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const voices = await waitForVoices();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const utterance = new SpeechSynthesisUtterance(INSTRUCTION_TEXT);
    utterance.rate = 1;
    utterance.pitch = 1;
    const voice = pickPreferredVoice(voices);
    if (voice) utterance.voice = voice;
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.cancel(); // clear anything stuck queued from before
    window.speechSynthesis.speak(utterance);
    setTimeout(finish, 12_000);
  });
}

// Plays a short "ready" beep with the Web Audio API — no bundled audio file
// needed. Resolves once the tone finishes (or immediately if unavailable).
export function playBeep() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextImpl) {
        finish();
        return;
      }
      const ctx = new AudioContextImpl();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.35);
      oscillator.onended = () => {
        ctx.close();
        finish();
      };
      setTimeout(finish, 1500);
    } catch {
      finish();
    }
  });
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

// Words that typically start the next clause in a dictated contact note.
// Each captured word is checked against this list individually (rather than
// requiring one of these words to trail the whole capture) — that way a
// name/company still comes out correctly even when it's followed directly by
// a number or a word we don't recognize, instead of the capture failing
// outright just because no known "next clause" cue happened to follow.
const STOP_WORDS = "my|i|is|it's|calling|call|work|works|from|with|at|phone|number|email|thanks|thank you|please|and|so|ok|okay";
const NAME_WORD = `(?!(?:${STOP_WORDS})\\b)[a-z][a-z'-]*`;
const ORG_WORD = `(?!(?:${STOP_WORDS})\\b)[a-z0-9][a-z0-9'-]*`; // orgs may contain digits, e.g. "7-Eleven"

// Builds a capture group for "1 word, plus up to `maxExtra` more", where
// each word is independently checked against STOP_WORDS and must match
// `wordPattern` — so it naturally stops at the first stop word or the first
// token that doesn't fit (e.g. a digit run, for names) without needing that
// token to match anything specific.
function phraseCapture(wordPattern, maxExtra) {
  return `(${wordPattern}(?:\\s+${wordPattern}){0,${maxExtra}})`;
}

const NAME_PATTERNS = [
  new RegExp(`\\bmy name is ${phraseCapture(NAME_WORD, 2)}`, "i"),
  new RegExp(`\\bthis is ${phraseCapture(NAME_WORD, 2)}`, "i"),
  new RegExp(`\\bi'?m ${phraseCapture(NAME_WORD, 2)}`, "i"),
  new RegExp(`\\bi am ${phraseCapture(NAME_WORD, 2)}`, "i"),
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
  new RegExp(`\\bfrom ${phraseCapture(ORG_WORD, 3)}`, "i"),
  new RegExp(`\\bi work at ${phraseCapture(ORG_WORD, 3)}`, "i"),
  new RegExp(`\\bcompany is ${phraseCapture(ORG_WORD, 3)}`, "i"),
  new RegExp(`\\bwith ${phraseCapture(ORG_WORD, 3)}`, "i"),
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
