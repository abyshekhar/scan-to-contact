import "./style.css";
import {
  startCamera,
  stopCamera,
  watchForBarcode,
  detectBarcodeOnCanvas,
  ocrImage,
  extractPhoneNumberFromText,
  extractEmailFromText,
  extractNameAndOrgFromLines,
  parseBarcodePayload,
} from "./scanner.js";
import { buildVCard, triggerAddToContacts } from "./vcard.js";
import { getHistory, addHistoryEntry, removeHistoryEntry } from "./history.js";
import { initHelp } from "./help.js";
import {
  isVoiceSupported,
  startVoiceRecognition,
  speakInstructions,
  playBeep,
  extractNameFromSpokenText,
  extractOrgFromSpokenText,
  extractEmailFromSpokenText,
} from "./voice.js";

const homeBtn = document.getElementById("home-btn");
const videoEl = document.getElementById("camera-video");
const cameraStatusEl = document.getElementById("camera-status");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");
const voiceBtn = document.getElementById("voice-btn");
const voiceUnsupportedNote = document.getElementById("voice-unsupported-note");

const scanBtn = document.getElementById("scan-btn");
const captureBtn = document.getElementById("capture-btn");
const cancelScanBtn = document.getElementById("cancel-scan-btn");

const processingLabel = document.getElementById("processing-label");

const voiceMicIcon = document.getElementById("voice-mic-icon");
const voiceStatus = document.getElementById("voice-status");
const voiceTranscript = document.getElementById("voice-transcript");
const voiceDoneBtn = document.getElementById("voice-done-btn");
const voiceCancelBtn = document.getElementById("voice-cancel-btn");
const voiceHearExampleBtn = document.getElementById("voice-hear-example-btn");

const nameInput = document.getElementById("name-input");
const numberInput = document.getElementById("number-input");
const emailInput = document.getElementById("email-input");
const companyInput = document.getElementById("company-input");
const resultHint = document.getElementById("result-hint");
const saveBtn = document.getElementById("save-btn");
const rescanBtn = document.getElementById("rescan-btn");
const saveConfirmation = document.getElementById("save-confirmation");

const historyWrap = document.getElementById("history-wrap");
const historyList = document.getElementById("history-list");

const MAX_IMAGE_DIMENSION = 1600;

let currentStream = null;
let stopWatching = null;

// --- screen management ----------------------------------------------------

function showScreen(name) {
  for (const el of document.querySelectorAll(".screen")) {
    el.dataset.active = el.id === `screen-${name}` ? "true" : "false";
  }
  homeBtn.hidden = name === "home";
  if (name === "home") renderHistory();
}

// Always-available escape hatch, shown on every screen except Home itself.
// Installed as a standalone PWA, there's no browser back button or URL bar
// to fall back on, so every screen needs a guaranteed way out — this stops
// whichever flow might be active (camera, voice recognition, speech
// synthesis) rather than relying on each screen's own Cancel/Rescan button,
// which don't all lead back to Home (Rescan starts another scan, and the
// Processing screen has no buttons at all).
function goHome() {
  stopScanFlow();
  stopVoiceFlow();
  saveConfirmation.hidden = true;
  showScreen("home");
}

homeBtn.addEventListener("click", goHome);

function showResult({ name, number, email, org, hint }) {
  nameInput.value = name || "";
  numberInput.value = number || "";
  emailInput.value = email || "";
  companyInput.value = org || "";
  resultHint.textContent = hint || "";
  saveConfirmation.hidden = true;
  showScreen("result");
}

// --- history (home screen) -------------------------------------------------

function renderHistory() {
  const entries = getHistory();
  historyWrap.hidden = entries.length === 0;
  historyList.innerHTML = "";

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "meta";
    const nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = entry.name || "New Contact";
    const numberEl = document.createElement("span");
    numberEl.className = "number";
    numberEl.textContent = [entry.number, entry.email].filter(Boolean).join(" · ");
    meta.append(nameEl, numberEl);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => {
      showResult({
        name: entry.name,
        number: entry.number,
        email: entry.email,
        org: entry.org,
        hint: "From your recent scans.",
      });
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.setAttribute("aria-label", `Remove ${entry.name || entry.number} from history`);
    deleteBtn.addEventListener("click", () => {
      removeHistoryEntry(entry.id);
      renderHistory();
    });

    li.append(meta, addBtn, deleteBtn);
    historyList.appendChild(li);
  }
}

// --- image helpers ----------------------------------------------------------

function canvasFromVideoFrame(video) {
  let { videoWidth: w, videoHeight: h } = video;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return canvas;
}

async function canvasFromImageFile(file) {
  const bitmap = await createImageBitmap(file);
  let { width: w, height: h } = bitmap;
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas;
}

// --- scan pipeline (shared by live-frame capture and the file fallback) ----

async function processCapturedImage(canvas) {
  showScreen("processing");
  processingLabel.textContent = "Checking for a QR code or barcode…";

  const raw = await detectBarcodeOnCanvas(canvas);
  if (raw) {
    const { number, name, email, org } = parseBarcodePayload(raw);
    showResult({ number, name, email, org, hint: "Found in a QR code / barcode." });
    return;
  }

  processingLabel.textContent = "No barcode found — reading printed text…";
  try {
    const { text, lines } = await ocrImage(canvas);
    const number = extractPhoneNumberFromText(text);
    const email = extractEmailFromText(text);
    const { name, org } = extractNameAndOrgFromLines(lines);
    showResult({
      number: number || "",
      name,
      email: email || "",
      org,
      hint:
        number || email
          ? "Detected from the photo — please double-check it."
          : "Couldn't confidently read a number — please enter it manually.",
    });
  } catch {
    showResult({
      number: "",
      name: "",
      hint: "Something went wrong reading the image — please enter the number manually.",
    });
  }
}

