/**
 * WebdriverIO configuration for Tauri desktop E2E tests.
 *
 * Prerequisites before running:
 *   1. Build the Tauri release binary (from apps/desktop/):
 *        pnpm tauri build
 *      or: cargo build --release  (from apps/desktop/src-tauri/)
 *
 *   2. Install tauri-driver (one-time, requires Rust):
 *        cargo install tauri-driver
 *
 *   3. Linux only — install the WebKit WebDriver system package:
 *        sudo apt-get install -y webkit2gtk-driver
 *
 *   4. Windows only — Edge WebDriver is auto-downloaded by @wdio/tauri-service.
 *
 * Run after prerequisites:
 *   pnpm -C apps/desktop run test:e2e:wdio
 *
 * Override binary path:
 *   TAURI_BINARY_PATH=/abs/path/to/binary pnpm -C apps/desktop run test:e2e:wdio
 *
 * tauri-plugin-wdio: NOT required for PR-1 smoke.
 * Normal WebDriver element interactions are enough for basic visibility assertions.
 * Advanced features (invoke mocking, log capture) are deferred to a later stage.
 */
import type { Options } from "@wdio/types";
import path from "path";

function defaultBinaryPath(): string {
  const base = path.resolve(process.cwd(), "src-tauri", "target", "release");
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
    timeout: 60_000,
  },

  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        /**
         * driverProvider: 'external'
         * Uses the standalone tauri-driver process (cargo install tauri-driver).
         * Linux: also needs webkit2gtk-driver system package.
         * Windows: Edge WebDriver is auto-downloaded.
         *
         * Switch to 'embedded' once tauri-plugin-wdio-webdriver is added to the
         * Rust app (eliminates the external tauri-driver dependency).
         */
        driverProvider: "external",
      },
    ],
  ],

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],
};
