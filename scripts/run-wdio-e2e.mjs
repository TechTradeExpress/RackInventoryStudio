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
 *   --expect-plugin <value>    plugin expectation: "present" or "absent"
 *   --binary <path>            use this binary instead of target-wdio-plugin/release/
 *
 * --binary and --expect-plugin are coupled and validated together:
 *   - --binary requires an explicit --expect-plugin (present|absent) — a
 *     custom binary's plugin status is never assumed.
 *   - --expect-plugin absent requires --binary <path> — the default binary
 *     (no --binary) always has the plugin built in, so "absent" without a
 *     custom binary is rejected rather than silently ignored.
 *
 * Default behaviour (no --binary, no --expect-plugin):
 *   - Builds the wdio-plugin binary via scripts/build-wdio-plugin-binary.mjs
 *   - Uses target-wdio-plugin/release/rack-inventory-studio-desktop
 *   - Sets RIS_WDIO_EXPECT_PLUGIN=present
 *
 * Diagnostic mode (--binary <path> --expect-plugin absent):
 *   - Skips the plugin build
 *   - Uses the provided binary
 *   - Sets RIS_WDIO_EXPECT_PLUGIN=absent
 *   - Does NOT set TAURI_BINARY_PATH to the plugin variant
 *
 * The child process environment is always deterministic: any
 * RIS_WDIO_EXPECT_PLUGIN / TAURI_BINARY_PATH inherited from the invoking
 * shell is discarded before this run's own values are applied (see
 * buildChildEnv). external is the only supported WDIO driver provider — see
 * docs/E2E_WDIO_PLAN.md's "Embedded WDIO provider removal" section.
 *
 * Ports 4444 and 4445 are checked before and after every run. If either is
 * occupied before the run, or the port state cannot be verified (ss missing
 * or failing) before or after, the runner refuses to report success — see
 * deriveFinalRunnerExitCode.
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
  if (opts.binary && opts.expectPlugin === null) {
    errors.push("--binary requires --expect-plugin present|absent");
  }
  if (!opts.binary && opts.expectPlugin === "absent") {
    errors.push(
      '--expect-plugin absent requires --binary <path>; the default binary is always ' +
        "built with the plugin (use --binary <path> --expect-plugin absent for a plain binary)",
    );
  }
  return errors;
}

/**
 * Resolves the absolute path to the wdio-plugin test binary.
 * Never touches process.env or the filesystem.
 */