// --- live camera flow --------------------------------------------------------

async function startScanFlow() {
  showScreen("camera");
  cameraStatusEl.textContent = "Point the camera at a QR code, barcode, or printed number";

  try {
    currentStream = await startCamera(videoEl);
  } catch {
    // Camera unavailable, blocked, or denied — fall back to the OS photo
    // picker / capture=environment file input instead.
    showScreen("home");
    fileInput.click();
    return;
  }

  stopWatching = watchForBarcode(videoEl, async (raw) => {
    stopWatching = null;
    stopCamera(currentStream);
    currentStream = null;
    const { number, name, email, org } = parseBarcodePayload(raw);
    showResult({ number, name, email, org, hint: "Found in a QR code / barcode." });
  });
}

function stopScanFlow() {
  if (stopWatching) {
    stopWatching();
    stopWatching = null;
  }
  stopCamera(currentStream);
  currentStream = null;
}

scanBtn.addEventListener("click", startScanFlow);

uploadBtn.addEventListener("click", () => fileInput.click());

// --- voice note flow --------------------------------------------------------

let stopVoiceRecognition = null;
let voiceFlowToken = 0;

// Cues "now talk" with a quick beep by default — no synthesized voice plays
// unless the user explicitly asks for it via "Hear an example" (`force:
// true`). A synthesized voice narrating instructions on every single visit,
// unprompted, is exactly the kind of unsolicited auto-play UI this app
// deliberately avoids elsewhere (the help modal is opt-in for the same
// reason) — plus not everyone finds a given TTS voice pleasant to listen to.
// `token` guards against a stale sequence (from a screen the user already
// left, or a replay that superseded this one) still updating the UI after
// the fact — recognition itself is already running by the time this is
// called, so this never blocks listening, it just cues when to start.
async function playVoiceIntro(token, { force = false } = {}) {
  if (force) {
    voiceStatus.textContent = "🔊 Listen for an example…";
    await speakInstructions();
    if (token !== voiceFlowToken) return;
  }

  voiceStatus.textContent = "Get ready…";
  await playBeep();
  if (token !== voiceFlowToken) return;
  voiceStatus.textContent = "🎤 Listening — speak now";
}

function startVoiceFlow() {
  const token = ++voiceFlowToken;
  voiceTranscript.value = "";
  voiceMicIcon.dataset.listening = "true";
  showScreen("voice");

  // Start listening immediately, from the same tap that opened this screen
  // — that's what keeps microphone permission from being blocked, even
  // though the intro below may still be playing when results start coming
  // in (nothing is said during the intro, so the transcript stays empty).
  stopVoiceRecognition = startVoiceRecognition({
    onTranscript: (transcript) => {
      voiceTranscript.value = transcript;
    },
    onError: (error) => {
      voiceMicIcon.dataset.listening = "false";
      voiceStatus.textContent =
        error === "not-allowed"
          ? "Microphone access was blocked — allow it in your browser settings and try again."
          : "Didn't catch that — you can edit the text below, or tap Cancel and try again.";
    },
  });

  playVoiceIntro(token);
}

function stopVoiceFlow() {
  voiceFlowToken++; // invalidate any in-flight intro sequence
  window.speechSynthesis?.cancel();
  if (stopVoiceRecognition) {
    stopVoiceRecognition();
    stopVoiceRecognition = null;
  }
  voiceMicIcon.dataset.listening = "false";
}

voiceBtn.addEventListener("click", startVoiceFlow);

voiceHearExampleBtn.addEventListener("click", () => {
  // Bump the token first so any still-in-flight auto-intro sequence sees
  // itself as stale and stops touching the status line once this one starts
  // — without this, tapping "Hear an example" while the first playback is
  // still running raced both sequences against each other.
  const token = ++voiceFlowToken;
  playVoiceIntro(token, { force: true });
});

voiceCancelBtn.addEventListener("click", () => {
  stopVoiceFlow();
  showScreen("home");
});

voiceDoneBtn.addEventListener("click", () => {
  stopVoiceFlow();
  const transcript = voiceTranscript.value.trim();
  const number = extractPhoneNumberFromText(transcript);
  const email = extractEmailFromSpokenText(transcript);
  const name = extractNameFromSpokenText(transcript);
  const org = extractOrgFromSpokenText(transcript);
  showResult({
    number: number || "",
    name,
    email,
    org,
    hint: transcript
      ? "From your voice note — please double-check it."
      : "Didn't hear anything — please enter the details manually.",
  });
});

cancelScanBtn.addEventListener("click", () => {
  stopScanFlow();
  showScreen("home");
});

captureBtn.addEventListener("click", async () => {
  const canvas = canvasFromVideoFrame(videoEl);
  stopScanFlow();
  await processCapturedImage(canvas);
});

// --- file-input fallback -----------------------------------------------------

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = ""; // allow re-selecting the same file next time
  if (!file) return;
  const canvas = await canvasFromImageFile(file);
  await processCapturedImage(canvas);
});

// --- result screen actions ----------------------------------------------------

saveBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const number = numberInput.value.trim();
  const email = emailInput.value.trim();
  const org = companyInput.value.trim();
  if (!number) {
    numberInput.focus();
    return;
  }
  addHistoryEntry({ name, number, email, org });
  triggerAddToContacts(buildVCard({ name, number, email, org }));
  saveConfirmation.hidden = false;
});

rescanBtn.addEventListener("click", () => {
  saveConfirmation.hidden = true;
  startScanFlow();
});

// --- init ----------------------------------------------------------------------

initHelp();
renderHistory();

if (isVoiceSupported()) {
  voiceBtn.hidden = false;
} else {
  voiceUnsupportedNote.hidden = false;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
