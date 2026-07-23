#!/usr/bin/env node
/**
 * WDIO performance benchmark runner — external vs. embedded driver provider.
 *
 * Single-provider (smoke) usage:
 *   node scripts/run-wdio-performance-benchmark.mjs \
 *     --provider external --spec app-smoke --repeat 1
 *
 *   node scripts/run-wdio-performance-benchmark.mjs \
 *     --provider embedded --spec core-inventory --repeat 1 \
 *     --binary "C:\path\to\rack-inventory-studio-desktop.exe"
 *
 * Controlled A/B comparison (same binary, alternating provider order):
 *   node scripts/run-wdio-performance-benchmark.mjs \
 *     --compare --spec app-smoke --repeat 2 \
 *     --binary "C:\path\to\rack-inventory-studio-desktop.exe"
 *
 * Options:
 *   --provider  external | embedded          (required unless --compare)
 *   --spec      spec name without .e2e.ts    (required)
 *   --repeat    number of runs, >= 1         (required)
 *   --binary    path to the Tauri binary     (required with --compare; optional otherwise)
 *   --compare   run the alternating external/embedded A/B matrix on one binary
 *   --continue-on-failure   keep running after a failed run (default: stop)
 *
 * A run is only considered PASSED when the WDIO process exits 0 AND the
 * timing report it produced (summary.json + commands.ndjson) validates —
 * see validateSummary(). exitCode === 0 alone is not sufficient.
 *
 * Output:
 *   <os.tmpdir()>/ris-wdio-bench/<run-id>/          per-run timing data (written by command-timing.ts)
 *   <os.tmpdir()>/ris-wdio-bench/benchmark-<date>/  aggregate JSON + Markdown (single mode)
 *                                                    or comparison.json + comparison.md (compare mode)
 *
 * Uses only Node.js built-in modules — no extra dependencies.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

export const ALLOWED_PROVIDERS = ["external", "embedded"];

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export const REQUIRED_CORE_INVENTORY_STEPS = [
  "create-repository",
  "open-location-form",
  "fill-location-form",
  "submit-location-form",
  "wait-for-location-row",
  "navigate-location-to-racks",
  "submit-placement",
  "save-and-close",
  "reopen-repository",
];

const WDIO_TIMEOUT_MS = 120 * 60 * 1000; // 120 minutes
const EMBEDDED_PORT = 4445;
const SIGTERM_GRACE_MS = 3000;

// ── Argument parsing / validation (pure — unit tested) ─────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    provider: null,
    spec: null,
    repeat: null,
    binary: null,
    continueOnFailure: false,
    compare: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--provider":
        result.provider = args[++i] ?? null;
        break;
      case "--spec":
        result.spec = args[++i] ?? null;
        break;
      case "--repeat": {
        const raw = args[++i];
        result.repeat = raw === undefined ? NaN : Number(raw);
        break;
      }
      case "--binary":
        result.binary = args[++i] ?? null;
        break;
      case "--continue-on-failure":
        result.continueOnFailure = true;
        break;
      case "--compare":
        result.compare = true;
        break;
      default:
        throw new Error(`Unknown argument: ${args[i]}`);
    }
  }
  return result;
}

export function validateArgs(opts) {
  const errors = [];

  if (!opts.spec) {
    errors.push("--spec is required");
  }
  if (opts.repeat === null || !Number.isInteger(opts.repeat) || opts.repeat < 1) {
    errors.push("--repeat must be a positive integer");
  }
  if (opts.compare) {
    if (opts.provider) {
      errors.push("--provider cannot be combined with --compare (compare mode runs both)");
    }
    if (!opts.binary) {
      errors.push("--compare requires --binary (both providers must use the same binary)");
    }
  } else if (!opts.provider || !ALLOWED_PROVIDERS.includes(opts.provider)) {
    errors.push(`--provider must be one of: ${ALLOWED_PROVIDERS.join(", ")}`);
  }

  return errors;
}

// ── Run ID ───────────────────────────────────────────────────────────────────

export function isValidRunId(id) {
  return typeof id === "string" && RUN_ID_PATTERN.test(id);
}

export function generateRunId() {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (!isValidRunId(id)) {
    throw new Error(`[benchmark] generated run id failed its own validation: "${id}"`);
  }
  return id;
}

// ── Port validation ──────────────────────────────────────────────────────────

export function validatePort(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new Error(`Invalid port "${raw}". Must be an integer in [1024, 65535].`);
  }
  return n;
}

// ── WDIO CLI entrypoint resolution ──────────────────────────────────────────

export function resolveWdioEntrypoint(desktopDir) {
  const pkgPath = join(desktopDir, "node_modules", "@wdio", "cli", "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`@wdio/cli package.json not found: ${pkgPath}. Run: pnpm install`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  let relEntry;
  if (typeof pkg.bin === "string") {
    relEntry = pkg.bin;
  } else if (pkg.bin && typeof pkg.bin === "object") {
    relEntry = pkg.bin.wdio ?? Object.values(pkg.bin)[0];
  }
  if (!relEntry) {
    throw new Error(`@wdio/cli package.json has no usable "bin" field: ${pkgPath}`);
  }
  const entryPath = resolve(dirname(pkgPath), relEntry);
  if (!existsSync(entryPath)) {
    throw new Error(`Resolved WDIO CLI entrypoint does not exist: ${entryPath}`);
  }
  return entryPath;
}

// ── Statistics helpers (pure — unit tested) ────────────────────────────────────

/** Nearest-rank percentile on a pre-sorted ascending array. */
export function pct(sortedAscending, p) {
  if (sortedAscending.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAscending.length) - 1;
  return sortedAscending[Math.max(0, idx)] ?? 0;
}

