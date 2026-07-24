#!/usr/bin/env node
/**
 * Canonical E2E runner for the embedded WDIO driver provider.
 *
 * The embedded counterpart to scripts/run-wdio-e2e.mjs (external provider,
 * default `pnpm test:e2e:wdio`). This is the official way to run WDIO specs
 * against the in-process WebDriver server (tauri-plugin-wdio-webdriver,
 * RIS_WDIO_DRIVER_PROVIDER=embedded) instead of the external tauri-driver
 * process. It always uses the wdio-embedded test binary (built into
 * target-embedded/, never target/release/ or target-wdio-plugin/), sets the
 * embedded driver provider, and runs the benchmark runner's PID-safe
 * cleanup path. On Linux it wraps the run with xvfb-run -a.
 *
 * Usage:
 *   pnpm test:e2e:wdio:embedded -- --spec core-inventory
 *   pnpm test:e2e:wdio:embedded -- --spec app-smoke --repeat 2
 *   pnpm test:e2e:wdio:embedded -- --spec core-inventory --skip-build
 *   pnpm test:e2e:wdio:embedded -- --spec app-smoke --binary /path/to/binary
 *
 * Options:
 *   --spec <name>              spec name without .e2e.ts (required)
 *   --repeat <n>               number of runs, >= 1 (default: 1)
 *   --skip-build               skip building the wdio-embedded binary
 *   --continue-on-failure      keep running after a failed run
 *   --binary <path>            use this binary instead of target-embedded/release/
 *   --port <n>                 embedded WebDriver server port (default: 4445)
 *
 * Default behaviour (no --binary):
 *   - Builds the wdio-embedded binary via scripts/build-wdio-embedded-binary.mjs
 *   - Uses target-embedded/release/rack-inventory-studio-desktop
 *   - Sets RIS_WDIO_DRIVER_PROVIDER=embedded
 *   - Sets RIS_WDIO_EMBEDDED_PORT=<port> (default 4445)
 *
 * The production binary is never used: the default binary always comes from
 * the dedicated target-embedded/ build, and a custom --binary is the
 * caller's own responsibility (same contract as run-wdio-e2e.mjs's
 * --binary), but this runner never falls back to target/release/ silently —
 * see isRegularTargetPath.
 *
 * The child process environment is always deterministic: any
 * RIS_WDIO_DRIVER_PROVIDER / RIS_WDIO_EMBEDDED_PORT / TAURI_BINARY_PATH
 * inherited from the invoking shell is discarded before this run's own
 * values are applied (see buildChildEnv).
 *
 * Only the embedded WebDriver port (default 4445, or --port) is checked
 * before and after every run — unlike the external runner, embedded does
 * not spawn tauri-driver on port 4444. If the port is occupied before the
 * run, or its state cannot be verified (ss missing or failing) before or
 * after, the runner refuses to report success — see
 * deriveFinalRunnerExitCode (reused from run-wdio-e2e.mjs). A pre-existing
 * process on the port is diagnosed and the run is aborted — this runner
 * never kills a process it did not start itself.
 *
 * On Linux the run is wrapped with xvfb-run -a. xvfb-run must be installed
 * (apt-get install -y xvfb). No WebKitWebDriver/tauri-driver is required —
 * the embedded provider does not spawn an external driver process.
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
} from "./build-wdio-embedded-binary.mjs";
import { parseListeningPorts, inspectPortProbeResult, deriveFinalRunnerExitCode } from "./run-wdio-e2e.mjs";

const DEFAULT_EMBEDDED_PORT = 4445;

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
    binary: null,
    port: DEFAULT_EMBEDDED_PORT,
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
      case "--binary":
        result.binary = args[++i] ?? null;
        break;
      case "--port": {
        const raw = args[++i];
        result.port = raw === undefined ? NaN : Number(raw);
        break;
      }
      default:
        throw new Error(`[run-wdio-e2e-embedded] Unknown argument: ${args[i]}`);
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
  if (!Number.isInteger(opts.port) || opts.port < 1024 || opts.port > 65535) {
    errors.push("--port must be an integer in [1024, 65535] (default: 4445)");
  }
  return errors;
}

/**
 * Resolves the absolute path to the wdio-embedded test binary.
 * Never touches process.env or the filesystem.
 */
