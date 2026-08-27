// Builds a vCard and hands it to the OS so it opens the native
// "Add Contact" screen. There is no cross-platform web API to write directly
// into the OS address book — this MIME-type hand-off is the reliable trick
// both iOS Safari and Android Chrome recognize.
//
// iOS Safari and Android Chrome need to be driven differently (see README
// for how to test each):
//   - iOS Safari: navigating the CURRENT window to a `data:text/vcard,...`
//     URI is what reliably opens the native contact-card preview. A
//     Blob/ObjectURL with a `download` attribute is instead treated as a
//     plain file download into the Files app on iOS.
//   - Android Chrome: a Blob + <a download> click triggers a file download
//     of the .vcf; tapping the resulting notification/downloaded file is
//     what launches the Contacts app's import screen. A `data:` URI
//     navigation on Android Chrome just navigates the tab instead.

function escapeVCardValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildVCard({ name, number, email, org }) {
  const fn = escapeVCardValue(name?.trim() || "New Contact");
  const tel = escapeVCardValue(number?.trim() || "");
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:;${fn};;;`, `FN:${fn}`, `TEL;TYPE=CELL:${tel}`];

  const trimmedEmail = email?.trim();
  if (trimmedEmail) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardValue(trimmedEmail)}`);

  const trimmedOrg = org?.trim();
  if (trimmedOrg) lines.push(`ORG:${escapeVCardValue(trimmedOrg)}`);

  lines.push("END:VCARD", "");
  return lines.join("\r\n");
}

export function isIOS() {
  const ua = navigator.userAgent;
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  // iPadOS 13+ reports as "MacIntel" with touch support, unlike real Macs.
  const isIPadOS13Up = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS13Up;
}

export function triggerAddToContacts(vcardString) {
  if (isIOS()) {
    const dataUri = `data:text/vcard;charset=utf-8,${encodeURIComponent(vcardString)}`;
    window.location.href = dataUri;
    return;
  }

  const blob = new Blob([vcardString], { type: "text/vcard" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "contact.vcf";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