export function avg(values) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function medianOf(values) {
  if (values.length === 0) return 0;
  return pct([...values].sort((a, b) => a - b), 50);
}

/**
 * Delta between external and embedded, defined so a positive value always
 * means "embedded is better" (faster / fewer slow commands).
 */
export function computeDelta(externalValue, embeddedValue) {
  if (externalValue === null || externalValue === undefined || embeddedValue === null || embeddedValue === undefined) {
    return { absolute: null, percent: null };
  }
  const absolute = externalValue - embeddedValue;
  const percent = externalValue === 0 ? null : (absolute / externalValue) * 100;
  return { absolute, percent };
}

// ── Compare-mode sequencing (pure — unit tested) ────────────────────────────────

/** Alternating external/embedded order: ext1, emb1, ext2, emb2, ... */
export function buildCompareSequence(repeat) {
  const seq = [];
  for (let runN = 1; runN <= repeat; runN++) {
    seq.push({ provider: "external", runN });
    seq.push({ provider: "embedded", runN });
  }
  return seq;
}

// ── Report validation (pure — unit tested) ──────────────────────────────────────

/**
 * Validates a parsed summary.json against the run it was supposed to
 * produce. Returns a list of human-readable errors; empty means valid.
 * Does not itself check exitCode — that is a separate PASS condition
 * combined by the caller.
 */
export function validateSummary({ summary, runId, provider, spec, ndjsonCommandCount, expectedPlatform }) {
  const errors = [];

  if (!summary || typeof summary !== "object") {
    errors.push("summary.json did not contain a JSON object");
    return errors;
  }

  if (summary.runId !== runId) {
    errors.push(`summary.runId mismatch: expected "${runId}", got "${summary.runId}"`);
  }
  if (summary.provider !== provider) {
    errors.push(`summary.provider mismatch: expected "${provider}", got "${summary.provider}"`);
  }
  if (expectedPlatform !== undefined && summary.platform !== expectedPlatform) {
    errors.push(`summary.platform mismatch: expected "${expectedPlatform}", got "${summary.platform}"`);
  }
  if (!Number.isInteger(summary.commandCount) || summary.commandCount <= 0) {
    errors.push(`summary.commandCount must be a positive integer, got ${summary.commandCount}`);
  }

  for (const field of ["min", "mean", "median", "p90", "p95", "p99", "max"]) {
    if (typeof summary[field] !== "number" || summary[field] < 0) {
      errors.push(`summary.${field} must be a non-negative number, got ${summary[field]}`);
    }
  }
  for (const field of ["sessionStartupMs", "testExecutionMs", "sessionTeardownMs", "workerObservedMs"]) {
    const v = summary[field];
    if (v !== null && v !== undefined && (typeof v !== "number" || v < 0)) {
      errors.push(`summary.${field} must be null or a non-negative number, got ${v}`);
    }
  }

  if (ndjsonCommandCount !== undefined && ndjsonCommandCount !== summary.commandCount) {
    errors.push(
      `commands.ndjson command-record count (${ndjsonCommandCount}) does not match summary.commandCount (${summary.commandCount})`,
    );
  }

  if (spec === "core-inventory") {
    const seen = new Set((summary.byStepName ?? []).map((s) => s.stepName));
    for (const required of REQUIRED_CORE_INVENTORY_STEPS) {
      if (!seen.has(required)) {
        errors.push(`missing required step "${required}" for core-inventory`);
      }
    }
  }

  const failedSteps = (summary.steps ?? []).filter((s) => !s.success);
  if (failedSteps.length > 0) {
    errors.push(`${failedSteps.length} step(s) reported failure: ${failedSteps.map((s) => s.stepName).join(", ")}`);
  }

  return errors;
}

// ── Command-duration pooling for A/B comparison (pure given inputs) ────────────

export function poolCommandDurationsFromNdjsonText(ndjsonTexts) {
  const durations = [];
  for (const text of ndjsonTexts) {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "command" && typeof rec.durationMs === "number") {
          durations.push(rec.durationMs);
        }
      } catch {
        // skip malformed line — surfaced separately by validateSummary's ndjson count check
      }
    }
  }
  return durations.sort((a, b) => a - b);
}

export function poolStepDurationsByName(runs) {
  const map = new Map();
  for (const r of runs) {
    if (!r.passed || !r.summary?.steps) continue;
    for (const s of r.summary.steps) {
      const arr = map.get(s.stepName) ?? [];
      arr.push(s.durationMs);
      map.set(s.stepName, arr);
    }
  }
  return map;
}

