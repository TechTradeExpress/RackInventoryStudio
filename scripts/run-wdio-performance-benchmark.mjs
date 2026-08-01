#!/usr/bin/env node
/**
 * WDIO performance benchmark runner — external driver provider only.
 *
 * external (tauri-driver) is the only supported WDIO driver provider. An
 * embedded in-process WebDriver server was evaluated here via this script's
 * former --provider/--compare options; see docs/E2E_WDIO_PLAN.md's "Embedded
 * WDIO provider removal" section for the outcome and removal decision.
 *
 * Usage:
 *   node scripts/run-wdio-performance-benchmark.mjs --spec app-smoke --repeat 1
 *   node scripts/run-wdio-performance-benchmark.mjs --spec core-inventory --repeat 1 \
 *     --binary "C:\path\to\rack-inventory-studio-desktop.exe"
 *
 * Options:
 *   --spec      spec name without .e2e.ts    (required)
 *   --repeat    number of runs, >= 1         (required)
 *   --binary    path to the Tauri binary     (optional — auto-detected otherwise)
 *   --continue-on-failure   keep running after a failed run (default: stop)
 *
 * Result semantics (see OUTCOMES below): a run's `outcome` is one of a closed
 * set of values. `passed === true` iff `outcome === "CLEAN_PASS"` — a run
 * whose WDIO process exited 0, whose timing report validated, AND whose
 * driver processes tore down without requiring a forced safety-net cleanup.
 * A run that passed its test but needed forced cleanup is reported as
 * PASS_WITH_FORCED_CLEANUP — it is kept for diagnostics but excluded from
 * every aggregate/percentile computation.
 *
 * Output:
 *   <os.tmpdir()>/ris-wdio-bench/<run-id>/          per-run timing data (written by command-timing.ts)
 *   <os.tmpdir()>/ris-wdio-bench/benchmark-<date>/  aggregate JSON + Markdown
 *
 * Uses only Node.js built-in modules — no extra dependencies.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

// external is the only supported WDIO driver provider — see the module doc
// comment. Kept as a labeled constant (rather than removed outright) because
// it is written into every report's meta/summary for readability.
export const PROVIDER = "external";

// Specs that live under e2e-wdio/benchmarks/ instead of e2e-wdio/specs/ —
// opt-in benchmark harnesses, never part of the default WDIO spec glob
// (./specs/**/*.e2e.ts in wdio.conf.ts).
export const BENCHMARK_ONLY_SPECS = ["representative-latency"];

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

// Spec names are interpolated directly into a filesystem path
// (`${spec}.e2e.ts`) — restrict to safe characters so a malformed --spec
// value can never escape the specs/benchmarks directory.
const SPEC_NAME_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidSpecName(name) {
  return typeof name === "string" && SPEC_NAME_PATTERN.test(name);
}

/**
 * Maps a --spec name to its .e2e.ts file path: BENCHMARK_ONLY_SPECS resolve
 * under e2e-wdio/benchmarks/, everything else under e2e-wdio/specs/ (the
 * default WDIO suite glob).
 */
export function resolveSpecPath(desktopDir, specName) {
  const dir = BENCHMARK_ONLY_SPECS.includes(specName) ? "benchmarks" : "specs";
  return join(desktopDir, "e2e-wdio", dir, `${specName}.e2e.ts`);
}

const SPEC_FILE_SUFFIX = ".e2e.ts";

/**
 * Lists available spec names (without the .e2e.ts suffix) in a specs/
 * directory, sorted. The one place this module touches the filesystem for
 * spec-name validation — isolated here so it can be exercised against a
 * temp directory in tests without needing the real apps/desktop/e2e-wdio/specs.
 */
export function listAvailableSpecNames(specsDir) {
  return readdirSync(specsDir)
    .filter((f) => f.endsWith(SPEC_FILE_SUFFIX))
    .map((f) => f.slice(0, -SPEC_FILE_SUFFIX.length))
    .sort();
}

