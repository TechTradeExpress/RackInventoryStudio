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
 * Result semantics (see OUTCOMES below): a run's `outcome` is one of a closed
 * set of values. `passed === true` iff `outcome === "CLEAN_PASS"` — a run
 * whose WDIO process exited 0, whose timing report validated, AND whose
 * driver processes tore down without requiring a forced safety-net cleanup.
 * A run that passed its test but needed forced cleanup is reported as
 * PASS_WITH_FORCED_CLEANUP — it is kept for diagnostics but excluded from
 * every aggregate/percentile computation and from the A/B comparison.
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
const EMBEDDED_PORT_DEFAULT = 4445;
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

// ── Outcome classification (pure — unit tested) ─────────────────────────────────
//
// A run's raw exit code and report validity are necessary but not sufficient
// conditions for treating it as a clean success: the driver processes it
// spawned (tauri-driver.exe / msedgedriver.exe on Windows) must also have
// torn themselves down without needing a forced safety-net kill. The four
// cleanup-related fields below capture that distinction so `passed` cannot
// silently paper over a leaked process or an unsafe/ambiguous cleanup.

export const OUTCOMES = Object.freeze({
  CLEAN_PASS: "CLEAN_PASS",
  PASS_WITH_FORCED_CLEANUP: "PASS_WITH_FORCED_CLEANUP",
  TEST_FAILED: "TEST_FAILED",
  REPORT_INVALID: "REPORT_INVALID",
  CLEANUP_UNSAFE: "CLEANUP_UNSAFE",
  CLEANUP_FAILED: "CLEANUP_FAILED",
  TIMED_OUT: "TIMED_OUT",
  INTERRUPTED: "INTERRUPTED",
});

/**
 * Precedence (highest first): an aborted run (interrupted/timed out) is
 * reported as such regardless of what its report or cleanup state look
 * like, since the run itself never completed normally. Next, exit code and
 * report validity — a run that failed its own assertions or produced a
 * malformed report cannot be a pass no matter how clean its cleanup was.
 * Only once the run itself is a genuine pass does cleanup status decide
 * between CLEAN_PASS / PASS_WITH_FORCED_CLEANUP / CLEANUP_UNSAFE / CLEANUP_FAILED.
 */
export function classifyOutcome({
  interrupted = false,
  timedOut = false,
  testPassed,
  reportValid,
  cleanupRequired,
  cleanupSafe,
  cleanupSucceeded,
}) {
  if (interrupted) return OUTCOMES.INTERRUPTED;
  if (timedOut) return OUTCOMES.TIMED_OUT;
  if (!testPassed) return OUTCOMES.TEST_FAILED;
  if (!reportValid) return OUTCOMES.REPORT_INVALID;
  if (!cleanupRequired) return OUTCOMES.CLEAN_PASS;
  if (!cleanupSafe) return OUTCOMES.CLEANUP_UNSAFE;
  if (!cleanupSucceeded) return OUTCOMES.CLEANUP_FAILED;
  return OUTCOMES.PASS_WITH_FORCED_CLEANUP;
}

/** Only CLEAN_PASS runs are eligible for aggregate/percentile/A-B computations. */
export function isEligibleForAggregate(outcome) {
  return outcome === OUTCOMES.CLEAN_PASS;
}

export function summarizeRunOutcomes(runs) {
  const counts = {
    CLEAN_PASS: 0,
    PASS_WITH_FORCED_CLEANUP: 0,
    TEST_FAILED: 0,
    REPORT_INVALID: 0,
    CLEANUP_UNSAFE: 0,
    CLEANUP_FAILED: 0,
    TIMED_OUT: 0,
    INTERRUPTED: 0,
  };
  for (const r of runs) {
    if (r.outcome in counts) counts[r.outcome]++;
  }
  return counts;
}

// ── PID-safe process/port ownership (pure decision logic — unit tested) ────────

export const EXPECTED_DRIVER_PROCESS_NAMES = ["tauri-driver.exe", "msedgedriver.exe"];

// A few seconds of margin against clock rounding between Date.now() and the
// WMI-reported CreationDate, both drawn from the same system clock. This
// margin alone is never sufficient to qualify a process for auto-kill — it
// is one of several independently-required conditions in
// evaluateCleanupEligibility().
export const CLEANUP_CREATION_MARGIN_MS = 5000;