/**
 * Builds the A/B comparison object for one spec's runs. `runs` must already
 * carry `passed`, `totalRunMs`, `summary` (parsed summary.json or null), and
 * `ndjsonText` (raw commands.ndjson content or null) for each run.
 */
export function computeComparison({ runs, spec }) {
  const externalRuns = runs.filter((r) => r.provider === "external");
  const embeddedRuns = runs.filter((r) => r.provider === "embedded");

  function providerStats(providerRuns) {
    const passed = providerRuns.filter((r) => r.passed);
    const totalDurations = passed.map((r) => r.totalRunMs).filter((v) => v != null);
    const testExecDurations = passed.map((r) => r.summary?.testExecutionMs).filter((v) => v != null);
    const sessionStartupDurations = passed.map((r) => r.summary?.sessionStartupMs).filter((v) => v != null);
    const pooledCommandDurations = poolCommandDurationsFromNdjsonText(
      passed.map((r) => r.ndjsonText).filter((t) => t != null),
    );
    const perRunP95 = passed.map((r) => r.summary?.p95).filter((v) => v != null);

    return {
      runCount: providerRuns.length,
      passedCount: passed.length,
      medianTotalRunMs: totalDurations.length ? medianOf(totalDurations) : null,
      medianTestExecutionMs: testExecDurations.length ? medianOf(testExecDurations) : null,
      medianSessionStartupMs: sessionStartupDurations.length ? medianOf(sessionStartupDurations) : null,
      medianCommandLatencyMs: pooledCommandDurations.length ? medianOf(pooledCommandDurations) : null,
      p95CommandLatencyMs: pooledCommandDurations.length ? pct(pooledCommandDurations, 95) : null,
      commandsGe1s: pooledCommandDurations.filter((d) => d >= 1000).length,
      commandsGe5s: pooledCommandDurations.filter((d) => d >= 5000).length,
      pooledCommandCount: pooledCommandDurations.length,
      perRunP95,
    };
  }

  const externalStats = providerStats(externalRuns);
  const embeddedStats = providerStats(embeddedRuns);

  const deltas = {
    medianTotalRunMs: computeDelta(externalStats.medianTotalRunMs, embeddedStats.medianTotalRunMs),
    medianTestExecutionMs: computeDelta(externalStats.medianTestExecutionMs, embeddedStats.medianTestExecutionMs),
    medianSessionStartupMs: computeDelta(externalStats.medianSessionStartupMs, embeddedStats.medianSessionStartupMs),
    medianCommandLatencyMs: computeDelta(externalStats.medianCommandLatencyMs, embeddedStats.medianCommandLatencyMs),
    p95CommandLatencyMs: computeDelta(externalStats.p95CommandLatencyMs, embeddedStats.p95CommandLatencyMs),
    commandsGe1s: computeDelta(externalStats.commandsGe1s, embeddedStats.commandsGe1s),
    commandsGe5s: computeDelta(externalStats.commandsGe5s, embeddedStats.commandsGe5s),
  };

  let steps = null;
  if (spec === "core-inventory") {
    const externalSteps = poolStepDurationsByName(externalRuns);
    const embeddedSteps = poolStepDurationsByName(embeddedRuns);
    const allStepNames = new Set([...externalSteps.keys(), ...embeddedSteps.keys()]);
    steps = Array.from(allStepNames)
      .sort()
      .map((stepName) => {
        const extDurs = externalSteps.get(stepName) ?? [];
        const embDurs = embeddedSteps.get(stepName) ?? [];
        const externalMedianMs = extDurs.length ? medianOf(extDurs) : null;
        const embeddedMedianMs = embDurs.length ? medianOf(embDurs) : null;
        return {
          stepName,
          externalMedianMs,
          embeddedMedianMs,
          delta: computeDelta(externalMedianMs, embeddedMedianMs),
        };
      });
  }

  return {
    spec,
    directionNote: "positive delta / positive percent = embedded faster or better than external",
    external: externalStats,
    embedded: embeddedStats,
    deltas,
    steps,
  };
}

// ── Process spawn / cleanup (side-effecting — not unit tested) ─────────────────

let currentChild = null;
let sigintHandlerInstalled = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function killProcessTreeGraceful(pid) {
  if (pid === undefined || pid === null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return; // already gone
  }
  await sleep(SIGTERM_GRACE_MS);
  try {
    process.kill(pid, 0); // throws if the process no longer exists
    process.kill(pid, "SIGKILL");
  } catch {
    // already exited after SIGTERM
  }
}

function installSigintHandler() {
  if (sigintHandlerInstalled) return;
  sigintHandlerInstalled = true;
  process.on("SIGINT", () => {
    console.error("\n[benchmark] SIGINT received — cleaning up the WDIO child process...");
    const pid = currentChild?.pid;
    killProcessTreeGraceful(pid).finally(() => {
      process.exitCode = 130;
      process.exit(130);
    });
  });
}

