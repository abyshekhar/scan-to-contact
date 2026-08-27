// A lightweight local "safety net" list of recent scans, kept in
// localStorage. It is NOT a substitute for the Contacts app — its only job
// is letting the user re-open "Save to Contacts" for a prior scan if they
// backed out of the native Add Contact screen without saving.
const STORAGE_KEY = "scanToContact.history.v1";
const MAX_ENTRIES = 20;

export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full/unavailable (e.g. private browsing) — history is
    // best-effort only, so fail silently.
  }
}

export function addHistoryEntry({ name, number, email, org }) {
  const entries = getHistory();
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "",
    number,
    email: email || "",
    org: org || "",
    ts: Date.now(),
  });
  saveHistory(entries.slice(0, MAX_ENTRIES));
}

export function removeHistoryEntry(id) {
  saveHistory(getHistory().filter((entry) => entry.id !== id));
}
