#!/usr/bin/env node
/**
 * Canonical E2E runner for WDIO specs.
 *
 * This is the official way to run WDIO specs. It always uses the
 * wdio-plugin test binary (built into target-wdio-plugin/, never
 * target/release/), sets the external driver provider, and runs the
 * benchmark runner's PID-safe cleanup path. On Linux it wraps the run
 * with xvfb-run -a.
 *
 * Usage:
 *   pnpm test:e2e:wdio -- --spec core-inventory
 *   pnpm test:e2e:wdio -- --spec representative-latency --repeat 2
 *   pnpm test:e2e:wdio -- --spec core-inventory --skip-build
 *   pnpm test:e2e:wdio -- --spec app-smoke --expect-plugin absent --binary /path/to/binary
 *
 * Options:
 *   --spec <name>              spec name without .e2e.ts (required)
 *   --repeat <n>               number of runs, >= 1 (default: 1)
 *   --skip-build               skip building the wdio-plugin binary
 *   --continue-on-failure      keep running after a failed run
 *   --expect-plugin <value>    override plugin expectation: "present" or "absent"
 *                              (default: "present" unless --binary is provided)
 *   --binary <path>            use this binary instead of target-wdio-plugin/release/
 *
 * Default behaviour (no --binary):
 *   - Builds the wdio-plugin binary via scripts/build-wdio-plugin-binary.mjs
 *   - Uses target-wdio-plugin/release/rack-inventory-studio-desktop
 *   - Sets RIS_WDIO_EXPECT_PLUGIN=present
 *   - Sets RIS_WDIO_DRIVER_PROVIDER=external
 *
 * Diagnostic mode (--expect-plugin absent --binary <path>):
 *   - Skips the plugin build
 *   - Uses the provided binary
 *   - Sets RIS_WDIO_EXPECT_PLUGIN=absent
 *   - Does NOT set TAURI_BINARY_PATH to the plugin variant
 *
 * On Linux the run is wrapped with xvfb-run -a. xvfb-run must be installed
 * (apt-get install -y xvfb). WebKitWebDriver must also be installed
 * (apt-get install -y webkit2gtk-driver).
 *
 * Uses only Node.js built-in modules — no extra dependencies.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isKnownSpecName,
  BENCHMARK_ONLY_SPECS,
  listAvailableSpecNames,
} from "./run-wdio-performance-benchmark.mjs";
import {
  resolveTargetDir,
  resolveBinaryPath,
  isRegularTargetPath,
} from "./build-wdio-plugin-binary.mjs";

// ── Pure helpers (exported for unit tests — no process spawned) ───────────────

/**
 * Parses the argument list returned by process.argv.
 * Does not touch process.env or the filesystem.
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    spec: null,
    repeat: 1,
    skipBuild: false,
    continueOnFailure: false,
    expectPlugin: null,
    binary: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--spec":
        result.spec = args[++i] ?? null;
        break;
      case "--repeat": {
        const raw = args[++i];
        result.repeat = raw === undefined ? NaN : Number(raw);
        break;
      }
      case "--skip-build":
        result.skipBuild = true;
        break;
      case "--continue-on-failure":
        result.continueOnFailure = true;
        break;
      case "--expect-plugin":
        result.expectPlugin = args[++i] ?? null;
        break;
      case "--binary":
        result.binary = args[++i] ?? null;
        break;
      default:
        throw new Error(`[run-wdio-e2e] Unknown argument: ${args[i]}`);
    }
  }
  return result;
}

/**
 * Validates parsed options. Returns a list of error strings; empty means valid.
 * Uses isKnownSpecName to check against the real filesystem allowlist.
 */