function runWdioProcess({ wdioEntrypoint, wdioConf, specPath, cwd, env, timeoutMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const spawnMs = Date.now();
    const child = spawn(process.execPath, [wdioEntrypoint, "run", wdioConf, "--spec", specPath], {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });
    currentChild = child;
    console.log(`[benchmark] WDIO process spawned: pid=${child.pid}`);

    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[benchmark] WDIO process exceeded ${timeoutMs}ms — killing pid=${child.pid}`);
      killProcessTreeGraceful(child.pid);
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      currentChild = null;
      rejectPromise(err);
    });

    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      currentChild = null;
      resolvePromise({
        exitCode: code ?? 1,
        signal,
        timedOut,
        pid: child.pid,
        wdioProcessMs: Date.now() - spawnMs,
      });
    });
  });
}

const EXTERNAL_DRIVER_PORT = 4444; // tauri-driver's own WebDriver-facing port

function checkPortListening(port) {
  if (process.platform !== "win32") return "unknown (non-Windows)";
  try {
    const r = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count`,
      ],
      { encoding: "utf8" },
    );
    const n = parseInt((r.stdout ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? "listening" : "free";
  } catch {
    return "unknown (check failed)";
  }
}

/**
 * Safety-net cleanup for a known, observed gap: @wdio/tauri-service v1.2.0's
 * "Stopping N driver(s)..." shutdown does not reliably terminate tauri-driver
 * (and its own msedgedriver child) on Windows, even after a fully PASSED run
 * — the WDIO process itself exits cleanly while the driver stays bound to
 * its port, which would break every subsequent run ("port already in use").
 *
 * This does NOT kill processes by name alone (that would risk touching an
 * unrelated driver instance on the machine). It only targets tauri-driver.exe
 * / msedgedriver.exe processes whose own CreationDate falls within this run's
 * own [start, now] window — since the runner only ever drives one run at a
 * time, any such process was necessarily spawned by the run that just
 * finished. Only invoked when checkPortListening() has already shown a
 * driver port is still bound after the WDIO process exited.
 */
function cleanupOrphanedDriverProcesses(runStartMs) {
  if (process.platform !== "win32") return { attempted: false, killedPids: [] };
  // A few seconds of margin against clock rounding between Date.now() and
  // the WMI-reported CreationDate, both drawn from the same system clock.
  const cutoffMs = runStartMs - 5000;
  try {
    const r = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$cutoff = [DateTimeOffset]::FromUnixTimeMilliseconds(${cutoffMs}).LocalDateTime; ` +
          `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'tauri-driver.exe' -or $_.Name -eq 'msedgedriver.exe') -and $_.CreationDate -ge $cutoff } | ` +
          `ForEach-Object { taskkill /PID $_.ProcessId /T /F; $_.ProcessId }`,
      ],
      { encoding: "utf8" },
    );
    const killedPids = (r.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l))
      .map(Number);
    return { attempted: true, killedPids };
  } catch (e) {
    return { attempted: true, killedPids: [], error: e.message };
  }
}

// ── Environment info (side-effecting — not unit tested) ────────────────────────

function safeExec(cmd, args, opts = {}) {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    const out = (r.stdout || r.stderr || "").trim();
    return out || null;
  } catch {
    return null;
  }
}

function readPkgVersion(pkgJsonPath) {
  if (!existsSync(pkgJsonPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgJsonPath, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

export function readCargoLockVersion(cargoLockPath, packageName) {
  if (!existsSync(cargoLockPath)) return null;
  const text = readFileSync(cargoLockPath, "utf8");
  // Cargo.lock is CRLF on Windows checkouts — match either line ending.
  const re = new RegExp(`name = "${packageName}"\\r?\\nversion = "([^"]+)"`);
  const m = text.match(re);
  return m ? m[1] : null;
}

function getEdgeVersion() {
  if (os.platform() !== "win32") return "N/A (not Windows)";
  // `msedge.exe --version` does not reliably print to stdout — on some builds
  // it silently launches the browser instead, which would leave a stray
  // process behind. Read the file's VersionInfo instead: no process spawned.
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const out = safeExec("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Get-Item '${p}').VersionInfo.ProductVersion`,
      ]);
      if (out) return out;
    }
  }
  return "not found at known paths";
}

function getEdgeDriverVersion(desktopDir) {
  if (os.platform() !== "win32") return "N/A (not Windows)";
  const candidateDirs = [
    join(desktopDir, "node_modules", "edgedriver"),
    join(os.homedir(), ".cache", "edgedriver"),
  ];
  for (const dir of candidateDirs) {
    if (!existsSync(dir)) continue;
    const exe = join(dir, "msedgedriver.exe");
    if (existsSync(exe)) {
      const out = safeExec(exe, ["--version"]);
      if (out) return out;
    }
  }
  return "not reliably determinable (msedgedriver not found in known cache paths)";
}