export function resolvePluginBinaryPath(repoRoot, platform = process.platform) {
  const targetDir = resolveTargetDir(repoRoot, platform);
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
 * Any RIS_WDIO_EXPECT_PLUGIN / TAURI_BINARY_PATH inherited from baseEnv
 * (e.g. left over in the invoking shell) is deleted first, so the child
 * process's environment is fully determined by this run's own decisions —
 * never a mix of an explicit decision and a stale inherited value.
 *
 * Always sets:
 *   RIS_WDIO_EXPECT_PLUGIN=<expectPlugin>   (omitted when expectPlugin is null)
 *   TAURI_BINARY_PATH=<binaryPath>          (omitted when binaryPath is null)
 */
export function buildChildEnv(baseEnv, { expectPlugin, binaryPath }) {
  const env = { ...baseEnv };

  delete env["RIS_WDIO_EXPECT_PLUGIN"];
  delete env["TAURI_BINARY_PATH"];

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
  const benchArgs = [benchmarkScript, "--spec", spec, "--repeat", String(repeat), "--binary", binary];
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

// ── Port contract (pure functions — exported for unit tests) ──────────────────

const PORT_CONTRACT_PORTS = [4444, 4445];

/**
 * Parses `ss -ltnp` output and returns an entry for each listening socket
 * whose Local Address:Port column ends in exactly one of targetPorts.
 *
 * Matches on the numeric port value, not a substring of the line — ":44440"
 * or ":14444" must never be mistaken for ":4444". Column position is not
 * assumed (ss's column set varies by iproute2 version / -e flags): the
 * Local Address:Port column is identified as the first column matching
 * `:<digits>` at its end, which peer-address columns for LISTEN sockets
 * ("0.0.0.0:*", "*:*") never do.
 */
export function parseListeningPorts(ssOutput, targetPorts = PORT_CONTRACT_PORTS) {
  const targets = new Set(targetPorts);
  const occupied = [];
  const lines = (ssOutput ?? "").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const columns = trimmed.split(/\s+/);
    const localAddrCol = columns.find((c) => /:[0-9]+$/.test(c));
    if (!localAddrCol) continue;

    const port = Number(localAddrCol.match(/:([0-9]+)$/)[1]);
    if (!targets.has(port)) continue;

    const pidMatch = trimmed.match(/pid=(\d+)/);
    const nameMatch = trimmed.match(/\(\("([^"]+)"/);

    occupied.push({
      port,
      rawLine: line,
      pid: pidMatch ? Number(pidMatch[1]) : null,
      processName: nameMatch ? nameMatch[1] : null,
    });
  }

  return occupied;
}

/**
 * Interprets the result of `spawnSync("ss", ["-ltnp"], ...)`.
 * probeSucceeded is false when the spawn itself failed (e.g. ss not
 * installed) or ss exited non-zero — either case must be treated as "cannot
 * verify port state", never silently treated as "ports are free".
 */
export function inspectPortProbeResult(spawnResult, targetPorts = PORT_CONTRACT_PORTS) {
  if (spawnResult.error) {
    return { probeSucceeded: false, occupiedPorts: [] };
  }
  if (spawnResult.status !== 0) {
    return { probeSucceeded: false, occupiedPorts: [] };
  }
  return {
    probeSucceeded: true,
    occupiedPorts: parseListeningPorts(spawnResult.stdout ?? "", targetPorts),
  };
}

/**
 * Derives the final runner exit code from the child benchmark's exit code
 * and the post-run port probe. A non-zero child exit code is preserved
 * as-is (never clobbered with a generic 1). Only child_exit=0 AND a
 * successful post-run probe AND zero occupied ports can produce exit 0.
 */
export function deriveFinalRunnerExitCode({ childExitCode, postProbeSucceeded, occupiedPorts }) {
  if (childExitCode !== 0) return childExitCode;
  if (!postProbeSucceeded) return 1;
  if (occupiedPorts.length > 0) return 1;
  return 0;
}

// ── Side-effecting helpers (not unit tested) ──────────────────────────────────

/**
 * Runs the ss -ltnp port probe. On non-Linux platforms ss is not expected to
 * exist and the port contract does not apply (the canonical runner only
 * wraps xvfb-run on Linux), so the probe is skipped and reported as trivially
 * successful with no occupied ports.
 */
function checkPorts() {
  if (process.platform !== "linux") {
    return { probeSucceeded: true, occupiedPorts: [] };
  }
  const spawnResult = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  return inspectPortProbeResult(spawnResult);
}

function logOccupiedPorts(phase, occupiedPorts) {
  for (const occ of occupiedPorts) {
    console.error(`[run-wdio-e2e] ${phase}: port ${occ.port} is occupied`);
    console.error(`[run-wdio-e2e]   ${occ.rawLine}`);
    console.error(
      `[run-wdio-e2e]   pid=${occ.pid ?? "(unknown)"} process=${occ.processName ?? "(unknown)"}`,
    );
  }
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

  // Hard pre-run port contract: an unverifiable or occupied port state must
  // refuse to start the benchmark, not just warn. Never kills a pre-existing
  // process automatically — it is diagnosed and the run is aborted instead.
  const preProbe = checkPorts();
  if (!preProbe.probeSucceeded) {
    console.error(
      "[run-wdio-e2e] pre-run: unable to verify ports 4444/4445 are free (ss probe failed). " +
        "Refusing to start the benchmark.",
    );
    process.exit(1);
  }
  if (preProbe.occupiedPorts.length > 0) {
    logOccupiedPorts("pre-run", preProbe.occupiedPorts);
    console.error(
      "[run-wdio-e2e] pre-run: refusing to start the benchmark while ports 4444/4445 are occupied.",
    );
    process.exit(1);
  }

  // Determine plugin expectation. validateArgs() already enforces that
  // --binary always carries an explicit --expect-plugin, so opts.expectPlugin
  // can only be null here when no --binary was given — the default plugin
  // binary path, which always implies "present".
  const expectPlugin = opts.expectPlugin ?? "present";

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

  const childExitCode = deriveExitCode(result);

  // Hard post-run port contract: an unverifiable or still-occupied port
  // state must force a non-zero final exit code, even when the child
  // benchmark itself exited 0. A non-zero child exit code is always
  // preserved as-is.
  const postProbe = checkPorts();
  const finalExitCode = deriveFinalRunnerExitCode({
    childExitCode,
    postProbeSucceeded: postProbe.probeSucceeded,
    occupiedPorts: postProbe.occupiedPorts,
  });

  const portsFree = postProbe.probeSucceeded && postProbe.occupiedPorts.length === 0;
  console.log(
    `[run-wdio-e2e] Run complete — child_exit=${childExitCode} final_exit=${finalExitCode} ports_free=${portsFree}`,
  );
  if (!postProbe.probeSucceeded) {
    console.error(
      "[run-wdio-e2e] post-run: unable to verify ports 4444/4445 were released (ss probe failed).",
    );
  } else if (postProbe.occupiedPorts.length > 0) {
    logOccupiedPorts("post-run", postProbe.occupiedPorts);
    console.error(
      "[run-wdio-e2e] post-run: ports 4444/4445 not fully free after run. " +
        "Check for lingering tauri-driver processes.",
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
    console.error(`[run-wdio-e2e] Fatal error: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