/**
 * True only for a name that is either a real spec file under specsDir (per
 * listAvailableSpecNames) or one of the explicit BENCHMARK_ONLY_SPECS.
 * isValidSpecName's character-class check (no path separators, no `..`) is
 * re-applied here too — a controlled directory listing is the primary
 * defense, but this keeps the safe-character invariant explicit at the one
 * call site that decides whether a spec name is trusted enough to resolve
 * to a file path at all.
 */
export function isKnownSpecName(name, specsDir) {
  if (!isValidSpecName(name)) return false;
  if (BENCHMARK_ONLY_SPECS.includes(name)) return true;
  return listAvailableSpecNames(specsDir).includes(name);
}

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
const SIGTERM_GRACE_MS = 3000;

// ── Argument parsing / validation (pure — unit tested) ─────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    spec: null,
    repeat: null,
    binary: null,
    continueOnFailure: false,
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
      case "--binary":
        result.binary = args[++i] ?? null;
        break;
      case "--continue-on-failure":
        result.continueOnFailure = true;
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
  } else if (!isValidSpecName(opts.spec)) {
    errors.push(
      `--spec "${opts.spec}" is not a valid spec name (letters, digits, "-", "_" only, max 100 chars)`,
    );
  }
  if (opts.repeat === null || !Number.isInteger(opts.repeat) || opts.repeat < 1) {
    errors.push("--repeat must be a positive integer");
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

/**
 * Classification for benchmark measurement purposes ONLY — never a
 * substitute for `passed` (which stays true exclusively for CLEAN_PASS, see
 * classifyOutcome()) or for a CI pass/fail gate.
 *
 * On Windows, @wdio/tauri-service's external provider does not reliably
 * release tauri-driver.exe/msedgedriver.exe on its own even after a natural
 * teardown grace window — every external run in the Stage 3B.3 Windows
 * matrix landed on PASS_WITH_FORCED_CLEANUP, never CLEAN_PASS (see
 * docs/E2E_WDIO_WINDOWS_PERFORMANCE.md §"Outcome semantics"). Forced cleanup
 * happens strictly *after* the WDIO process — and therefore all in-test
 * timing — has already completed, so a PASS_WITH_FORCED_CLEANUP run's timing
 * data is legitimate to use in a benchmark aggregate provided the cleanup
 * itself was verified safe (PID ownership unambiguously confirmed, never
 * inferred from process name/time alone — see evaluateCleanupEligibility())
 * and actually succeeded.
 *
 * A run is measurementEligible only when every one of the following holds:
 *   - the WDIO process exited 0 (testPassed),
 *   - the timing report validated (reportValid),
 *   - outcome is CLEAN_PASS or PASS_WITH_FORCED_CLEANUP (any other outcome —
 *     TEST_FAILED, REPORT_INVALID, CLEANUP_UNSAFE, CLEANUP_FAILED, TIMED_OUT,
 *     INTERRUPTED — is never eligible),
 *   - cleanupSafe is true,
 *   - cleanup either was not required (CLEAN_PASS) or succeeded
 *     (PASS_WITH_FORCED_CLEANUP).
 */
export function isMeasurementEligible({
  testPassed,
  reportValid,
  outcome,
  cleanupRequired,
  cleanupSafe,
  cleanupSucceeded,
}) {
  if (!testPassed) return false;
  if (!reportValid) return false;
  if (outcome !== OUTCOMES.CLEAN_PASS && outcome !== OUTCOMES.PASS_WITH_FORCED_CLEANUP) return false;
  if (!cleanupSafe) return false;
  if (cleanupRequired && !cleanupSucceeded) return false;
  return true;
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
// tauri-driver proxies to a native browser driver (msedgedriver.exe on
// Windows, WebKitWebDriver on Linux) which may itself occupy this port —
// part of the external driver chain's own cleanup contract, monitored
// alongside EXTERNAL_DRIVER_PORT for every run.
const EXTERNAL_NATIVE_DRIVER_PORT = 4445;

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

const NATURAL_TEARDOWN_GRACE_MS = 5000;
const NATURAL_TEARDOWN_POLL_MS = 500;

/**
 * Gives driver processes a bounded final chance to release their ports on
 * their own after the WDIO process has already exited, before this is
 * treated as requiring forced cleanup. @wdio/tauri-service's own
 * "Stopping N driver(s)..." step is asynchronous with the WDIO process's
 * own exit on Windows — checking at t=0 can catch it mid-teardown. This
 * does not weaken the safety guarantees in evaluateCleanupEligibility(): it
 * only affects whether cleanup is judged *required* at all, never who is
 * eligible to be auto-killed once it is.
 */
function waitForNaturalTeardown(ports, { graceMs = NATURAL_TEARDOWN_GRACE_MS, intervalMs = NATURAL_TEARDOWN_POLL_MS } = {}) {
  if (process.platform !== "win32") return;
  const deadline = Date.now() + graceMs;
  for (;;) {
    const stillOccupied = ports.some((port) => queryPortOwnerPids(port).length > 0);
    if (!stillOccupied) return;
    if (Date.now() >= deadline) return;
    spawnSync("powershell.exe", ["-NoProfile", "-Command", `Start-Sleep -Milliseconds ${intervalMs}`]);
  }
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

function collectEnvironmentInfo({ desktopDir, spec, repeat, binary }) {
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
    edge: getEdgeVersion(),
    edgeDriver: getEdgeDriverVersion(desktopDir),
    provider: PROVIDER,
    spec,
    repeat,
    binary: binary ?? "(auto-detect)",
    benchmarkStarted: new Date().toISOString(),
  };
}

// ── Single-run execution ─────────────────────────────────────────────────────

async function runSingle({ spec, runN, binary, desktopDir, wdioEntrypoint, wdioConf, specPath }) {
  const runId = generateRunId();
  const runStartMs = Date.now();

  console.log(`\n[benchmark] === Run ${runN} spec=${spec} runId=${runId} ===`);

  const cleanupPorts = [EXTERNAL_DRIVER_PORT, EXTERNAL_NATIVE_DRIVER_PORT];

  const preRunPids = snapshotPreRunPids(cleanupPorts);
  currentRunCleanupContext = { ports: cleanupPorts, preRunPids, runStartMs };

  const env = {
    ...process.env,
    RIS_WDIO_TIMING: "1",
    RIS_WDIO_RUN_ID: runId,
    RIS_WDIO_SLOW_COMMAND_MS: "500",
  };
  if (binary) env["TAURI_BINARY_PATH"] = resolve(binary);

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
        provider: PROVIDER,
        spec,
        ndjsonCommandCount,
        expectedPlatform: os.platform(),
      }),
    );
  }

  const testPassed = wdioResult.exitCode === 0;
  const reportValid = validationErrors.length === 0;

  // Give tauri-driver/msedgedriver a final bounded chance to tear down on
  // their own before treating this as requiring forced cleanup — see
  // waitForNaturalTeardown().
  waitForNaturalTeardown(cleanupPorts);
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
  const measurementEligible = isMeasurementEligible({
    testPassed,
    reportValid,
    outcome,
    cleanupRequired: cleanup.cleanupRequired,
    cleanupSafe: cleanup.cleanupSafe,
    cleanupSucceeded: cleanup.cleanupSucceeded,
  });

  const result = {
    runN,
    runId,
    provider: PROVIDER,
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
    measurementEligible,
    validationErrors,
    reportDir: reportRunDir,
    summaryPath: existsSync(summaryPath) ? summaryPath : null,
    ndjsonPath: existsSync(ndjsonPath) ? ndjsonPath : null,
    ndjsonText,
    summary,
  };

  console.log(
    `[benchmark] Run ${runN} outcome=${outcome} passed=${passed} measurementEligible=${measurementEligible} ` +
      `in ${Math.round(totalRunMs / 1000)}s exitCode=${wdioResult.exitCode} reportValid=${reportValid}`,
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

/**
 * Basename (no extension) shared by a run series's JSON/Markdown output
 * files — spec-name-agnostic, so representative-latency produces
 * `external-representative-latency.{json,md}` exactly like any other spec.
 */
export function buildBenchmarkOutputBasename(spec) {
  return `${PROVIDER}-${spec}`;
}

/**
 * Aggregates a run series (one spec, N repeats) into the summary object
 * written alongside the per-run results.
 *
 * Duration/latency statistics are computed from measurementEligible runs
 * (see isMeasurementEligible()) rather than strictly CLEAN_PASS runs: on
 * Windows the external provider's runs legitimately land on
 * PASS_WITH_FORCED_CLEANUP (see docs/E2E_WDIO_WINDOWS_PERFORMANCE.md
 * §"Outcome semantics"), and excluding all of them here would make the
 * aggregate report empty/meaningless for the Windows representative
 * benchmark. `cleanPassRuns` is kept alongside `measurementEligibleRuns` so
 * the distinction remains visible in the output — this does not change
 * `passed`, which stays true only for CLEAN_PASS everywhere else.
 */
export function computeSingleModeAggregate({ spec, repeat, runResults }) {
  function pctArr(values, p) {
    return pct([...values].sort((a, b) => a - b), p);
  }

  const cleanRuns = runResults.filter((r) => r.outcome === OUTCOMES.CLEAN_PASS);
  const measurementRuns = runResults.filter((r) => r.measurementEligible);
  const totalDurations = measurementRuns.map((r) => r.totalRunMs).sort((a, b) => a - b);
  const medians = measurementRuns.map((r) => r.summary.median).sort((a, b) => a - b);
  const p95s = measurementRuns.map((r) => r.summary.p95).sort((a, b) => a - b);
  const outcomeCounts = summarizeRunOutcomes(runResults);

  return {
    provider: PROVIDER,
    spec,
    totalRuns: repeat,
    cleanPassRuns: cleanRuns.length,
    measurementEligibleRuns: measurementRuns.length,
    forcedCleanupRuns: outcomeCounts.PASS_WITH_FORCED_CLEANUP,
    failedRuns:
      outcomeCounts.TEST_FAILED + outcomeCounts.REPORT_INVALID + outcomeCounts.TIMED_OUT + outcomeCounts.INTERRUPTED,
    excludedRuns: outcomeCounts.CLEANUP_UNSAFE + outcomeCounts.CLEANUP_FAILED,
    outcomeCounts,
    status: measurementRuns.length < MIN_CLEAN_RUNS_FOR_COMPARISON ? "INSUFFICIENT_MEASUREMENT_RUNS" : "OK",
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
}

function writeSingleModeReport({ benchDir, spec, repeat, runResults, envInfo }) {
  const aggregate = computeSingleModeAggregate({ spec, repeat, runResults });

  const benchmarkResult = {
    meta: envInfo,
    runs: runResults.map(({ ndjsonText: _ndjsonText, ...rest }) => rest),
    aggregate,
    benchmarkCompleted: new Date().toISOString(),
  };

  const basename = buildBenchmarkOutputBasename(spec);
  const jsonPath = join(benchDir, `${basename}.json`);
  writeFileSync(jsonPath, JSON.stringify(benchmarkResult, null, 2));

  const md = [
    `# Benchmark: ${PROVIDER} / ${spec}`,
    ``,
    `Date: ${envInfo.benchmarkStarted}`,
    `Platform: ${envInfo.platform} ${envInfo.arch} | CPU: ${envInfo.cpuModel} (${envInfo.cpuCount} cores) | RAM: ${envInfo.totalRamMB} MB`,
    `Node: ${envInfo.node} | Rust: ${envInfo.rustc}`,
    `Provider: **${PROVIDER}** | Spec: \`${spec}\` | Repeat: ${repeat}`,
    ``,
    aggregate.status === "INSUFFICIENT_MEASUREMENT_RUNS"
      ? `> **INSUFFICIENT MEASUREMENT-ELIGIBLE RUNS** — fewer than ${MIN_CLEAN_RUNS_FOR_COMPARISON} measurementEligible runs; no percentage conclusions should be drawn.`
      : ``,
    ``,
    `## Run Results`,
    ``,
    `| Run | Outcome | measurementEligible | Total | WDIO proc | Commands | Median | P95 | Max | >=1s | >=5s |`,
    `|-----|---------|----------------------|-------|-----------|----------|--------|-----|-----|------|------|`,
    ...runResults.map((r) => {
      const s = r.summary;
      return `| ${r.runN} | ${outcomeLabel(r.outcome)} (${r.outcome}) | ${r.measurementEligible} | ${Math.round(r.totalRunMs / 1000)}s | ${Math.round(r.wdioProcessMs / 1000)}s | ${s?.commandCount ?? "-"} | ${s?.median ?? "-"}ms | ${s?.p95 ?? "-"}ms | ${s?.max ?? "-"}ms | ${s?.bucketsGe?.ms1000 ?? "-"} | ${s?.bucketsGe?.ms5000 ?? "-"} |`;
    }),
    ``,
    `## Aggregate (measurementEligible runs only — see isMeasurementEligible())`,
    ``,
    `- Status: ${aggregate.status}`,
    `- measurementEligible: ${aggregate.measurementEligibleRuns}/${aggregate.totalRuns} | CLEAN_PASS: ${aggregate.cleanPassRuns}/${aggregate.totalRuns} | Forced cleanup: ${aggregate.forcedCleanupRuns} | Failed: ${aggregate.failedRuns} | Excluded: ${aggregate.excludedRuns}`,
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

  const mdPath = join(benchDir, `${basename}.md`);
  writeFileSync(mdPath, md);

  return { jsonPath, mdPath, aggregate };
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
  const specsDir = join(desktopDir, "e2e-wdio", "specs");
  const specPath = resolveSpecPath(desktopDir, opts.spec);

  if (!existsSync(wdioConf)) {
    console.error(`[benchmark] WDIO config not found: ${wdioConf}`);
    process.exit(1);
  }
  // Do not accept an arbitrary path from the user: opts.spec must resolve
  // either to a real file under e2e-wdio/specs/ or to an explicit
  // benchmark-only name (representative-latency) — never anything derived
  // from unchecked user input.
  if (!isKnownSpecName(opts.spec, specsDir)) {
    const known = [...BENCHMARK_ONLY_SPECS, ...listAvailableSpecNames(specsDir)];
    console.error(`[benchmark] Unknown spec "${opts.spec}". Must be one of: ${known.join(", ")}`);
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
    desktopDir,
    spec: opts.spec,
    repeat: opts.repeat,
    binary: opts.binary,
  });
  console.log("[benchmark] Environment:");
  console.log(JSON.stringify(envInfo, null, 2));

  const runResults = [];
  let allPassed = true;

  for (let runN = 1; runN <= opts.repeat; runN++) {
    const result = await runSingle({
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
    spec: opts.spec,
    repeat: opts.repeat,
    runResults,
    envInfo,
  });

  console.log(`\n[benchmark] === Complete (status=${aggregate.status}) ===`);
  console.log(
    `[benchmark] measurementEligible: ${aggregate.measurementEligibleRuns}/${aggregate.totalRuns} ` +
      `(CLEAN_PASS: ${aggregate.cleanPassRuns}/${aggregate.totalRuns})`,
  );
  console.log(`[benchmark] Aggregate JSON: ${jsonPath}`);
  console.log(`[benchmark] Markdown:       ${mdPath}`);

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
