/**
 * WebdriverIO configuration for Tauri desktop E2E tests.
 *
 * ── Canonical usage (Linux, primary E2E environment) ─────────────────────────
 *
 * Use the canonical wrapper — it builds the wdio-plugin binary, sets the
 * correct env vars, wraps with Xvfb, and uses PID-safe cleanup:
 *
 *   pnpm test:e2e:wdio -- --spec core-inventory
 *   pnpm test:e2e:wdio -- --spec representative-latency --repeat 2
 *
 * The wrapper:
 *   - builds the wdio-plugin test binary into target-wdio-plugin/ (not target/release/)
 *   - sets RIS_WDIO_DRIVER_PROVIDER=external, RIS_WDIO_EXPECT_PLUGIN=present,
 *     TAURI_BINARY_PATH=<repo>/target-wdio-plugin/release/rack-inventory-studio-desktop
 *     — any of these three inherited from the invoking shell is discarded first,
 *     so the child environment is always fully determined by this run, never a
 *     mix with a stale leftover value
 *   - wraps with xvfb-run -a on Linux
 *   - uses PID-safe cleanup via scripts/run-wdio-performance-benchmark.mjs
 *   - refuses to report success if ports 4444/4445 are occupied before the run,
 *     remain occupied after it, or their state cannot be verified — see
 *     deriveFinalRunnerExitCode in scripts/run-wdio-e2e.mjs
 *   - a custom --binary always requires an explicit --expect-plugin
 *     present|absent; a custom binary's plugin status is never assumed
 *
 * ── Embedded provider canonical wrapper ───────────────────────────────────────
 *
 * The embedded-provider counterpart of the wrapper above — builds the
 * wdio-embedded binary into target-embedded/ (--features wdio-embedded,
 * never target/release/ or target-wdio-plugin/), sets
 * RIS_WDIO_DRIVER_PROVIDER=embedded and RIS_WDIO_EMBEDDED_PORT, and enforces
 * the same port-free contract (4445 only — embedded never spawns
 * tauri-driver on 4444):
 *
 *   pnpm test:e2e:wdio:embedded -- --spec core-inventory
 *   pnpm test:e2e:wdio:embedded -- --spec app-smoke --repeat 2
 *
 * See scripts/run-wdio-e2e-embedded.mjs and docs/E2E_WDIO_PLAN.md's
 * "Technical pass — Node 24, dependency audit, embedded driver restoration"
 * section for the full embedded-driver validation history.
 *
 * ── Prerequisites (one-time) ─────────────────────────────────────────────────
 *
 *   1. Install tauri-driver:
 *        cargo install tauri-driver
 *
 *   2. Linux only — install WebKit WebDriver and virtual display:
 *        sudo apt-get install -y webkit2gtk-driver xvfb
 *
 *   3. Windows only — Edge WebDriver is auto-downloaded by @wdio/tauri-service.
 *
 * ── Binary variants ───────────────────────────────────────────────────────────
 *
 *   wdio-plugin (E2E runs):
 *     Built by scripts/build-wdio-plugin-binary.mjs into target-wdio-plugin/release/.
 *     Compiled with --features wdio-plugin so tauri-plugin-wdio is registered.
 *     Never overwrites target/release/ (production binary).
 *
 *   production binary (smoke check only):
 *     Built by `pnpm -C apps/desktop tauri build --no-bundle` into target/release/.
 *     Does NOT include tauri-plugin-wdio — it is strictly test-only.
 *     Used with RIS_WDIO_EXPECT_PLUGIN=absent to confirm plugin absence at runtime.
 *
 * ── tauri-plugin-wdio ────────────────────────────────────────────────────────
 *
 * The production application does not require or ship tauri-plugin-wdio.
 * The dedicated external-provider E2E binary requires the test-only
 * wdio-plugin feature to avoid the service's plugin-availability retry loop.
 * Without tauri-plugin-wdio, @wdio/tauri-service retries a plugin-availability
 * probe up to 100 times (~7–8 s) on every findElement/elementClick/getTitle/$/$$ command.
 *
 * ── Driver provider (default: external) ──────────────────────────────────────
 *
 *   RIS_WDIO_DRIVER_PROVIDER=external   — tauri-driver process (default)
 *   RIS_WDIO_DRIVER_PROVIDER=embedded   — embedded WebDriver server in the binary
 *                                         (requires the binary compiled with
 *                                          --features wdio-embedded)
 *   RIS_WDIO_EMBEDDED_PORT=4445         — port for the embedded server (default 4445)
 *
 * ── Command timing ────────────────────────────────────────────────────────────
 *
 *   RIS_WDIO_TIMING=1                   — enable per-command timing instrumentation
 *   RIS_WDIO_SLOW_COMMAND_MS=500        — log commands slower than N ms (default 500)
 *
 * ── Plugin-presence contract check ───────────────────────────────────────────
 *
 *   RIS_WDIO_EXPECT_PLUGIN=present      — assert window.wdioTauri exists (wdio-plugin binary)
 *   RIS_WDIO_EXPECT_PLUGIN=absent       — assert window.wdioTauri does not exist (production binary)
 *   Unset by default — no check runs, no behavioural change.
 *
 * ── Test environment isolation ───────────────────────────────────────────────
 *
 * The test-environment helper is initialized at module-load time so that the
 * XDG and git isolation env vars are in process.env before the WDIO launcher
 * spawns workers and before tauri-driver launches the Tauri binary.
 *
 * ── Linux validation status ───────────────────────────────────────────────────
 *
 * The canonical runner's port contract, the plugin-presence probe (both
 * present/absent), the six specs modified by the Stage 3B.4 Linux repair
 * pass, `representative-latency ×2`, and `core-inventory ×2` have all been
 * validated directly on Linux/WebKitWebDriver — see
 * docs/E2E_WDIO_LATENCY_OPTIMIZATION.md §13 for full results. The full
 * 12-spec external suite remains intentionally deferred, not a merge gate
 * for external-provider work. The full 12-spec suite HAS been validated
 * under the embedded provider (`pnpm test:e2e:wdio:embedded`) — see
 * docs/E2E_WDIO_PLAN.md's "Technical pass — Node 24, dependency audit,
 * embedded driver restoration" section.
 */
import type { Options } from "@wdio/types";
import path from "path";
import { initTestEnvironment } from "./support/test-environment";
import { patchWdioConfig } from "./support/command-timing";
import { assertPluginPresenceContract } from "./support/plugin-presence";

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
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
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
  waitforInterval: 100,
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

  // Opt-in plugin-presence contract check — no-op unless RIS_WDIO_EXPECT_PLUGIN
  // is set. Set before patchWdioConfig() wraps `before` for timing capture, so
  // both hooks chain correctly regardless of RIS_WDIO_TIMING.
  before: async (_capabilities, _specs, browser) => {
    await assertPluginPresenceContract(browser);
  },

  onComplete: () => {
    cleanupTestEnvironment();
  },
};

// Apply opt-in timing instrumentation.  No-op when RIS_WDIO_TIMING is unset.
patchWdioConfig(config);
