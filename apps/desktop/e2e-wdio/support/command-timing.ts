/**
 * Opt-in WDIO command timing instrumentation.
 *
 * Activated only when RIS_WDIO_TIMING=1.  When the variable is absent the
 * module is a no-op: no logs, no files, no behavioural change.
 *
 * Env vars:
 *   RIS_WDIO_TIMING=1              — enable instrumentation
 *   RIS_WDIO_SLOW_COMMAND_MS=500   — log commands slower than this (default 500)
 *   RIS_WDIO_RUN_ID=<id>           — shared run ID across launcher + workers
 *                                    (set automatically when launcher starts;
 *                                     pass explicitly from benchmark runner)
 *
 * All command/step records are kept in memory and written exactly once, at
 * finalization, by flushTimingReport().  No synchronous I/O happens per
 * command or per step — that would pollute the very latency numbers this
 * instrumentation exists to measure.
 *
 * Report location:
 *   <os.tmpdir()>/ris-wdio-bench/<run-id>/commands.ndjson
 *   <os.tmpdir()>/ris-wdio-bench/<run-id>/summary.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "@wdio/types";

// ── Configuration ─────────────────────────────────────────────────────────────

export const TIMING_ENABLED = process.env["RIS_WDIO_TIMING"] === "1";

const SLOW_MS = (() => {
  const raw = process.env["RIS_WDIO_SLOW_COMMAND_MS"];
  const n = raw !== undefined ? parseInt(raw, 10) : 500;
  return Number.isFinite(n) && n >= 0 ? n : 500;
})();

// Run IDs are used verbatim to build a filesystem path under tmpdir(), so an
// unvalidated value could escape the report directory (e.g. "../../etc").
// Allowed: ASCII letters, digits, hyphen, underscore; max 100 chars.
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export function isValidRunId(id: string): boolean {
  return RUN_ID_PATTERN.test(id);
}

// The launcher sets this env var so all forked workers inherit the same ID.
// If run directly without the benchmark runner and RIS_WDIO_RUN_ID is absent,
// the launcher generates one here and sets it so workers pick it up.
if (TIMING_ENABLED && !process.env["RIS_WDIO_RUN_ID"]) {
  process.env["RIS_WDIO_RUN_ID"] = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

if (TIMING_ENABLED && process.env["RIS_WDIO_RUN_ID"] && !isValidRunId(process.env["RIS_WDIO_RUN_ID"])) {
  throw new Error(
    `[WDIO timing] Invalid RIS_WDIO_RUN_ID="${process.env["RIS_WDIO_RUN_ID"]}". ` +
      `Allowed: letters, digits, "-", "_", max 100 chars.`,
  );
}

export const RUN_ID: string = process.env["RIS_WDIO_RUN_ID"] ?? "noop";

export const PROVIDER: string = process.env["RIS_WDIO_DRIVER_PROVIDER"] ?? "external";

export const REPORT_DIR: string | null = TIMING_ENABLED
  ? join(tmpdir(), "ris-wdio-bench", RUN_ID)
  : null;

// ── Types ────────────────────────────────────────────────────────────────────

interface CommandRecord {
  type: "command";
  seq: number;
  commandName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  success: boolean;
  error?: string;
  testName: string;
  suiteName: string;
  platform: string;
  provider: string;
  pid: number;
  runId: string;
}

interface StepRecord {
  type: "step";
  seq: number;
  stepName: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  success: boolean;
  testName: string;
  platform: string;
  provider: string;
  pid: number;
  runId: string;
}

type AnyRecord = CommandRecord | StepRecord;

interface PendingCommand {
  seq: number;
  commandName: string;
  startMs: number;
  testName: string;
  suiteName: string;
}

// ── Mutable state (per-process — worker carries the real data) ────────────────

let nextSeq = 0;
// Stack: WDIO commands are sequential with maxInstances:1, but we use a stack
// as a safe structure in case hooks nest or overlap unexpectedly.
const pendingStack: PendingCommand[] = [];
const allRecords: AnyRecord[] = [];

let currentTestName = "(startup)";
let currentSuiteName = "";

// ── Lifecycle timestamps ────────────────────────────────────────────────────
// Captured across hooks to report session startup / test execution / teardown
// as separate phases instead of one opaque "sessionMs" figure.

let beforeSessionMs: number | null = null;
let sessionReadyMs: number | null = null; // "before" hook — browser session is live
let firstBeforeTestMs: number | null = null;
let lastAfterTestMs: number | null = null;
let afterHookEndMs: number | null = null;

let flushed = false;

// ── Statistics helpers ────────────────────────────────────────────────────────

/** Nearest-rank percentile on a pre-sorted ascending array. */
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

