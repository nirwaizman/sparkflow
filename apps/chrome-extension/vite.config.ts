import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as never })],
  build: {
    target: "esnext",
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: "popup.html",
        sidepanel: "sidepanel.html",
        options: "options.html",
      },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    hmr: {
      port: 5181,
    },
  },
});
