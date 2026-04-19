import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Office add-ins must be served over HTTPS, even for local development.
 * `office-addin-debugging start` takes care of installing a dev cert; Vite
 * just needs `server.https: true` so the dev server speaks TLS.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // `office-addin-debugging start` injects the cert via HTTPS_PROXY; Vite's
    // typed `https` option expects ServerOptions. Empty object = use defaults.
    https: {},
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
  },
});