/**
 * Given the set of PIDs a PowerShell `Get-NetTCPConnection -State Listen`
 * query reported as OwningProcess for one port, decides whether the port
 * has zero, one, or an ambiguous multiple owners. Ambiguity (more than one
 * distinct PID reported for the same LocalPort) must never be auto-resolved.
 */
export function resolvePortOwnership(owningPids) {
  const distinct = [...new Set((owningPids ?? []).filter((n) => Number.isInteger(n)))];
  if (distinct.length === 0) return { listening: false, owningPid: null, ambiguous: false, candidatePids: [] };
  if (distinct.length === 1) {
    return { listening: true, owningPid: distinct[0], ambiguous: false, candidatePids: distinct };
  }
  return { listening: true, owningPid: null, ambiguous: true, candidatePids: distinct };
}

/**
 * Decides whether a single, unambiguously-identified port-owning process may
 * be automatically killed as a run's forced-cleanup safety net. Every
 * condition below is independently required (see docs/E2E_WDIO_PLAN.md
 * §"Bezpieczna identyfikacja procesu cleanupu"):
 *
 *   1. the candidate is confirmed as the port's actual OwningProcess
 *      (portOwnerMatch) — never inferred from process name/time alone,
 *   2. its PID did not exist before this run started (preRunPids),
 *   3. its CreationDate falls within this run's own [start, now] window,
 *   4. its executable name is one of the expected driver binaries.
 *
 * Any condition that cannot be verified (missing CreationDate, unexpected
 * name, ambiguous owner) marks the result `unsafe: true` — the caller must
 * not kill anything and must surface CLEANUP_UNSAFE instead. A candidate
 * that is simply not ours (pre-existing, or created outside the run window)
 * is `unsafe: false, eligible: false` — a normal, expected "leave it alone".
 */
export function evaluateCleanupEligibility({
  pid,
  processName,
  creationDateMs,
  preRunPids,
  runStartMs,
  marginMs = CLEANUP_CREATION_MARGIN_MS,
  expectedProcessNames = EXPECTED_DRIVER_PROCESS_NAMES,
  portOwnerMatch = true,
}) {
  if (!portOwnerMatch) {
    return { eligible: false, unsafe: false, reason: "candidate PID is not the confirmed owning process of the port" };
  }
  if (preRunPids && typeof preRunPids.has === "function" && preRunPids.has(pid)) {
    return { eligible: false, unsafe: false, reason: "PID existed before this run started" };
  }
  if (creationDateMs === null || creationDateMs === undefined || !Number.isFinite(creationDateMs)) {
    return { eligible: false, unsafe: true, reason: "process CreationDate unavailable" };
  }
  if (creationDateMs < runStartMs - marginMs) {
    return { eligible: false, unsafe: false, reason: "process CreationDate predates this run's window" };
  }
  if (!expectedProcessNames.includes(processName)) {
    return { eligible: false, unsafe: true, reason: `unexpected process name "${processName}"` };
  }
  return {
    eligible: true,
    unsafe: false,
    reason: "eligible: new PID, confirmed port owner, expected name, created within run window",
  };
}

// ── PowerShell output parsers (pure — unit tested) ──────────────────────────────

/** Parses `... | ConvertTo-Json -Compress` output for a list of PIDs (empty/bare-number/array). */
export function parsePortOwnerPids(raw) {
  const text = (raw ?? "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((n) => Number(n)).filter((n) => Number.isInteger(n));
  } catch {
    // Fallback: bare whitespace/newline-separated integers.
    return text
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n));
  }
}

/** Parses a single Win32_Process record (ProcessId, Name, ParentProcessId, CreationDateIso). */
export function parseProcessInfoJson(raw) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || typeof parsed !== "object") return null;
  const pid = Number(parsed.ProcessId);
  if (!Number.isInteger(pid)) return null;
  const parentRaw = Number(parsed.ParentProcessId);
  const creationDateMs = parsed.CreationDateIso ? Date.parse(parsed.CreationDateIso) : NaN;
  return {
    pid,
    name: parsed.Name ?? null,
    parentProcessId: Number.isInteger(parentRaw) ? parentRaw : null,
    creationDateMs: Number.isFinite(creationDateMs) ? creationDateMs : null,
  };
}

