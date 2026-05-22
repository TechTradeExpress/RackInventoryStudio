// Vite config used by Playwright smoke tests.
// Aliases Tauri packages to local mocks so the frontend can run as a
// plain web app (no Tauri runtime required).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@tauri-apps/api/core": path.resolve(__dirname, "e2e/mocks/tauri-core.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "e2e/mocks/tauri-dialog.ts"),
      "@tauri-apps/plugin-log": path.resolve(__dirname, "e2e/mocks/tauri-log.ts"),
    },
  },
});
