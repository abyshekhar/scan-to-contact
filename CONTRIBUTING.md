# Contributing

This is a small personal project, but contributions are welcome.

1. Fork the repo and clone it locally.
2. `npm install && npm run dev` to run it — see the README for HTTPS/camera
   testing notes, since a plain `http://` LAN address won't get camera
   access on a real phone.
3. Keep changes focused. This app is deliberately minimal by design: no
   backend, no accounts, no framework beyond Vite for bundling.
4. If your change touches the camera, OCR, voice notes, or the vCard
   hand-off, test it on a real phone before opening a PR — none of those can
   be fully verified in a desktop browser (see the README's
   ["Testing on a real device"](README.md#testing-on-a-real-device) section
   for exactly what to check on iOS vs. Android).
5. Open a PR describing what changed and why.

Bug reports and feature requests are welcome via
[Issues](https://github.com/abyshekhar/scan-to-contact/issues).