function collectEnvironmentInfo({ repoRoot, desktopDir, provider, spec, repeat, binary }) {
  return {
    platform: os.platform(),
    osVersion: os.version(),
    osRelease: os.release(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    cpuCount: os.cpus().length,
    totalRamMB: Math.round(os.totalmem() / 1024 / 1024),
    node: process.version,
    pnpm: safeExec("pnpm", ["--version"]) ?? "unavailable",
    rustc: safeExec("rustc", ["--version"]) ?? "unavailable",
    cargo: safeExec("cargo", ["--version"]) ?? "unavailable",
    tauriCli: safeExec("pnpm", ["exec", "tauri", "--version"], { cwd: desktopDir }) ?? "unavailable",
    webdriverio: readPkgVersion(join(desktopDir, "node_modules", "webdriverio", "package.json")) ?? "unavailable",
    wdioCli: readPkgVersion(join(desktopDir, "node_modules", "@wdio", "cli", "package.json")) ?? "unavailable",
    wdioTauriService:
      readPkgVersion(join(desktopDir, "node_modules", "@wdio", "tauri-service", "package.json")) ?? "unavailable",
    tauriPluginWdioWebdriver:
      readCargoLockVersion(join(repoRoot, "Cargo.lock"), "tauri-plugin-wdio-webdriver") ?? "unavailable",
    edge: getEdgeVersion(),
    edgeDriver: getEdgeDriverVersion(desktopDir),
    provider,
    spec,
    repeat,
    binary: binary ?? "(auto-detect)",
    benchmarkStarted: new Date().toISOString(),
  };
}

// ── Single-run execution ─────────────────────────────────────────────────────

async function runSingle({ provider, spec, runN, binary, desktopDir, wdioEntrypoint, wdioConf, specPath }) {
  const runId = generateRunId();
  const runStartMs = Date.now();

  console.log(`\n[benchmark] === Run ${runN} provider=${provider} spec=${spec} runId=${runId} ===`);

  const env = {
    ...process.env,
    RIS_WDIO_TIMING: "1",
    RIS_WDIO_DRIVER_PROVIDER: provider,
    RIS_WDIO_RUN_ID: runId,
    RIS_WDIO_SLOW_COMMAND_MS: "500",
  };
  if (binary) env["TAURI_BINARY_PATH"] = resolve(binary);
  if (provider === "embedded") env["RIS_WDIO_EMBEDDED_PORT"] = String(validatePort(EMBEDDED_PORT));

  const wdioResult = await runWdioProcess({
    wdioEntrypoint,
    wdioConf,
    specPath,
    cwd: desktopDir,
    env,
    timeoutMs: WDIO_TIMEOUT_MS,
  });

  const totalRunMs = Date.now() - runStartMs;
  const reportRunDir = join(os.tmpdir(), "ris-wdio-bench", runId);
  const summaryPath = join(reportRunDir, "summary.json");
  const ndjsonPath = join(reportRunDir, "commands.ndjson");

  const validationErrors = [];
  let summary = null;
  let ndjsonText = null;
  let ndjsonCommandCount;

  if (!existsSync(summaryPath)) {
    validationErrors.push(`summary.json not found: ${summaryPath}`);
  } else {
    try {
      summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch (e) {
      validationErrors.push(`summary.json failed to parse: ${e.message}`);
    }
  }

  if (!existsSync(ndjsonPath)) {
    validationErrors.push(`commands.ndjson not found: ${ndjsonPath}`);
  } else {
    ndjsonText = readFileSync(ndjsonPath, "utf8");
    ndjsonCommandCount = 0;
    for (const line of ndjsonText.split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "command") ndjsonCommandCount++;
      } catch {
        validationErrors.push("commands.ndjson contains an unparsable line");
      }
    }
  }

  if (summary) {
    validationErrors.push(
      ...validateSummary({
        summary,
        runId,
        provider,
        spec,
        ndjsonCommandCount,
        expectedPlatform: os.platform(),
      }),
    );
  }

  const reportValid = validationErrors.length === 0;
  const passed = wdioResult.exitCode === 0 && reportValid;
  // Checked for both providers: external's tauri-driver listens on 4444 and
  // proxies to a native msedgedriver on 4445, and embedded's in-process
  // server also defaults to 4445 — either can be left listening if the
  // WDIO/tauri-service process doesn't tear its driver down before exiting.
  const driverPortsStatusAfter = {
    port4444: checkPortListening(EXTERNAL_DRIVER_PORT),
    port4445: checkPortListening(EMBEDDED_PORT),
  };
  let forcedCleanupLikely =
    driverPortsStatusAfter.port4444 === "listening" || driverPortsStatusAfter.port4445 === "listening";
  let forcedCleanupResult = { attempted: false, killedPids: [] };

  if (forcedCleanupLikely) {
    console.warn(
      `[benchmark]   WARNING: driver port(s) still listening after the WDIO process exited ` +
        `(4444=${driverPortsStatusAfter.port4444}, 4445=${driverPortsStatusAfter.port4445}). ` +
        `Treating this as a cleanup problem, not a success — attempting a targeted safety-net cleanup.`,
    );
    forcedCleanupResult = cleanupOrphanedDriverProcesses(runStartMs);
    driverPortsStatusAfter.port4444 = checkPortListening(EXTERNAL_DRIVER_PORT);
    driverPortsStatusAfter.port4445 = checkPortListening(EMBEDDED_PORT);
    forcedCleanupLikely =
      driverPortsStatusAfter.port4444 === "listening" || driverPortsStatusAfter.port4445 === "listening";
    if (forcedCleanupResult.killedPids.length > 0) {
      console.warn(
        `[benchmark]   Safety-net cleanup killed PID(s): ${forcedCleanupResult.killedPids.join(", ")}. ` +
          `Ports after cleanup: 4444=${driverPortsStatusAfter.port4444}, 4445=${driverPortsStatusAfter.port4445}.`,
      );
    }
  }

  const result = {
    runN,
    runId,
    provider,
    spec,
    exitCode: wdioResult.exitCode,
    timedOut: wdioResult.timedOut,
    wdioPid: wdioResult.pid,
    totalRunMs,
    wdioProcessMs: wdioResult.wdioProcessMs,
    passed,
    reportValid,
    validationErrors,
    reportDir: reportRunDir,
    summaryPath: existsSync(summaryPath) ? summaryPath : null,
    ndjsonPath: existsSync(ndjsonPath) ? ndjsonPath : null,
    ndjsonText,
    summary,
    driverPortsStatusAfter,
    forcedCleanupLikely,
    forcedCleanupResult,
  };

  console.log(
    `[benchmark] Run ${runN} (${provider}) ${passed ? "PASSED" : "FAILED"} in ${Math.round(totalRunMs / 1000)}s ` +
      `exitCode=${wdioResult.exitCode} reportValid=${reportValid}`,
  );
  if (!reportValid) {
    for (const err of validationErrors) console.error(`[benchmark]   validation error: ${err}`);
  }
  if (summary) {
    console.log(
      `[benchmark] Commands: ${summary.commandCount} median=${summary.median}ms p95=${summary.p95}ms ` +
        `p99=${summary.p99}ms max=${summary.max}ms`,
    );
  }

  return result;
}