export function validateArgs(opts, specsDir) {
  const errors = [];
  if (!opts.spec) {
    errors.push("--spec is required");
  } else if (!isKnownSpecName(opts.spec, specsDir)) {
    const known = [...BENCHMARK_ONLY_SPECS, ...listAvailableSpecNames(specsDir)];
    errors.push(
      `--spec "${opts.spec}" is not a known spec name. ` +
        `Allowed characters: letters, digits, "-", "_" (no path separators). ` +
        `Known specs: ${known.join(", ")}`,
    );
  }
  if (!Number.isInteger(opts.repeat) || opts.repeat < 1) {
    errors.push("--repeat must be a positive integer (default: 1)");
  }
  if (
    opts.expectPlugin !== null &&
    opts.expectPlugin !== "present" &&
    opts.expectPlugin !== "absent"
  ) {
    errors.push(`--expect-plugin must be "present" or "absent" (got "${opts.expectPlugin}")`);
  }
  return errors;
}

/**
 * Resolves the absolute path to the wdio-plugin test binary.
 * Never touches process.env or the filesystem.
 */
export function resolvePluginBinaryPath(repoRoot, platform = process.platform) {
  const targetDir = resolveTargetDir(repoRoot);
  return resolveBinaryPath(targetDir, platform);
}

/**
 * Returns true when the plugin binary should be built before the run.
 * Build is skipped when --skip-build is set or when a custom --binary is
 * provided (callers who pass their own binary are responsible for building it).
 */
export function shouldBuildPlugin(opts) {
  return !opts.skipBuild && !opts.binary;
}

/**
 * Builds the child-process environment for the benchmark runner.
 * Returns a new object — never mutates baseEnv or process.env.
 *
 * Always sets:
 *   RIS_WDIO_DRIVER_PROVIDER=external
 *   RIS_WDIO_EXPECT_PLUGIN=<expectPlugin>
 *   TAURI_BINARY_PATH=<binaryPath>
 *
 * When expectPlugin is null the env var is omitted (no plugin check).
 */
export function buildChildEnv(baseEnv, { expectPlugin, binaryPath }) {
  const env = { ...baseEnv };
  env["RIS_WDIO_DRIVER_PROVIDER"] = "external";
  if (expectPlugin !== null && expectPlugin !== undefined) {
    env["RIS_WDIO_EXPECT_PLUGIN"] = expectPlugin;
  }
  if (binaryPath !== null && binaryPath !== undefined) {
    env["TAURI_BINARY_PATH"] = binaryPath;
  }
  return env;
}

/**
 * Builds the { executable, args } pair for spawning the benchmark runner.
 * On Linux, wraps with xvfb-run -a.
 * Never mutates process.env.
 */
export function buildRunCommand({
  nodeExe,
  benchmarkScript,
  spec,
  repeat,
  binary,
  continueOnFailure,
  platform = process.platform,
}) {
  const benchArgs = [
    benchmarkScript,
    "--provider",
    "external",
    "--spec",
    spec,
    "--repeat",
    String(repeat),
    "--binary",
    binary,
  ];
  if (continueOnFailure) benchArgs.push("--continue-on-failure");

  if (platform === "linux") {
    return { executable: "xvfb-run", args: ["-a", nodeExe, ...benchArgs] };
  }
  return { executable: nodeExe, args: benchArgs };
}

/**
 * Derives the process exit code from a spawnSync result.
 * If the child was killed by a signal or status is null, returns 1.
 */
export function deriveExitCode(spawnResult) {
  if (spawnResult.error) return 1;
  return spawnResult.status ?? 1;
}

// ── Side-effecting helpers (not unit tested) ──────────────────────────────────

function warnIfPortsOccupied(phase) {
  if (process.platform !== "linux") return;
  const result = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  const out = result.stdout ?? "";
  for (const port of ["4444", "4445"]) {
    if (new RegExp(`:${port}\\b`).test(out)) {
      console.warn(`[run-wdio-e2e] ${phase}: port ${port} is occupied`);
    }
  }
}

