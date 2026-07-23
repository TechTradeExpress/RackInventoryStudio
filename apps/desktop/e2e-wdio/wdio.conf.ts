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
 * Driver provider (default: external):
 *   RIS_WDIO_DRIVER_PROVIDER=external   — tauri-driver process (default)
 *   RIS_WDIO_DRIVER_PROVIDER=embedded   — embedded WebDriver server in the binary
 *                                         (requires the binary compiled with
 *                                          --features wdio-embedded)
 *   RIS_WDIO_EMBEDDED_PORT=4445         — port for the embedded server (default 4445)
 *
 * Opt-in command timing (Windows performance experiment):
 *   RIS_WDIO_TIMING=1                   — enable per-command timing instrumentation
 *   RIS_WDIO_SLOW_COMMAND_MS=500        — log commands slower than N ms (default 500)
 *
 * tauri-plugin-wdio: NOT required for PR-1 smoke.
 * Normal WebDriver element interactions are enough for basic visibility assertions.
 * Advanced features (invoke mocking, log capture) are deferred to a later stage.
 */
import type { Options } from "@wdio/types";
import path from "path";
import { initTestEnvironment } from "./support/test-environment";
import { patchWdioConfig } from "./support/command-timing";

// Initialize isolated temp environment before any WDIO process starts.
// Returns cleanup function registered in onComplete below.
const cleanupTestEnvironment = initTestEnvironment();

// ── Driver provider ───────────────────────────────────────────────────────────

const ALLOWED_PROVIDERS = ["external", "embedded"] as const;
type DriverProvider = (typeof ALLOWED_PROVIDERS)[number];

function resolveProvider(): DriverProvider {
  const raw = process.env["RIS_WDIO_DRIVER_PROVIDER"];
  if (raw === undefined) return "external";
  if ((ALLOWED_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as DriverProvider;
  }
  throw new Error(
    `[wdio.conf] Invalid RIS_WDIO_DRIVER_PROVIDER="${raw}". ` +
      `Allowed values: ${ALLOWED_PROVIDERS.join(", ")}.`,
  );
}

function resolveEmbeddedPort(): number {
  const raw = process.env["RIS_WDIO_EMBEDDED_PORT"];
  if (raw === undefined) return 4445;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1024 || n > 65535) {
    throw new Error(
      `[wdio.conf] Invalid RIS_WDIO_EMBEDDED_PORT="${raw}". ` +
        `Must be an integer in [1024, 65535].`,
    );
  }
  return n;
}

const driverProvider = resolveProvider();
const embeddedPort = resolveEmbeddedPort();

// ── Binary path ───────────────────────────────────────────────────────────────

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

// ── Service options ───────────────────────────────────────────────────────────

type ServiceEntry = [string, Record<string, unknown>];

function buildServiceEntry(): ServiceEntry {
  const base: Record<string, unknown> = {
    appBinaryPath,
    driverProvider,
  };
  if (driverProvider === "embedded") {
    // embeddedPort tells the service which port to expect the in-app WebDriver
    // server to listen on.  The service sets TAURI_WEBDRIVER_PORT for the binary.
    base["embeddedPort"] = embeddedPort;
  }
  return ["@wdio/tauri-service", base];
}

// ── Config ────────────────────────────────────────────────────────────────────

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
    // toggle across 5 entities (~57 min observed).
    // Stage 3B.2 guard specs (destructive-guards-inventory, destructive-guards-hierarchy)
    // include 3× navigateToRackDetail + full 7-part graph assertions, observed ~70 min.
    // Longest individual spec observed: ~70 min → 90 min with margin (~20 min margin).
    timeout: 5_400_000,
  },

  services: [buildServiceEntry()],

  capabilities: [
    {
      browserName: "tauri",
    },
  ],

  onComplete: () => {
    cleanupTestEnvironment();
  },
};

// Apply opt-in timing instrumentation.  No-op when RIS_WDIO_TIMING is unset.
patchWdioConfig(config);
