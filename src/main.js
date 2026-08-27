import "./style.css";
import {
  startCamera,
  stopCamera,
  watchForBarcode,
  detectBarcodeOnCanvas,
  ocrImage,
  extractPhoneNumberFromText,
  extractEmailFromText,
  parseBarcodePayload,
} from "./scanner.js";
import { buildVCard, triggerAddToContacts } from "./vcard.js";
import { getHistory, addHistoryEntry, removeHistoryEntry } from "./history.js";
import { initHelp } from "./help.js";

const videoEl = document.getElementById("camera-video");
const cameraStatusEl = document.getElementById("camera-status");
const fileInput = document.getElementById("file-input");
const uploadBtn = document.getElementById("upload-btn");

const scanBtn = document.getElementById("scan-btn");
const captureBtn = document.getElementById("capture-btn");
const cancelScanBtn = document.getElementById("cancel-scan-btn");

const processingLabel = document.getElementById("processing-label");

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
  if (name === "home") renderHistory();
}

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
    const text = await ocrImage(canvas);
    const number = extractPhoneNumberFromText(text);
    const email = extractEmailFromText(text);
    showResult({
      number: number || "",
      name: "",
      email: email || "",
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
