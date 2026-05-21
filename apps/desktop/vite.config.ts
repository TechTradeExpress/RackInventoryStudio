import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG
  },
  test: {
    // Keep Vitest focused on unit tests; Playwright handles e2e/
    exclude: ["node_modules/**", "e2e/**"],
    // Component tests in src/components/ui/*.test.tsx use jsdom environment
    environmentMatchGlobs: [
      ["src/components/ui/*.test.tsx", "jsdom"],
    ],
  },
});
