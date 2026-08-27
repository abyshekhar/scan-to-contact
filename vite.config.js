import { defineConfig } from "vite";

export default defineConfig({
  // `host: true` binds to 0.0.0.0 so you can open the dev server from a
  // phone on the same Wi-Fi network (e.g. https://192.168.1.23:5173) —
  // needed to test camera access on a real device instead of just desktop.
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
});