// ── Process spawn / cleanup (side-effecting — not unit tested) ─────────────────

let currentChild = null;
let sigintHandlerInstalled = false;
// Tracks the ports/pre-run snapshot/start time of whichever run is currently
// in flight, so SIGINT handling can perform the same PID-scoped, safe
// cleanup as a normal run instead of blindly killing by name.
let currentRunCleanupContext = null;

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
    killProcessTreeGraceful(pid)
      .then(() => {
        if (currentRunCleanupContext) {
          const { ports, preRunPids, runStartMs } = currentRunCleanupContext;
          const cleanup = performSafeCleanup({ ports, preRunPids, runStartMs });
          console.error(
            `[benchmark] outcome=${OUTCOMES.INTERRUPTED} passed=false ` +
              `cleanupRequired=${cleanup.cleanupRequired} cleanupSafe=${cleanup.cleanupSafe} ` +
              `cleanupSucceeded=${cleanup.cleanupSucceeded} killedPids=${cleanup.killedPids.join(",") || "-"}`,
          );
        } else {
          console.error(`[benchmark] outcome=${OUTCOMES.INTERRUPTED} passed=false (no run in flight)`);
        }
      })
      .finally(() => {
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

function runPowershellCapture(script) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

/** Raw PowerShell query — not unit tested; parsing is done by parsePortOwnerPids(). */
function queryPortOwnerPids(port) {
  if (process.platform !== "win32") return [];
  const script =
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
    `Select-Object -ExpandProperty OwningProcess -Unique | ConvertTo-Json -Compress`;
  return parsePortOwnerPids(runPowershellCapture(script));
}

/** Raw PowerShell query — not unit tested; parsing is done by parseProcessInfoJson(). */
function queryProcessInfo(pid) {
  if (process.platform !== "win32") return null;
  const script =
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue | ` +
    `Select-Object ProcessId, Name, ParentProcessId, ` +
    `@{Name='CreationDateIso';Expression={ if ($_.CreationDate) { $_.CreationDate.ToString('o') } else { $null } }} | ` +
    `ConvertTo-Json -Compress`;
  return parseProcessInfoJson(runPowershellCapture(script));
}

function killPidTree(pid) {
  spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
}

/**
 * Pre-run snapshot: every PID currently listening on a monitored port, plus
 * every currently-running driver-named process, regardless of whether it is
 * listening yet. Used exclusively to EXCLUDE processes that pre-date this
 * run from forced-cleanup eligibility — never to select a cleanup target.
 */
function snapshotPreRunPids(ports) {
  if (process.platform !== "win32") return new Set();
  const portList = ports.join(",");
  const script =
    `$ports = @(${portList}); ` +
    `$portPids = @(); foreach ($p in $ports) { $portPids += @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess) }; ` +
    `$driverPids = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.Name -eq 'tauri-driver.exe' -or $_.Name -eq 'msedgedriver.exe' } | Select-Object -ExpandProperty ProcessId); ` +
    `($portPids + $driverPids) | Select-Object -Unique | ConvertTo-Json -Compress`;
  const pids = parsePortOwnerPids(runPowershellCapture(script));
  return new Set(pids);
}

/**
 * Resolves whether one port needs cleanup and, if so, whether the
 * identified owner is safe to auto-kill. Never kills anything itself —
 * see performSafeCleanup() for the orchestration that actually acts on
 * this decision.
 */
function evaluatePortForCleanup({ port, preRunPids, runStartMs }) {
  const ownership = resolvePortOwnership(queryPortOwnerPids(port));
  if (!ownership.listening) {
    return { port, required: false, owningPid: null, processName: null, safe: true, eligible: false, reason: "port free" };
  }
  if (ownership.ambiguous) {
    return {
      port,
      required: true,
      owningPid: null,
      candidatePids: ownership.candidatePids,
      processName: null,
      safe: false,
      eligible: false,
      reason: "multiple distinct owning PIDs reported for this port — refusing to guess",
    };
  }
  const pid = ownership.owningPid;
  const info = queryProcessInfo(pid);
  if (!info) {
    return {
      port,
      required: true,
      owningPid: pid,
      processName: null,
      safe: false,
      eligible: false,
      reason: "could not retrieve process info for the port's owning PID",
    };
  }
  const decision = evaluateCleanupEligibility({
    pid: info.pid,
    processName: info.name,
    creationDateMs: info.creationDateMs,
    preRunPids,
    runStartMs,
  });
  return {
    port,
    required: true,
    owningPid: pid,
    processName: info.name,
    parentProcessId: info.parentProcessId,
    creationDateMs: info.creationDateMs,
    safe: decision.eligible,
    eligible: decision.eligible,
    reason: decision.reason,
  };
}

/**
 * Orchestrates the full safety-net cleanup for a run: evaluates every
 * monitored port, and only ever kills a port's owning process if every one
 * of the monitored ports that still needs cleanup was independently judged
 * safe. A single unsafe/ambiguous port blocks killing on ALL ports for this
 * run — partial automated cleanup next to an unresolved ambiguity is not
 * an acceptable outcome.
 */
function performSafeCleanup({ ports, preRunPids, runStartMs }) {
  const perPort = ports.map((port) => evaluatePortForCleanup({ port, preRunPids, runStartMs }));
  const requiredPorts = perPort.filter((p) => p.required);

  if (requiredPorts.length === 0) {
    return {
      ports: perPort,
      cleanupRequired: false,
      cleanupSafe: true,
      cleanupAttempted: false,
      cleanupSucceeded: null,
      cleanupClean: true,
      killedPids: [],
    };
  }

  const cleanupSafe = requiredPorts.every((p) => p.safe);
  const killedPids = [];
  let cleanupAttempted = false;

  if (cleanupSafe) {
    for (const p of requiredPorts) {
      if (p.eligible) {
        cleanupAttempted = true;
        killPidTree(p.owningPid);
        killedPids.push(p.owningPid);
      }
    }
  }

  const afterCheck = ports.map((port) => ({ port, owners: queryPortOwnerPids(port) }));
  const stillOccupied = afterCheck.filter((s) => s.owners.length > 0).map((s) => s.port);
  const cleanupSucceeded = cleanupSafe && stillOccupied.length === 0;

  return {
    ports: perPort,
    cleanupRequired: true,
    cleanupSafe,
    cleanupAttempted,
    cleanupSucceeded,
    cleanupClean: false,
    killedPids,
    portsStillOccupiedAfter: stillOccupied,
  };
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

  // Requested embedded port: honours a caller-provided RIS_WDIO_EMBEDDED_PORT
  // (defaulting to 4445) rather than silently overriding it — see
  // docs/E2E_WDIO_PLAN.md §"Porty zależne od providera".
  const requestedEmbeddedPort =
    process.env["RIS_WDIO_EMBEDDED_PORT"] !== undefined
      ? validatePort(process.env["RIS_WDIO_EMBEDDED_PORT"])
      : EMBEDDED_PORT_DEFAULT;

  // Both ports are monitored for every provider: external's tauri-driver
  // listens on 4444 and proxies to a native msedgedriver that may itself
  // land on the embedded-default port, and embedded's in-process server
  // listens on the configured port — either can be left listening if the
  // WDIO/tauri-service process doesn't tear its driver down before exiting.
  const cleanupPorts = [...new Set([EXTERNAL_DRIVER_PORT, requestedEmbeddedPort])];

  const preRunPids = snapshotPreRunPids(cleanupPorts);
  currentRunCleanupContext = { ports: cleanupPorts, preRunPids, runStartMs };

  const env = {
    ...process.env,
    RIS_WDIO_TIMING: "1",
    RIS_WDIO_DRIVER_PROVIDER: provider,
    RIS_WDIO_RUN_ID: runId,
    RIS_WDIO_SLOW_COMMAND_MS: "500",
  };
  if (binary) env["TAURI_BINARY_PATH"] = resolve(binary);
  if (provider === "embedded") env["RIS_WDIO_EMBEDDED_PORT"] = String(requestedEmbeddedPort);

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

  const testPassed = wdioResult.exitCode === 0;
  const reportValid = validationErrors.length === 0;

  const cleanup = performSafeCleanup({ ports: cleanupPorts, preRunPids, runStartMs });
  currentRunCleanupContext = null;

  if (cleanup.cleanupRequired) {
    console.warn(
      `[benchmark]   Port(s) still occupied after the WDIO process exited: ` +
        cleanup.ports
          .filter((p) => p.required)
          .map((p) => `${p.port}=pid:${p.owningPid ?? "?"}(${p.processName ?? "unknown"})`)
          .join(", ") +
        `. cleanupSafe=${cleanup.cleanupSafe} cleanupSucceeded=${cleanup.cleanupSucceeded}` +
        (cleanup.killedPids.length ? ` killedPids=${cleanup.killedPids.join(",")}` : ""),
    );
    if (!cleanup.cleanupSafe) {
      for (const p of cleanup.ports.filter((p) => p.required && !p.safe)) {
        console.error(`[benchmark]   CLEANUP_UNSAFE on port ${p.port}: ${p.reason}`);
      }
    }
  }

  const outcome = classifyOutcome({
    interrupted: false,
    timedOut: wdioResult.timedOut,
    testPassed,
    reportValid,
    cleanupRequired: cleanup.cleanupRequired,
    cleanupSafe: cleanup.cleanupSafe,
    cleanupSucceeded: cleanup.cleanupSucceeded,
  });
  const passed = outcome === OUTCOMES.CLEAN_PASS;
  const excludedFromAggregate = !isEligibleForAggregate(outcome);

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
    testPassed,
    reportValid,
    cleanupRequired: cleanup.cleanupRequired,
    cleanupAttempted: cleanup.cleanupAttempted,
    cleanupSucceeded: cleanup.cleanupSucceeded,
    cleanupClean: cleanup.cleanupClean,
    cleanupSafe: cleanup.cleanupSafe,
    cleanupPorts: cleanup.ports,
    cleanupKilledPids: cleanup.killedPids,
    outcome,
    passed,
    excludedFromAggregate,
    exclusionReason: excludedFromAggregate ? outcome : null,
    validationErrors,
    reportDir: reportRunDir,
    summaryPath: existsSync(summaryPath) ? summaryPath : null,
    ndjsonPath: existsSync(ndjsonPath) ? ndjsonPath : null,
    ndjsonText,
    summary,
  };

  console.log(
    `[benchmark] Run ${runN} (${provider}) outcome=${outcome} passed=${passed} in ${Math.round(totalRunMs / 1000)}s ` +
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

const MIN_CLEAN_RUNS_FOR_COMPARISON = 2;

function outcomeLabel(outcome) {
  switch (outcome) {
    case OUTCOMES.CLEAN_PASS:
      return "CLEAN PASS";
    case OUTCOMES.PASS_WITH_FORCED_CLEANUP:
      return "PASS / FORCED CLEANUP";
    case OUTCOMES.TEST_FAILED:
    case OUTCOMES.REPORT_INVALID:
    case OUTCOMES.TIMED_OUT:
    case OUTCOMES.INTERRUPTED:
      return "FAILED";
    case OUTCOMES.CLEANUP_UNSAFE:
    case OUTCOMES.CLEANUP_FAILED:
      return "EXCLUDED";
    default:
      return outcome ?? "UNKNOWN";
  }
}

function writeSingleModeReport({ benchDir, provider, spec, repeat, runResults, envInfo }) {
  function pctArr(values, p) {
    return pct([...values].sort((a, b) => a - b), p);
  }

  const cleanRuns = runResults.filter((r) => r.outcome === OUTCOMES.CLEAN_PASS);
  const totalDurations = cleanRuns.map((r) => r.totalRunMs).sort((a, b) => a - b);
  const medians = cleanRuns.map((r) => r.summary.median).sort((a, b) => a - b);
  const p95s = cleanRuns.map((r) => r.summary.p95).sort((a, b) => a - b);
  const outcomeCounts = summarizeRunOutcomes(runResults);

  const aggregate = {
    provider,
    spec,
    totalRuns: repeat,
    cleanPassRuns: cleanRuns.length,
    forcedCleanupRuns: outcomeCounts.PASS_WITH_FORCED_CLEANUP,
    failedRuns:
      outcomeCounts.TEST_FAILED + outcomeCounts.REPORT_INVALID + outcomeCounts.TIMED_OUT + outcomeCounts.INTERRUPTED,
    excludedRuns: outcomeCounts.CLEANUP_UNSAFE + outcomeCounts.CLEANUP_FAILED,
    outcomeCounts,
    status: cleanRuns.length < MIN_CLEAN_RUNS_FOR_COMPARISON ? "INSUFFICIENT_CLEAN_RUNS" : "OK",
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
    aggregate.status === "INSUFFICIENT_CLEAN_RUNS"
      ? `> **INSUFFICIENT CLEAN RUNS** — fewer than ${MIN_CLEAN_RUNS_FOR_COMPARISON} CLEAN_PASS runs; no percentage conclusions should be drawn.`
      : ``,
    ``,
    `## Run Results`,
    ``,
    `| Run | Outcome | Total | WDIO proc | Commands | Median | P95 | Max | >=1s | >=5s |`,
    `|-----|---------|-------|-----------|----------|--------|-----|-----|------|------|`,
    ...runResults.map((r) => {
      const s = r.summary;
      return `| ${r.runN} | ${outcomeLabel(r.outcome)} (${r.outcome}) | ${Math.round(r.totalRunMs / 1000)}s | ${Math.round(r.wdioProcessMs / 1000)}s | ${s?.commandCount ?? "-"} | ${s?.median ?? "-"}ms | ${s?.p95 ?? "-"}ms | ${s?.max ?? "-"}ms | ${s?.bucketsGe?.ms1000 ?? "-"} | ${s?.bucketsGe?.ms5000 ?? "-"} |`;
    }),
    ``,
    `## Aggregate (CLEAN_PASS runs only)`,
    ``,
    `- Status: ${aggregate.status}`,
    `- CLEAN_PASS: ${aggregate.cleanPassRuns}/${aggregate.totalRuns} | Forced cleanup: ${aggregate.forcedCleanupRuns} | Failed: ${aggregate.failedRuns} | Excluded: ${aggregate.excludedRuns}`,
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