// ── Output writers ───────────────────────────────────────────────────────────

function writeSingleModeReport({ benchDir, provider, spec, repeat, runResults, envInfo }) {
  function pctArr(values, p) {
    return pct([...values].sort((a, b) => a - b), p);
  }

  const passedRuns = runResults.filter((r) => r.passed);
  const totalDurations = passedRuns.map((r) => r.totalRunMs).sort((a, b) => a - b);
  const medians = passedRuns.map((r) => r.summary.median).sort((a, b) => a - b);
  const p95s = passedRuns.map((r) => r.summary.p95).sort((a, b) => a - b);

  const aggregate = {
    provider,
    spec,
    totalRuns: repeat,
    passedRuns: passedRuns.length,
    failedRuns: runResults.filter((r) => !r.passed).length,
    totalRunMs: {
      min: totalDurations[0] ?? 0,
      median: pctArr(totalDurations, 50),
      max: totalDurations[totalDurations.length - 1] ?? 0,
    },
    commandLatencyMs: {
      medianOfMedians: pctArr(medians, 50),
      p95ofP95: pctArr(p95s, 95),
    },
  };

  const benchmarkResult = {
    meta: envInfo,
    runs: runResults.map(({ ndjsonText: _ndjsonText, ...rest }) => rest),
    aggregate,
    benchmarkCompleted: new Date().toISOString(),
  };

  const jsonPath = join(benchDir, `${provider}-${spec}.json`);
  writeFileSync(jsonPath, JSON.stringify(benchmarkResult, null, 2));

  const md = [
    `# Benchmark: ${provider} / ${spec}`,
    ``,
    `Date: ${envInfo.benchmarkStarted}`,
    `Platform: ${envInfo.platform} ${envInfo.arch} | CPU: ${envInfo.cpuModel} (${envInfo.cpuCount} cores) | RAM: ${envInfo.totalRamMB} MB`,
    `Node: ${envInfo.node} | Rust: ${envInfo.rustc}`,
    `Provider: **${provider}** | Spec: \`${spec}\` | Repeat: ${repeat}`,
    ``,
    `## Run Results`,
    ``,
    `| Run | Result | Total | WDIO proc | Commands | Median | P95 | Max | >=1s | >=5s |`,
    `|-----|--------|-------|-----------|----------|--------|-----|-----|------|------|`,
    ...runResults.map((r) => {
      const s = r.summary;
      return `| ${r.runN} | ${r.passed ? "PASSED" : "FAILED"} | ${Math.round(r.totalRunMs / 1000)}s | ${Math.round(r.wdioProcessMs / 1000)}s | ${s?.commandCount ?? "-"} | ${s?.median ?? "-"}ms | ${s?.p95 ?? "-"}ms | ${s?.max ?? "-"}ms | ${s?.bucketsGe?.ms1000 ?? "-"} | ${s?.bucketsGe?.ms5000 ?? "-"} |`;
    }),
    ``,
    `## Aggregate (passed runs)`,
    ``,
    `- Passed: ${aggregate.passedRuns}/${aggregate.totalRuns}`,
    `- Total duration (median): ${aggregate.totalRunMs.median}ms`,
    `- Command latency median-of-medians: ${aggregate.commandLatencyMs.medianOfMedians}ms`,
    `- Command latency p95-of-p95: ${aggregate.commandLatencyMs.p95ofP95}ms`,
    ``,
    `## Report files`,
    ``,
    ...runResults.map((r) => `- Run ${r.runN}: \`${r.reportDir}\``),
    `- Aggregate JSON: \`${jsonPath}\``,
    ``,
  ].join("\n");

  const mdPath = join(benchDir, `${provider}-${spec}.md`);
  writeFileSync(mdPath, md);

  return { jsonPath, mdPath, aggregate };
}