export function resolveEmbeddedBinaryPath(repoRoot, platform = process.platform) {
  const targetDir = resolveTargetDir(repoRoot);
  return resolveBinaryPath(targetDir, platform);
}

/**
 * Returns true when the embedded binary should be built before the run.
 * Build is skipped when --skip-build is set or when a custom --binary is
 * provided (callers who pass their own binary are responsible for building it).
 */
export function shouldBuildEmbedded(opts) {
  return !opts.skipBuild && !opts.binary;
}

/**
 * Builds the child-process environment for the benchmark runner.
 * Returns a new object — never mutates baseEnv or process.env.
 *
 * Any RIS_WDIO_DRIVER_PROVIDER / RIS_WDIO_EMBEDDED_PORT / TAURI_BINARY_PATH
 * inherited from baseEnv (e.g. left over in the invoking shell) is deleted
 * first, so the child process's environment is fully determined by this
 * run's own decisions — never a mix of an explicit decision and a stale
 * inherited value.
 *
 * Always sets:
 *   RIS_WDIO_DRIVER_PROVIDER=embedded
 *   RIS_WDIO_EMBEDDED_PORT=<port>
 *   TAURI_BINARY_PATH=<binaryPath>
 */
export function buildChildEnv(baseEnv, { port, binaryPath }) {
  const env = { ...baseEnv };

  delete env["RIS_WDIO_DRIVER_PROVIDER"];
  delete env["RIS_WDIO_EMBEDDED_PORT"];
  delete env["TAURI_BINARY_PATH"];

  env["RIS_WDIO_DRIVER_PROVIDER"] = "embedded";
  env["RIS_WDIO_EMBEDDED_PORT"] = String(port);
  env["TAURI_BINARY_PATH"] = binaryPath;

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
    "embedded",
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

/**
 * Runs the ss -ltnp port probe for the configured embedded port only —
 * unlike the external runner, embedded never spawns tauri-driver on 4444.
 * On non-Linux platforms ss is not expected to exist and the port contract
 * does not apply (this runner only wraps xvfb-run on Linux), so the probe
 * is skipped and reported as trivially successful with no occupied ports.
 */
function checkPort(port) {
  if (process.platform !== "linux") {
    return { probeSucceeded: true, occupiedPorts: [] };
  }
  const spawnResult = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  return inspectPortProbeResult(spawnResult, [port]);
}

function logOccupiedPorts(phase, occupiedPorts) {
  for (const occ of occupiedPorts) {
    console.error(`[run-wdio-e2e-embedded] ${phase}: port ${occ.port} is occupied`);
    console.error(`[run-wdio-e2e-embedded]   ${occ.rawLine}`);
    console.error(
      `[run-wdio-e2e-embedded]   pid=${occ.pid ?? "(unknown)"} process=${occ.processName ?? "(unknown)"}`,
    );
  }
}

// Re-exported so tests can exercise the same parsing logic this module uses
// for its port contract without duplicating it.
export { parseListeningPorts, deriveFinalRunnerExitCode };

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
    for (const err of errors) console.error(`[run-wdio-e2e-embedded] ${err}`);
    process.exit(1);
  }

  // Resolve binary path
  let binaryPath;
  if (opts.binary) {
    binaryPath = resolve(opts.binary);
  } else {
    binaryPath = resolveEmbeddedBinaryPath(repoRoot);
  }

  // Safety guard: refuse the regular target/release path — the embedded
  // runner must never drive the production binary.
  if (isRegularTargetPath(binaryPath, repoRoot)) {
    console.error(
      `[run-wdio-e2e-embedded] Refusing to run: resolved binary path "${binaryPath}" ` +
        `falls under the regular target/release directory. ` +
        `Use pnpm build:e2e:wdio-embedded to build the wdio-embedded test binary.`,
    );
    process.exit(1);
  }

  // Build embedded binary (unless skipped or using a custom binary)
  if (shouldBuildEmbedded(opts)) {
    console.log("[run-wdio-e2e-embedded] Building wdio-embedded binary (use --skip-build to skip)...");
    const buildResult = spawnSync(
      "node",
      [join(scriptDir, "build-wdio-embedded-binary.mjs")],
      { stdio: "inherit", shell: false, cwd: repoRoot },
    );
    if (buildResult.status !== 0) {
      console.error(
        `[run-wdio-e2e-embedded] Embedded binary build failed (exit ${buildResult.status ?? "null"})`,
      );
      process.exit(buildResult.status ?? 1);
    }
  }

  // Verify binary exists
  if (!existsSync(binaryPath)) {
    console.error(`[run-wdio-e2e-embedded] Binary not found: ${binaryPath}`);
    if (!opts.binary) {
      console.error("[run-wdio-e2e-embedded] Run: pnpm build:e2e:wdio-embedded");
    }
    process.exit(1);
  }

  console.log(
    `[run-wdio-e2e-embedded] provider=embedded buildVariant=wdio-embedded binary=${binaryPath} port=${opts.port}`,
  );

  // Hard pre-run port contract: an unverifiable or occupied port state must
  // refuse to start the benchmark, not just warn. Never kills a pre-existing
  // process automatically — it is diagnosed and the run is aborted instead.
  const preProbe = checkPort(opts.port);
  if (!preProbe.probeSucceeded) {
    console.error(
      `[run-wdio-e2e-embedded] pre-run: unable to verify port ${opts.port} is free (ss probe failed). ` +
        "Refusing to start the benchmark.",
    );
    process.exit(1);
  }
  if (preProbe.occupiedPorts.length > 0) {
    logOccupiedPorts("pre-run", preProbe.occupiedPorts);
    console.error(
      `[run-wdio-e2e-embedded] pre-run: refusing to start the benchmark while port ${opts.port} is occupied.`,
    );
    process.exit(1);
  }

  const childEnv = buildChildEnv(process.env, { port: opts.port, binaryPath });

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
    `[run-wdio-e2e-embedded] spec=${opts.spec} repeat=${opts.repeat} binary=${binaryPath}`,
  );
  console.log(`[run-wdio-e2e-embedded] running: ${executable} ${args.slice(0, 4).join(" ")} ...`);

  const result = spawnSync(executable, args, {
    stdio: "inherit",
    shell: false,
    env: childEnv,
    cwd: repoRoot,
  });

  if (result.error) {
    // Preserve the original spawn failure as `cause` rather than only its
    // message, so a caller inspecting the thrown error (or reading the
    // logged "Caused by" line below) sees the real underlying error, not a
    // generic wrapper.
    throw new Error(`Failed to spawn process: ${result.error.message}`, { cause: result.error });
  }

  const childExitCode = deriveExitCode(result);

  // Hard post-run port contract: an unverifiable or still-occupied port
  // state must force a non-zero final exit code, even when the child
  // benchmark itself exited 0. A non-zero child exit code is always
  // preserved as-is.
  const postProbe = checkPort(opts.port);
  const finalExitCode = deriveFinalRunnerExitCode({
    childExitCode,
    postProbeSucceeded: postProbe.probeSucceeded,
    occupiedPorts: postProbe.occupiedPorts,
  });

  const portFree = postProbe.probeSucceeded && postProbe.occupiedPorts.length === 0;
  console.log(
    `[run-wdio-e2e-embedded] Run complete — provider=embedded child_exit=${childExitCode} ` +
      `final_exit=${finalExitCode} port_free=${portFree}`,
  );
  if (!postProbe.probeSucceeded) {
    console.error(
      `[run-wdio-e2e-embedded] post-run: unable to verify port ${opts.port} was released (ss probe failed).`,
    );
  } else if (postProbe.occupiedPorts.length > 0) {
    logOccupiedPorts("post-run", postProbe.occupiedPorts);
    console.error(
      `[run-wdio-e2e-embedded] post-run: port ${opts.port} not free after run. ` +
        "Check for lingering embedded-server processes.",
    );
  }

  process.exit(finalExitCode);
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
    console.error(`[run-wdio-e2e-embedded] Fatal error: ${e.stack ?? e.message}`);
    if (e.cause) {
      console.error(
        `[run-wdio-e2e-embedded] Caused by: ${e.cause.stack ?? e.cause.message ?? String(e.cause)}`,
      );
    }
    process.exit(1);
  });
}