function portsAreFree() {
  if (process.platform !== "linux") return true;
  const result = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  const out = result.stdout ?? "";
  return !["4444", "4445"].some((p) => new RegExp(`:${p}\\b`).test(out));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const desktopDir = join(repoRoot, "apps", "desktop");
  const specsDir = join(desktopDir, "e2e-wdio", "specs");

  const errors = validateArgs(opts, specsDir);
  if (errors.length > 0) {
    for (const err of errors) console.error(`[run-wdio-e2e] ${err}`);
    process.exit(1);
  }

  // Resolve binary path
  let binaryPath;
  if (opts.binary) {
    binaryPath = resolve(opts.binary);
  } else {
    binaryPath = resolvePluginBinaryPath(repoRoot);
  }

  // Safety guard: refuse the regular target/release path
  if (isRegularTargetPath(binaryPath, repoRoot)) {
    console.error(
      `[run-wdio-e2e] Refusing to run: resolved binary path "${binaryPath}" ` +
        `falls under the regular target/release directory. ` +
        `Use pnpm build:e2e:wdio-plugin to build the wdio-plugin test binary.`,
    );
    process.exit(1);
  }

  // Build plugin binary (unless skipped or using a custom binary)
  if (shouldBuildPlugin(opts)) {
    console.log("[run-wdio-e2e] Building wdio-plugin binary (use --skip-build to skip)...");
    const buildResult = spawnSync(
      "node",
      [join(scriptDir, "build-wdio-plugin-binary.mjs")],
      { stdio: "inherit", shell: false, cwd: repoRoot },
    );
    if (buildResult.status !== 0) {
      console.error(
        `[run-wdio-e2e] Plugin binary build failed (exit ${buildResult.status ?? "null"})`,
      );
      process.exit(buildResult.status ?? 1);
    }
  }

  // Verify binary exists
  if (!existsSync(binaryPath)) {
    console.error(`[run-wdio-e2e] Binary not found: ${binaryPath}`);
    if (!opts.binary) {
      console.error("[run-wdio-e2e] Run: pnpm build:e2e:wdio-plugin");
    }
    process.exit(1);
  }

  warnIfPortsOccupied("pre-run");

  // Determine plugin expectation
  const expectPlugin = opts.expectPlugin ?? (opts.binary ? null : "present");

  const childEnv = buildChildEnv(process.env, { expectPlugin, binaryPath });

  const benchmarkScript = join(scriptDir, "run-wdio-performance-benchmark.mjs");
  const { executable, args } = buildRunCommand({
    nodeExe: process.execPath,
    benchmarkScript,
    spec: opts.spec,
    repeat: opts.repeat,
    binary: binaryPath,
    continueOnFailure: opts.continueOnFailure,
    platform: process.platform,
  });

  console.log(
    `[run-wdio-e2e] spec=${opts.spec} repeat=${opts.repeat} ` +
      `binary=${binaryPath} RIS_WDIO_EXPECT_PLUGIN=${childEnv["RIS_WDIO_EXPECT_PLUGIN"] ?? "(unset)"}`,
  );
  console.log(`[run-wdio-e2e] running: ${executable} ${args.slice(0, 4).join(" ")} ...`);

  const result = spawnSync(executable, args, {
    stdio: "inherit",
    shell: false,
    env: childEnv,
    cwd: repoRoot,
  });

  if (result.error) {
    console.error(`[run-wdio-e2e] Failed to spawn process: ${result.error.message}`);
    if (process.platform === "linux" && executable === "xvfb-run") {
      console.error(
        "[run-wdio-e2e] xvfb-run not found. Install with: apt-get install -y xvfb webkit2gtk-driver",
      );
    }
    process.exit(1);
  }

  const exitCode = deriveExitCode(result);
  const clean = portsAreFree();
  console.log(
    `[run-wdio-e2e] Run complete — exit=${exitCode} ports_free=${clean}`,
  );
  if (!clean) {
    console.warn(
      "[run-wdio-e2e] Ports 4444/4445 not fully free after run. " +
        "Check for lingering tauri-driver processes.",
    );
  }

  process.exit(exitCode);
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main().catch((e) => {
    console.error(`[run-wdio-e2e] Fatal error: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