/**
 * Builds the A/B comparison object for one spec's runs. `runs` must already
 * carry `outcome`, `passed`, `totalRunMs`, `summary` (parsed summary.json or
 * null), and `ndjsonText` (raw commands.ndjson content or null) for each run.
 * Only CLEAN_PASS runs feed medians/percentiles/deltas — PASS_WITH_FORCED_CLEANUP,
 * failed, and excluded runs are reported but never aggregated.
 */
export function computeComparison({ runs, spec }) {
  const externalRuns = runs.filter((r) => r.provider === "external");
  const embeddedRuns = runs.filter((r) => r.provider === "embedded");

  function providerStats(providerRuns) {
    const clean = providerRuns.filter((r) => r.outcome === OUTCOMES.CLEAN_PASS || (r.passed && !r.outcome));
    const totalDurations = clean.map((r) => r.totalRunMs).filter((v) => v != null);
    const testExecDurations = clean.map((r) => r.summary?.testExecutionMs).filter((v) => v != null);
    const sessionStartupDurations = clean.map((r) => r.summary?.sessionStartupMs).filter((v) => v != null);
    const pooledCommandDurations = poolCommandDurationsFromNdjsonText(
      clean.map((r) => r.ndjsonText).filter((t) => t != null),
    );
    const perRunP95 = clean.map((r) => r.summary?.p95).filter((v) => v != null);
    const outcomeCounts = summarizeRunOutcomes(providerRuns);
    const excludedRuns = providerRuns
      .filter((r) => r.outcome && r.outcome !== OUTCOMES.CLEAN_PASS)
      .map((r) => ({ runN: r.runN, outcome: r.outcome }));

    return {
      runCount: providerRuns.length,
      passedCount: clean.length,
      outcomeCounts,
      excludedRuns,
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

  const status =
    externalStats.passedCount < MIN_CLEAN_RUNS_FOR_COMPARISON || embeddedStats.passedCount < MIN_CLEAN_RUNS_FOR_COMPARISON
      ? "INSUFFICIENT_CLEAN_RUNS"
      : "OK";

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
    status,
    directionNote: "positive delta / positive percent = embedded faster or better than external",
    external: externalStats,
    embedded: embeddedStats,
    deltas,
    steps,
  };
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
    `Only CLEAN_PASS runs feed medians/percentiles/deltas below; PASS_WITH_FORCED_CLEANUP, FAILED, and EXCLUDED runs are shown for diagnostics only.`,
    ``,
    comparison.status === "INSUFFICIENT_CLEAN_RUNS"
      ? `> **Comparison status: INSUFFICIENT CLEAN RUNS** — at least one provider has fewer than ${MIN_CLEAN_RUNS_FOR_COMPARISON} CLEAN_PASS runs for this spec. No percentage conclusions should be drawn from the table below.`
      : `> **Comparison status: OK** — both providers have at least ${MIN_CLEAN_RUNS_FOR_COMPARISON} CLEAN_PASS runs.`,
    ``,
    `## Runs`,
    ``,
    `| # | Provider | Run | Outcome | Total | WDIO proc | Session startup | Test exec | Commands | Median | P95 | Cleanup required | Cleanup safe | Cleanup succeeded |`,
    `|---|----------|-----|---------|-------|-----------|------------------|-----------|----------|--------|-----|-------------------|--------------|--------------------|`,
    ...runResults.map((r, i) => {
      const s = r.summary;
      return `| ${i + 1} | ${r.provider} | ${r.runN} | ${outcomeLabel(r.outcome)} (${r.outcome}) | ${Math.round(r.totalRunMs / 1000)}s | ${Math.round(r.wdioProcessMs / 1000)}s | ${fmt(s?.sessionStartupMs)} | ${fmt(s?.testExecutionMs)} | ${s?.commandCount ?? "-"} | ${s?.median ?? "-"}ms | ${s?.p95 ?? "-"}ms | ${r.cleanupRequired} | ${r.cleanupSafe} | ${r.cleanupSucceeded} |`;
    }),
    ``,
    `## Outcome breakdown`,
    ``,
    `| Provider | CLEAN PASS | PASS / FORCED CLEANUP | FAILED | EXCLUDED |`,
    `|----------|-----------|------------------------|--------|----------|`,
    `| external | ${comparison.external.outcomeCounts.CLEAN_PASS} | ${comparison.external.outcomeCounts.PASS_WITH_FORCED_CLEANUP} | ${comparison.external.outcomeCounts.TEST_FAILED + comparison.external.outcomeCounts.REPORT_INVALID + comparison.external.outcomeCounts.TIMED_OUT + comparison.external.outcomeCounts.INTERRUPTED} | ${comparison.external.outcomeCounts.CLEANUP_UNSAFE + comparison.external.outcomeCounts.CLEANUP_FAILED} |`,
    `| embedded | ${comparison.embedded.outcomeCounts.CLEAN_PASS} | ${comparison.embedded.outcomeCounts.PASS_WITH_FORCED_CLEANUP} | ${comparison.embedded.outcomeCounts.TEST_FAILED + comparison.embedded.outcomeCounts.REPORT_INVALID + comparison.embedded.outcomeCounts.TIMED_OUT + comparison.embedded.outcomeCounts.INTERRUPTED} | ${comparison.embedded.outcomeCounts.CLEANUP_UNSAFE + comparison.embedded.outcomeCounts.CLEANUP_FAILED} |`,
    ``,
    `## Aggregate comparison (CLEAN_PASS only)`,
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
      `## Step comparison (core-inventory, CLEAN_PASS runs only)`,
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
          console.error(`[benchmark] Stopping matrix after non-CLEAN_PASS run (provider=${provider}, run ${runN}, outcome=${result.outcome}).`);
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

    console.log(`\n[benchmark] === Compare complete (status=${comparison.status}) ===`);
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
          console.error(`[benchmark] Stopping after non-CLEAN_PASS run ${runN} (outcome=${result.outcome}). Use --continue-on-failure to proceed.`);
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

    console.log(`\n[benchmark] === Complete (status=${aggregate.status}) ===`);
    console.log(`[benchmark] CLEAN_PASS: ${aggregate.cleanPassRuns}/${aggregate.totalRuns}`);
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
