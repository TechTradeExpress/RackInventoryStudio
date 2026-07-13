/**
 * WebdriverIO configuration for Tauri desktop E2E tests.
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
    // The @wdio/tauri-service beforeCommand hook runs a plugin-availability
    // check before every WebDriver command (~100ms per command).  Combined with
    // the Tauri app's ~15 s cold-start time, the full smoke scenario needs
    // well above 60 s.  Set 3 min so CI has headroom without being infinite.
    timeout: 180_000,
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
};
