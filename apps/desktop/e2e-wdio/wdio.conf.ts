/**
 * WebdriverIO configuration for Tauri desktop E2E tests.
 *
 * Test environment isolation (repository-lifecycle suite):
 * The test-environment helper is initialized at module-load time so that the
 * XDG and git isolation env vars are in process.env before the WDIO launcher
 * spawns workers and before tauri-driver launches the Tauri binary.
 *
 * Prerequisites before running:
 *   1. Build the Tauri release binary using the Tauri CLI (from repo root):
 *        pnpm -C apps/desktop tauri build --no-bundle
 *      IMPORTANT: bare `cargo build --release` does NOT embed frontendDist assets.
 *      Without the CLI build, the WebView loads devUrl and shows "Connection refused".
 *
 *   2. Install tauri-driver (one-time, requires Rust):
 *        cargo install tauri-driver
 *
 *   3. Linux only — install the WebKit WebDriver and virtual display packages:
 *        sudo apt-get install -y webkit2gtk-driver xvfb
 *
 *   4. Windows only — Edge WebDriver is auto-downloaded by @wdio/tauri-service.
 *
 * Run after prerequisites (Linux):
 *   xvfb-run -a pnpm -C apps/desktop run test:e2e:wdio
 *
 * Run after prerequisites (Windows):
 *   pnpm -C apps/desktop run test:e2e:wdio
 *
 * Override binary path:
 *   TAURI_BINARY_PATH=/abs/path/to/binary xvfb-run -a pnpm -C apps/desktop run test:e2e:wdio
 *
 * tauri-plugin-wdio: NOT required for PR-1 smoke.
 * Normal WebDriver element interactions are enough for basic visibility assertions.
 * Advanced features (invoke mocking, log capture) are deferred to a later stage.
 */
import type { Options } from "@wdio/types";
import path from "path";
import { initTestEnvironment } from "./support/test-environment";

// Initialize isolated temp environment before any WDIO process starts.
// Returns cleanup function registered in onComplete below.
const cleanupTestEnvironment = initTestEnvironment();

function defaultBinaryPath(): string {
  // This project is a Cargo workspace: the shared target/ dir is at the repo root,
  // two levels above apps/desktop/ (where pnpm -C apps/desktop sets cwd).
  const base = path.resolve(process.cwd(), "..", "..", "target", "release");
  const name = "rack-inventory-studio-desktop";
  return process.platform === "win32"
    ? path.join(base, `${name}.exe`)
    : path.join(base, name);
}

const appBinaryPath =
  process.env["TAURI_BINARY_PATH"] ?? defaultBinaryPath();

export const config: Options.Testrunner = {
  runner: "local",

  specs: ["./specs/**/*.e2e.ts"],

  maxInstances: 1,
  logLevel: "info",

  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 3,

  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    // The @wdio/tauri-service with external driverProvider adds significant per-command
    // overhead in headless Xvfb.  Stage 1 (14 steps, 5 entity types, 4 modal cycles)
    // takes ~12 min.  Stage 2 adds placement, save/close/reopen, and persistence
    // verification (~13 min).  Stage 3A adds edit, remove, and two more close/reopen
    // cycles (~10 min additional); Stage 3B.1 adds 4 more edit cycles plus work mode
    // toggle across 5 entities (~50 min observed).
    // Longest individual spec observed: ~50 min → 60 min with margin.
    timeout: 3_600_000,
  },

  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        // Uses the standalone tauri-driver process (cargo install tauri-driver).
        // Linux: also needs webkit2gtk-driver + Xvfb system packages.
        // Windows: Edge WebDriver is auto-downloaded.
        // Switch to 'embedded' once tauri-plugin-wdio-webdriver is added to the
        // Rust app (eliminates the external tauri-driver dependency).
        driverProvider: "external",
      },
    ],
  ],

  capabilities: [
    {
      browserName: "tauri",
    },
  ],

  onComplete: () => {
    cleanupTestEnvironment();
  },
};