// ── flushTimingReport ───────────────────────────────────────────────────────

/**
 * Writes commands.ndjson and summary.json exactly once. Safe to call
 * multiple times (e.g. from both `after` and a fallback `afterSession`) —
 * only the first call performs I/O.
 */
export function flushTimingReport(): void {
  if (!TIMING_ENABLED || !REPORT_DIR) return;
  if (flushed) return;
  flushed = true;

  mkdirSync(REPORT_DIR, { recursive: true });

  const ndjson = allRecords.map((r) => JSON.stringify(r)).join("\n") + (allRecords.length ? "\n" : "");
  writeFileSync(join(REPORT_DIR, "commands.ndjson"), ndjson);

  const cmds = allRecords.filter((r): r is CommandRecord => r.type === "command");
  const steps = allRecords.filter((r): r is StepRecord => r.type === "step");
  const sorted = cmds.map((r) => r.durationMs).sort((a, b) => a - b);

  // Aggregate by command name
  const byName = new Map<string, number[]>();
  for (const r of cmds) {
    const arr = byName.get(r.commandName) ?? [];
    arr.push(r.durationMs);
    byName.set(r.commandName, arr);
  }
  const byCommandName = Array.from(byName.entries())
    .map(([name, durs]) => {
      const s = [...durs].sort((a, b) => a - b);
      return {
        commandName: name,
        count: durs.length,
        sum: durs.reduce((a, b) => a + b, 0),
        mean: avg(durs),
        median: pct(s, 50),
        p95: pct(s, 95),
        max: s[s.length - 1] ?? 0,
      };
    })
    .sort((a, b) => b.sum - a.sum);

  // Aggregate by step name
  const byStepNameMap = new Map<string, StepRecord[]>();
  for (const r of steps) {
    const arr = byStepNameMap.get(r.stepName) ?? [];
    arr.push(r);
    byStepNameMap.set(r.stepName, arr);
  }
  const byStepName = Array.from(byStepNameMap.entries()).map(([name, recs]) => {
    const durs = recs.map((r) => r.durationMs).sort((a, b) => a - b);
    return {
      stepName: name,
      count: recs.length,
      successful: recs.filter((r) => r.success).length,
      failed: recs.filter((r) => !r.success).length,
      min: durs[0] ?? 0,
      mean: avg(durs),
      median: pct(durs, 50),
      p95: pct(durs, 95),
      max: durs[durs.length - 1] ?? 0,
    };
  });

  const slowest20 = [...cmds]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 20)
    .map((r) => ({
      seq: r.seq,
      commandName: r.commandName,
      durationMs: r.durationMs,
      testName: r.testName,
    }));

  // ── Lifecycle phase durations ──────────────────────────────────────────────
  // Each phase is null (not 0) when the required timestamps were not both
  // captured, with an explanatory note — never silently reported as zero.
  const lifecycleNotes: string[] = [];

  const sessionStartupMs =
    beforeSessionMs !== null && sessionReadyMs !== null ? sessionReadyMs - beforeSessionMs : null;
  if (sessionStartupMs === null) {
    lifecycleNotes.push(
      "sessionStartupMs unmeasured: beforeSession and/or before (session-ready) hook did not fire.",
    );
  }

  const testExecutionMs =
    firstBeforeTestMs !== null && lastAfterTestMs !== null ? lastAfterTestMs - firstBeforeTestMs : null;
  if (testExecutionMs === null) {
    lifecycleNotes.push("testExecutionMs unmeasured: beforeTest and/or afterTest hook did not fire.");
  }

  const sessionTeardownMs =
    afterHookEndMs !== null && lastAfterTestMs !== null ? afterHookEndMs - lastAfterTestMs : null;
  if (sessionTeardownMs === null) {
    lifecycleNotes.push("sessionTeardownMs unmeasured: afterTest and/or after hook completion was not captured.");
  }

  const workerObservedMs =
    afterHookEndMs !== null && beforeSessionMs !== null ? afterHookEndMs - beforeSessionMs : null;
  if (workerObservedMs === null) {
    lifecycleNotes.push("workerObservedMs unmeasured: beforeSession and/or after hook completion was not captured.");
  }

  const summary = {
    runId: RUN_ID,
    provider: PROVIDER,
    platform: process.platform,
    pid: process.pid,
    commandCount: sorted.length,
    min: sorted[0] ?? 0,
    mean: avg(sorted),
    median: pct(sorted, 50),
    p90: pct(sorted, 90),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    bucketsGe: {
      ms250: sorted.filter((d) => d >= 250).length,
      ms500: sorted.filter((d) => d >= 500).length,
      ms1000: sorted.filter((d) => d >= 1000).length,
      ms2000: sorted.filter((d) => d >= 2000).length,
      ms5000: sorted.filter((d) => d >= 5000).length,
    },
    slowest20,
    byCommandName,
    steps: steps.map((s) => ({
      stepName: s.stepName,
      success: s.success,
      durationMs: s.durationMs,
      startMs: s.startMs,
      endMs: s.endMs,
      testName: s.testName,
    })),
    byStepName,
    sessionStartupMs,
    testExecutionMs,
    sessionTeardownMs,
    workerObservedMs,
    lifecycleNotes,
  };

  const summaryPath = join(REPORT_DIR, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`[WDIO timing] === Run ${RUN_ID} Summary ===`);
  console.log(
    `[WDIO timing] commands=${sorted.length}` +
      ` median=${summary.median}ms p95=${summary.p95}ms p99=${summary.p99}ms max=${summary.max}ms`,
  );
  console.log(
    `[WDIO timing] slow(>=1s)=${summary.bucketsGe.ms1000} slow(>=5s)=${summary.bucketsGe.ms5000}`,
  );
  console.log(
    `[WDIO timing] sessionStartupMs=${sessionStartupMs ?? "n/a"} testExecutionMs=${testExecutionMs ?? "n/a"} ` +
      `sessionTeardownMs=${sessionTeardownMs ?? "n/a"} workerObservedMs=${workerObservedMs ?? "n/a"}`,
  );
  console.log(`[WDIO timing] report: ${REPORT_DIR}`);
}