function writeCompareModeReport({ benchDir, spec, repeat, runResults, envInfo, comparison }) {
  const output = {
    meta: envInfo,
    spec,
    repeat,
    runs: runResults.map(({ ndjsonText: _ndjsonText, ...rest }) => rest),
    comparison,
    benchmarkCompleted: new Date().toISOString(),
  };

  const jsonPath = join(benchDir, "comparison.json");
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));

  const fmt = (v, unit = "ms") => (v === null || v === undefined ? "-" : `${Math.round(v)}${unit}`);
  const fmtPct = (v) => (v === null || v === undefined ? "-" : `${v.toFixed(1)}%`);

  const lines = [
    `# WDIO Provider Comparison: ${spec}`,
    ``,
    `Date: ${envInfo.benchmarkStarted}`,
    `Platform: ${envInfo.platform} ${envInfo.arch} (${envInfo.osVersion} / ${envInfo.osRelease}) | CPU: ${envInfo.cpuModel} (${envInfo.cpuCount} cores) | RAM: ${envInfo.totalRamMB} MB`,
    `Node: ${envInfo.node} | Rust: ${envInfo.rustc} | Tauri CLI: ${envInfo.tauriCli}`,
    `WebdriverIO: ${envInfo.webdriverio} | @wdio/tauri-service: ${envInfo.wdioTauriService} | tauri-plugin-wdio-webdriver: ${envInfo.tauriPluginWdioWebdriver}`,
    `Edge: ${envInfo.edge} | EdgeDriver: ${envInfo.edgeDriver}`,
    `Binary (both providers): \`${envInfo.binary}\``,
    ``,
    `Positive delta / positive % = embedded faster or better than external.`,
    ``,
    `## Runs`,
    ``,
    `| # | Provider | Run | Result | Total | WDIO proc | Session startup | Test exec | Commands | Median | P95 |`,
    `|---|----------|-----|--------|-------|-----------|------------------|-----------|----------|--------|-----|`,
    ...runResults.map((r, i) => {
      const s = r.summary;
      return `| ${i + 1} | ${r.provider} | ${r.runN} | ${r.passed ? "PASSED" : "FAILED"} | ${Math.round(r.totalRunMs / 1000)}s | ${Math.round(r.wdioProcessMs / 1000)}s | ${fmt(s?.sessionStartupMs)} | ${fmt(s?.testExecutionMs)} | ${s?.commandCount ?? "-"} | ${s?.median ?? "-"}ms | ${s?.p95 ?? "-"}ms |`;
    }),
    ``,
    `## Aggregate comparison`,
    ``,
    `| Metric | external | embedded | Delta (abs) | Delta (%) |`,
    `|--------|----------|----------|--------------|-----------|`,
    `| Median total run duration | ${fmt(comparison.external.medianTotalRunMs)} | ${fmt(comparison.embedded.medianTotalRunMs)} | ${fmt(comparison.deltas.medianTotalRunMs.absolute)} | ${fmtPct(comparison.deltas.medianTotalRunMs.percent)} |`,
    `| Median testExecutionMs | ${fmt(comparison.external.medianTestExecutionMs)} | ${fmt(comparison.embedded.medianTestExecutionMs)} | ${fmt(comparison.deltas.medianTestExecutionMs.absolute)} | ${fmtPct(comparison.deltas.medianTestExecutionMs.percent)} |`,
    `| Median sessionStartupMs | ${fmt(comparison.external.medianSessionStartupMs)} | ${fmt(comparison.embedded.medianSessionStartupMs)} | ${fmt(comparison.deltas.medianSessionStartupMs.absolute)} | ${fmtPct(comparison.deltas.medianSessionStartupMs.percent)} |`,
    `| Median command latency (pooled) | ${fmt(comparison.external.medianCommandLatencyMs)} | ${fmt(comparison.embedded.medianCommandLatencyMs)} | ${fmt(comparison.deltas.medianCommandLatencyMs.absolute)} | ${fmtPct(comparison.deltas.medianCommandLatencyMs.percent)} |`,
    `| P95 command latency (pooled) | ${fmt(comparison.external.p95CommandLatencyMs)} | ${fmt(comparison.embedded.p95CommandLatencyMs)} | ${fmt(comparison.deltas.p95CommandLatencyMs.absolute)} | ${fmtPct(comparison.deltas.p95CommandLatencyMs.percent)} |`,
    `| Commands >=1s | ${comparison.external.commandsGe1s} | ${comparison.embedded.commandsGe1s} | ${fmt(comparison.deltas.commandsGe1s.absolute, "")} | ${fmtPct(comparison.deltas.commandsGe1s.percent)} |`,
    `| Commands >=5s | ${comparison.external.commandsGe5s} | ${comparison.embedded.commandsGe5s} | ${fmt(comparison.deltas.commandsGe5s.absolute, "")} | ${fmtPct(comparison.deltas.commandsGe5s.percent)} |`,
    ``,
  ];

  if (comparison.steps) {
    lines.push(
      `## Step comparison (core-inventory)`,
      ``,
      `| Step | external median | embedded median | Delta (abs) | Delta (%) |`,
      `|------|-----------------|-----------------|--------------|-----------|`,
      ...comparison.steps.map(
        (s) =>
          `| ${s.stepName} | ${fmt(s.externalMedianMs)} | ${fmt(s.embeddedMedianMs)} | ${fmt(s.delta.absolute)} | ${fmtPct(s.delta.percent)} |`,
      ),
      ``,
    );
  }

  lines.push(`## Report files`, ``, ...runResults.map((r, i) => `- Run ${i + 1} (${r.provider}): \`${r.reportDir}\``), `- Comparison JSON: \`${jsonPath}\``, ``);

  const mdPath = join(benchDir, "comparison.md");
  writeFileSync(mdPath, lines.join("\n"));

  return { jsonPath, mdPath };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(`[benchmark] ${e.message}`);
    process.exit(1);
  }

  const errors = validateArgs(opts);
  if (errors.length > 0) {
    for (const err of errors) console.error(`[benchmark] ${err}`);
    process.exit(1);
  }

  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(scriptDir, "..");
  const desktopDir = join(repoRoot, "apps", "desktop");
  const wdioConf = join(desktopDir, "e2e-wdio", "wdio.conf.ts");
  const specPath = join(desktopDir, "e2e-wdio", "specs", `${opts.spec}.e2e.ts`);

  if (!existsSync(wdioConf)) {
    console.error(`[benchmark] WDIO config not found: ${wdioConf}`);
    process.exit(1);
  }
  if (!existsSync(specPath)) {
    console.error(`[benchmark] Spec file not found: ${specPath}`);
    process.exit(1);
  }

  let wdioEntrypoint;
  try {
    wdioEntrypoint = resolveWdioEntrypoint(desktopDir);
  } catch (e) {
    console.error(`[benchmark] ${e.message}`);
    process.exit(1);
  }

  installSigintHandler();

  const benchDate = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const benchDir = join(os.tmpdir(), "ris-wdio-bench", `benchmark-${benchDate}`);
  mkdirSync(benchDir, { recursive: true });

  const envInfo = collectEnvironmentInfo({
    repoRoot,
    desktopDir,
    provider: opts.compare ? "compare(external+embedded)" : opts.provider,
    spec: opts.spec,
    repeat: opts.repeat,
    binary: opts.binary,
  });
  console.log("[benchmark] Environment:");
  console.log(JSON.stringify(envInfo, null, 2));

  const runResults = [];
  let allPassed = true;

  if (opts.compare) {
    const sequence = buildCompareSequence(opts.repeat);
    for (const { provider, runN } of sequence) {
      const result = await runSingle({
        provider,
        spec: opts.spec,
        runN,
        binary: opts.binary,
        desktopDir,
        wdioEntrypoint,
        wdioConf,
        specPath,
      });
      runResults.push(result);
      if (!result.passed) {
        allPassed = false;
        if (!opts.continueOnFailure) {
          console.error(`[benchmark] Stopping matrix after failure (provider=${provider}, run ${runN}).`);
          break;
        }
      }
    }

    const comparison = computeComparison({ runs: runResults, spec: opts.spec });
    const { jsonPath, mdPath } = writeCompareModeReport({
      benchDir,
      spec: opts.spec,
      repeat: opts.repeat,
      runResults,
      envInfo,
      comparison,
    });

    console.log(`\n[benchmark] === Compare complete ===`);
    console.log(`[benchmark] Comparison JSON: ${jsonPath}`);
    console.log(`[benchmark] Comparison MD:   ${mdPath}`);
  } else {
    for (let runN = 1; runN <= opts.repeat; runN++) {
      const result = await runSingle({
        provider: opts.provider,
        spec: opts.spec,
        runN,
        binary: opts.binary,
        desktopDir,
        wdioEntrypoint,
        wdioConf,
        specPath,
      });
      runResults.push(result);
      if (!result.passed) {
        allPassed = false;
        if (!opts.continueOnFailure) {
          console.error(`[benchmark] Stopping after failure in run ${runN}. Use --continue-on-failure to proceed.`);
          break;
        }
      }
    }

    const { jsonPath, mdPath, aggregate } = writeSingleModeReport({
      benchDir,
      provider: opts.provider,
      spec: opts.spec,
      repeat: opts.repeat,
      runResults,
      envInfo,
    });

    console.log(`\n[benchmark] === Complete ===`);
    console.log(`[benchmark] Passed: ${aggregate.passedRuns}/${aggregate.totalRuns}`);
    console.log(`[benchmark] Aggregate JSON: ${jsonPath}`);
    console.log(`[benchmark] Markdown:       ${mdPath}`);
  }

  console.log(`[benchmark] Benchmark dir: ${benchDir}`);
  process.exit(allPassed && runResults.length > 0 ? 0 : 1);
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
    console.error(`[benchmark] Fatal error: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