// ── measureStep ───────────────────────────────────────────────────────────────

/**
 * Wraps an async action as a named logical step in the timing log.
 * When TIMING_ENABLED is false, calls fn() directly with zero overhead.
 */
export async function measureStep<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
  if (!TIMING_ENABLED) return fn();
  const seq = nextSeq++;
  const startMs = Date.now();
  let success = true;
  try {
    return await fn();
  } catch (e) {
    success = false;
    throw e;
  } finally {
    const endMs = Date.now();
    const record: StepRecord = {
      type: "step",
      seq,
      stepName,
      startMs,
      endMs,
      durationMs: endMs - startMs,
      success,
      testName: currentTestName,
      platform: process.platform,
      provider: PROVIDER,
      pid: process.pid,
      runId: RUN_ID,
    };
    allRecords.push(record);
    console.log(
      `[WDIO timing] step:${stepName} ${record.durationMs}ms ${success ? "OK" : "ERR"}`,
    );
  }
}

// ── WDIO config patcher ───────────────────────────────────────────────────────

/**
 * Patches the WDIO config object with timing hooks.
 * Safe to call unconditionally — honours TIMING_ENABLED internally.
 */
export function patchWdioConfig(config: Options.Testrunner): void {
  if (!TIMING_ENABLED) return;

  // ── beforeSession: worker is about to initialize the webdriver session ──────
  const origBeforeSession = config.beforeSession;
  config.beforeSession = async (sessionConfig, capabilities, specs, cid) => {
    if (origBeforeSession) {
      await (origBeforeSession as (
        c: unknown,
        cap: unknown,
        s: unknown,
        id: unknown,
      ) => Promise<void>)(sessionConfig, capabilities, specs, cid);
    }
    if (beforeSessionMs === null) beforeSessionMs = Date.now();
  };

  // ── before: mark session ready (runs in worker, after browser session opens) ──
  const origBefore = config.before;
  config.before = async (capabilities, specs, browser) => {
    if (origBefore) {
      await (origBefore as (c: unknown, s: unknown, b: unknown) => Promise<void>)(
        capabilities,
        specs,
        browser,
      );
    }
    sessionReadyMs = Date.now();
  };

  // ── beforeSuite / afterSuite: track suite name ──────────────────────────────
  const origBeforeSuite = config.beforeSuite;
  config.beforeSuite = async (suite) => {
    if (origBeforeSuite) {
      await (origBeforeSuite as (s: unknown) => Promise<void>)(suite);
    }
    currentSuiteName = (suite as { title?: string }).title ?? "";
  };

  // ── beforeTest / afterTest: track test name and execution window ─────────────
  const origBeforeTest = config.beforeTest;
  config.beforeTest = async (test, ctx) => {
    if (origBeforeTest) {
      await (origBeforeTest as (t: unknown, c: unknown) => Promise<void>)(test, ctx);
    }
    currentTestName = (test as { title?: string }).title ?? "";
    if (firstBeforeTestMs === null) firstBeforeTestMs = Date.now();
  };

  const origAfterTest = config.afterTest;
  config.afterTest = async (test, ctx, result) => {
    if (origAfterTest) {
      await (origAfterTest as (t: unknown, c: unknown, r: unknown) => Promise<void>)(
        test,
        ctx,
        result,
      );
    }
    lastAfterTestMs = Date.now();
    currentTestName = "(between tests)";
  };

  // ── beforeCommand: push to pending stack ─────────────────────────────────────
  const origBeforeCommand = config.beforeCommand;
  config.beforeCommand = async (commandName, args) => {
    if (origBeforeCommand) {
      await (origBeforeCommand as (n: string, a: unknown[]) => Promise<void>)(commandName, args);
    }
    pendingStack.push({
      seq: nextSeq++,
      commandName,
      startMs: Date.now(),
      testName: currentTestName,
      suiteName: currentSuiteName,
    });
  };

  // ── afterCommand: pop, compute duration, record (in memory only) ─────────────
  const origAfterCommand = config.afterCommand;
  config.afterCommand = async (commandName, args, result, error) => {
    if (origAfterCommand) {
      await (origAfterCommand as (
        n: string,
        a: unknown[],
        r: unknown,
        e: unknown,
      ) => Promise<void>)(commandName, args, result, error);
    }
    const pending = pendingStack.pop();
    if (!pending) return; // should not happen with maxInstances:1
    const endMs = Date.now();
    const durationMs = endMs - pending.startMs;
    const record: CommandRecord = {
      type: "command",
      seq: pending.seq,
      commandName: pending.commandName,
      startMs: pending.startMs,
      endMs,
      durationMs,
      success: !error,
      error: error instanceof Error ? error.message : undefined,
      testName: pending.testName,
      suiteName: pending.suiteName,
      platform: process.platform,
      provider: PROVIDER,
      pid: process.pid,
      runId: RUN_ID,
    };
    allRecords.push(record);
    if (durationMs >= SLOW_MS) {
      console.log(`[WDIO timing] ${commandName} ${durationMs}ms`);
    }
  };

  // ── after: finalize lifecycle timing and flush the report ────────────────────
  const origAfter = config.after;
  config.after = async (result, capabilities, specs) => {
    if (origAfter) {
      await (origAfter as (r: unknown, c: unknown, s: unknown) => Promise<void>)(
        result,
        capabilities,
        specs,
      );
    }
    afterHookEndMs = Date.now();
    flushTimingReport();
  };

  // ── afterSession: safety-net flush only if `after` never ran ─────────────────
  const origAfterSession = config.afterSession;
  config.afterSession = async (sessionConfig, capabilities, specs) => {
    if (origAfterSession) {
      await (origAfterSession as (c: unknown, cap: unknown, s: unknown) => Promise<void>)(
        sessionConfig,
        capabilities,
        specs,
      );
    }
    if (!flushed) {
      if (afterHookEndMs === null) afterHookEndMs = Date.now();
      flushTimingReport();
    }
  };
}
