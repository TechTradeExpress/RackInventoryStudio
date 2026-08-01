// Unit tests for the pure logic in scripts/run-wdio-performance-benchmark.mjs.
// Long-running WDIO/Tauri process execution is explicitly out of scope here —
// only argument parsing, validation, sequencing, and statistics are tested.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  PROVIDER,
  BENCHMARK_ONLY_SPECS,
  REQUIRED_CORE_INVENTORY_STEPS,
  parseArgs,
  validateArgs,
  isValidRunId,
  isValidSpecName,
  resolveSpecPath,
  listAvailableSpecNames,
  isKnownSpecName,
  generateRunId,
  resolveWdioEntrypoint,
  pct,
  avg,
  validateSummary,
  computeSingleModeAggregate,
  buildBenchmarkOutputBasename,
  OUTCOMES,
  classifyOutcome,
  isEligibleForAggregate,
  isMeasurementEligible,
  summarizeRunOutcomes,
  resolvePortOwnership,
  evaluateCleanupEligibility,
  parsePortOwnerPids,
  parseProcessInfoJson,
  EXPECTED_DRIVER_PROCESS_NAMES,
  CLEANUP_CREATION_MARGIN_MS,
} from "./run-wdio-performance-benchmark.mjs";

// ── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses spec/repeat/binary", () => {
    const opts = parseArgs([
      "node",
      "script.mjs",
      "--spec",
      "app-smoke",
      "--repeat",
      "2",
      "--binary",
      "C:\\bin\\app.exe",
    ]);
    assert.equal(opts.spec, "app-smoke");
    assert.equal(opts.repeat, 2);
    assert.equal(opts.binary, "C:\\bin\\app.exe");
    assert.equal(opts.continueOnFailure, false);
  });

  it("parses --continue-on-failure flag", () => {
    const opts = parseArgs([
      "node",
      "script.mjs",
      "--spec",
      "core-inventory",
      "--repeat",
      "2",
      "--binary",
      "app.exe",
      "--continue-on-failure",
    ]);
    assert.equal(opts.continueOnFailure, true);
  });

  it("throws on an unknown argument", () => {
    assert.throws(() => parseArgs(["node", "script.mjs", "--bogus"]), /Unknown argument/);
  });

  it("does not accept a repeat value with trailing garbage", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "app-smoke", "--repeat", "2abc"]);
    assert.ok(Number.isNaN(opts.repeat), "Number('2abc') must be NaN, not silently truncated to 2");
  });
});

// ── validateArgs ─────────────────────────────────────────────────────────────

describe("validateArgs", () => {
  it("accepts a valid config", () => {
    const errors = validateArgs({ spec: "app-smoke", repeat: 2, binary: null });
    assert.deepEqual(errors, []);
  });

  it("rejects missing --spec", () => {
    const errors = validateArgs({ spec: null, repeat: 1, binary: null });
    assert.ok(errors.some((e) => e.includes("--spec")));
  });

  it("rejects repeat = 0", () => {
    const errors = validateArgs({ spec: "app-smoke", repeat: 0, binary: null });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("rejects a non-integer repeat", () => {
    const errors = validateArgs({ spec: "app-smoke", repeat: 1.5, binary: null });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("rejects NaN repeat", () => {
    const errors = validateArgs({ spec: "app-smoke", repeat: NaN, binary: null });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("rejects a --spec value with unsafe characters", () => {
    const errors = validateArgs({ spec: "../../etc/passwd", repeat: 1, binary: null });
    assert.ok(errors.some((e) => e.includes("--spec")));
  });

  it("accepts the representative-latency spec name", () => {
    const errors = validateArgs({ spec: "representative-latency", repeat: 2, binary: null });
    assert.deepEqual(errors, []);
  });
});

// ── Spec name validation and resolution ─────────────────────────────────────

describe("isValidSpecName", () => {
  it("accepts alphanumeric, hyphen, underscore", () => {
    assert.ok(isValidSpecName("representative-latency"));
    assert.ok(isValidSpecName("core-inventory"));
    assert.ok(isValidSpecName("app_smoke123"));
  });

  it("rejects path separators and traversal", () => {
    assert.ok(!isValidSpecName("../../etc/passwd"));
    assert.ok(!isValidSpecName("a/b"));
    assert.ok(!isValidSpecName("a\\b"));
  });

  it("rejects a non-string", () => {
    assert.ok(!isValidSpecName(undefined));
    assert.ok(!isValidSpecName(null));
  });
});

describe("resolveSpecPath", () => {
  it("maps representative-latency to the benchmarks/ directory", () => {
    const resolved = resolveSpecPath("/repo/apps/desktop", "representative-latency");
    assert.equal(
      resolved.replaceAll("\\", "/"),
      "/repo/apps/desktop/e2e-wdio/benchmarks/representative-latency.e2e.ts",
    );
  });

  it("maps every other spec name to the specs/ directory (default WDIO glob)", () => {
    for (const spec of ["app-smoke", "core-inventory", "csv-import"]) {
      const resolved = resolveSpecPath("/repo/apps/desktop", spec);
      assert.equal(resolved.replaceAll("\\", "/"), `/repo/apps/desktop/e2e-wdio/specs/${spec}.e2e.ts`);
    }
  });

  it("BENCHMARK_ONLY_SPECS contains exactly representative-latency", () => {
    assert.deepEqual(BENCHMARK_ONLY_SPECS, ["representative-latency"]);
  });
});

describe("listAvailableSpecNames / isKnownSpecName", () => {
  function makeSpecsDir(names) {
    const dir = mkdtempSync(join(tmpdir(), "ris-specs-test-"));
    for (const name of names) {
      writeFileSync(join(dir, `${name}.e2e.ts`), "// fake spec\n");
    }
    // A non-spec file must never be treated as a spec name.
    writeFileSync(join(dir, "README.md"), "not a spec\n");
    return dir;
  }

  it("lists real spec files without the .e2e.ts suffix, sorted", () => {
    const dir = makeSpecsDir(["core-inventory", "app-smoke"]);
    try {
      assert.deepEqual(listAvailableSpecNames(dir), ["app-smoke", "core-inventory"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a valid, existing real spec name", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("core-inventory", dir), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a benchmark-only spec name even though it has no file under specsDir", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("representative-latency", dir), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a spec name with no matching file", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("does-not-exist", dir), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects path traversal", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("../../etc/passwd", dir), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a forward-slash separator", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("specs/core-inventory", dir), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a backslash separator", () => {
    const dir = makeSpecsDir(["core-inventory"]);
    try {
      assert.equal(isKnownSpecName("specs\\core-inventory", dir), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Run ID ───────────────────────────────────────────────────────────────────

describe("run ID validation", () => {
  it("accepts alphanumeric, hyphen, underscore", () => {
    assert.ok(isValidRunId("abc123-DEF_456"));
  });

  it("rejects path separators and traversal", () => {
    assert.ok(!isValidRunId("../../etc/passwd"));
    assert.ok(!isValidRunId("a/b"));
    assert.ok(!isValidRunId("a\\b"));
  });

  it("rejects colons", () => {
    assert.ok(!isValidRunId("a:b"));
  });

  it("rejects a run ID over 100 characters", () => {
    assert.ok(!isValidRunId("a".repeat(101)));
  });

  it("accepts exactly 100 characters", () => {
    assert.ok(isValidRunId("a".repeat(100)));
  });

  it("rejects an empty string", () => {
    assert.ok(!isValidRunId(""));
  });

  it("generateRunId always produces a valid ID", () => {
    for (let i = 0; i < 20; i++) {
      assert.ok(isValidRunId(generateRunId()));
    }
  });
});

// ── resolveWdioEntrypoint ────────────────────────────────────────────────────

describe("resolveWdioEntrypoint", () => {
  it("resolves the entrypoint from @wdio/cli's package.json bin field", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-wdio-entry-test-"));
    try {
      const cliDir = join(root, "node_modules", "@wdio", "cli");
      mkdirSync(cliDir, { recursive: true });
      writeFileSync(join(cliDir, "package.json"), JSON.stringify({ bin: { wdio: "./bin/wdio.js" } }));
      mkdirSync(join(cliDir, "bin"), { recursive: true });
      writeFileSync(join(cliDir, "bin", "wdio.js"), "// fake entrypoint\n");

      const resolved = resolveWdioEntrypoint(root);
      assert.equal(resolved, join(cliDir, "bin", "wdio.js"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws when @wdio/cli is not installed", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-wdio-entry-test-"));
    try {
      assert.throws(() => resolveWdioEntrypoint(root), /not found/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("throws when the resolved entrypoint file does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-wdio-entry-test-"));
    try {
      const cliDir = join(root, "node_modules", "@wdio", "cli");
      mkdirSync(cliDir, { recursive: true });
      writeFileSync(join(cliDir, "package.json"), JSON.stringify({ bin: { wdio: "./bin/missing.js" } }));
      assert.throws(() => resolveWdioEntrypoint(root), /does not exist/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── Statistics helpers ───────────────────────────────────────────────────────

describe("statistics helpers", () => {
  it("pct returns 0 for an empty array", () => {
    assert.equal(pct([], 95), 0);
  });

  it("pct computes nearest-rank percentile", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(pct(sorted, 50), 5);
    assert.equal(pct(sorted, 95), 10);
  });

  it("avg rounds to nearest integer", () => {
    assert.equal(avg([1, 2, 4]), 2);
  });
});

// ── validateSummary ──────────────────────────────────────────────────────────

function validSummaryFixture(overrides = {}) {
  return {
    runId: "run-1",
    provider: "external",
    platform: "win32",
    commandCount: 3,
    min: 1,
    mean: 2,
    median: 2,
    p90: 3,
    p95: 3,
    p99: 3,
    max: 3,
    sessionStartupMs: 100,
    testExecutionMs: 200,
    sessionTeardownMs: 50,
    workerObservedMs: 350,
    byStepName: REQUIRED_CORE_INVENTORY_STEPS.map((stepName) => ({ stepName })),
    steps: REQUIRED_CORE_INVENTORY_STEPS.map((stepName) => ({ stepName, success: true, durationMs: 10 })),
    ...overrides,
  };
}

describe("validateSummary", () => {
  it("passes for a well-formed core-inventory summary matching its NDJSON", () => {
    const summary = validSummaryFixture();
    const errors = validateSummary({
      summary,
      runId: "run-1",
      provider: "external",
      spec: "core-inventory",
      ndjsonCommandCount: 3,
      expectedPlatform: "win32",
    });
    assert.deepEqual(errors, []);
  });

  it("passes for app-smoke without requiring core-inventory steps", () => {
    const summary = validSummaryFixture({ byStepName: [], steps: [] });
    const errors = validateSummary({
      summary,
      runId: "run-1",
      provider: "external",
      spec: "app-smoke",
      ndjsonCommandCount: 3,
      expectedPlatform: "win32",
    });
    assert.deepEqual(errors, []);
  });

  it("fails when summary is null (report missing)", () => {
    const errors = validateSummary({
      summary: null,
      runId: "run-1",
      provider: "external",
      spec: "app-smoke",
      ndjsonCommandCount: 0,
      expectedPlatform: "win32",
    });
    assert.ok(errors.length > 0);
  });

  it("fails when runId does not match", () => {
    const summary = validSummaryFixture({ runId: "other-run" });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("runId")));
  });

  it("fails when provider does not match", () => {
    const summary = validSummaryFixture({ provider: "chrome" });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("provider")));
  });

  it("fails when platform does not match", () => {
    const summary = validSummaryFixture({ platform: "linux" });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("platform")));
  });

  it("fails when commandCount is 0", () => {
    const summary = validSummaryFixture({ commandCount: 0 });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("commandCount")));
  });

  it("fails when a numeric time field is negative", () => {
    const summary = validSummaryFixture({ median: -5 });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("median")));
  });

  it("allows lifecycle fields to be null but not negative", () => {
    const okSummary = validSummaryFixture({ sessionStartupMs: null });
    assert.deepEqual(
      validateSummary({ summary: okSummary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" }),
      [],
    );
    const badSummary = validSummaryFixture({ sessionStartupMs: -1 });
    const errors = validateSummary({ summary: badSummary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("sessionStartupMs")));
  });

  it("fails when NDJSON command count does not match summary.commandCount", () => {
    const summary = validSummaryFixture({ commandCount: 3 });
    const errors = validateSummary({
      summary,
      runId: "run-1",
      provider: "external",
      spec: "app-smoke",
      ndjsonCommandCount: 2,
      expectedPlatform: "win32",
    });
    assert.ok(errors.some((e) => e.includes("does not match")));
  });

  it("fails when a required core-inventory step is missing", () => {
    const summary = validSummaryFixture({
      byStepName: REQUIRED_CORE_INVENTORY_STEPS.filter((s) => s !== "submit-placement").map((stepName) => ({ stepName })),
    });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "core-inventory", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("submit-placement")));
  });

  it("fails when any step is marked unsuccessful", () => {
    const summary = validSummaryFixture({
      steps: [{ stepName: "create-repository", success: false, durationMs: 5 }],
    });
    const errors = validateSummary({ summary, runId: "run-1", provider: "external", spec: "app-smoke", expectedPlatform: "win32" });
    assert.ok(errors.some((e) => e.includes("failure")));
  });
});

// ── buildBenchmarkOutputBasename ─────────────────────────────────────────────

describe("buildBenchmarkOutputBasename", () => {
  it("builds an external-spec basename for representative-latency", () => {
    assert.equal(buildBenchmarkOutputBasename("representative-latency"), "external-representative-latency");
  });

  it("builds an external-spec basename for any other spec", () => {
    assert.equal(buildBenchmarkOutputBasename("app-smoke"), "external-app-smoke");
  });
});

// ── isMeasurementEligible ────────────────────────────────────────────────────

describe("isMeasurementEligible", () => {
  const cleanBase = {
    testPassed: true,
    reportValid: true,
    outcome: OUTCOMES.CLEAN_PASS,
    cleanupRequired: false,
    cleanupSafe: true,
    cleanupSucceeded: null,
  };

  it("CLEAN_PASS with no cleanup required -> eligible", () => {
    assert.equal(isMeasurementEligible(cleanBase), true);
  });

  it("PASS_WITH_FORCED_CLEANUP with safe + succeeded cleanup -> eligible (the expected Windows external-provider case)", () => {
    assert.equal(
      isMeasurementEligible({
        testPassed: true,
        reportValid: true,
        outcome: OUTCOMES.PASS_WITH_FORCED_CLEANUP,
        cleanupRequired: true,
        cleanupSafe: true,
        cleanupSucceeded: true,
      }),
      true,
    );
  });

  it("TEST_FAILED is never eligible even if cleanup looks fine", () => {
    assert.equal(
      isMeasurementEligible({
        testPassed: false,
        reportValid: true,
        outcome: OUTCOMES.TEST_FAILED,
        cleanupRequired: false,
        cleanupSafe: true,
        cleanupSucceeded: null,
      }),
      false,
    );
  });

  it("REPORT_INVALID is never eligible", () => {
    assert.equal(
      isMeasurementEligible({ ...cleanBase, reportValid: false, outcome: OUTCOMES.REPORT_INVALID }),
      false,
    );
  });

  it("CLEANUP_UNSAFE is never eligible", () => {
    assert.equal(
      isMeasurementEligible({
        testPassed: true,
        reportValid: true,
        outcome: OUTCOMES.CLEANUP_UNSAFE,
        cleanupRequired: true,
        cleanupSafe: false,
        cleanupSucceeded: false,
      }),
      false,
    );
  });

  it("CLEANUP_FAILED is never eligible", () => {
    assert.equal(
      isMeasurementEligible({
        testPassed: true,
        reportValid: true,
        outcome: OUTCOMES.CLEANUP_FAILED,
        cleanupRequired: true,
        cleanupSafe: true,
        cleanupSucceeded: false,
      }),
      false,
    );
  });

  it("TIMED_OUT and INTERRUPTED are never eligible", () => {
    assert.equal(isMeasurementEligible({ ...cleanBase, outcome: OUTCOMES.TIMED_OUT }), false);
    assert.equal(isMeasurementEligible({ ...cleanBase, outcome: OUTCOMES.INTERRUPTED }), false);
  });

  it("is not equivalent to a CI pass/fail gate — PASS_WITH_FORCED_CLEANUP is measurementEligible but passed stays false", () => {
    const forced = {
      testPassed: true,
      reportValid: true,
      outcome: OUTCOMES.PASS_WITH_FORCED_CLEANUP,
      cleanupRequired: true,
      cleanupSafe: true,
      cleanupSucceeded: true,
    };
    assert.equal(isMeasurementEligible(forced), true);
    assert.notEqual(forced.outcome, OUTCOMES.CLEAN_PASS, "passed === true is reserved for CLEAN_PASS only");
  });
});

// ── computeSingleModeAggregate ───────────────────────────────────────────────

function fakeSingleRun({ runN, outcome, measurementEligible, totalRunMs, median, p95 }) {
  return {
    runN,
    outcome,
    measurementEligible,
    totalRunMs,
    summary: { median, p95 },
  };
}

describe("computeSingleModeAggregate", () => {
  it("aggregates two CLEAN_PASS runs (the ordinary Linux case)", () => {
    const runResults = [
      fakeSingleRun({ runN: 1, outcome: OUTCOMES.CLEAN_PASS, measurementEligible: true, totalRunMs: 1000, median: 10, p95: 100 }),
      fakeSingleRun({ runN: 2, outcome: OUTCOMES.CLEAN_PASS, measurementEligible: true, totalRunMs: 1100, median: 12, p95: 110 }),
    ];
    const aggregate = computeSingleModeAggregate({
      spec: "representative-latency",
      repeat: 2,
      runResults,
    });
    assert.equal(aggregate.status, "OK");
    assert.equal(aggregate.cleanPassRuns, 2);
    assert.equal(aggregate.measurementEligibleRuns, 2);
    assert.equal(aggregate.totalRunMs.median, 1000);
  });

  it("aggregates two PASS_WITH_FORCED_CLEANUP runs on Windows — measurementEligible, not CLEAN_PASS", () => {
    const runResults = [
      fakeSingleRun({
        runN: 1,
        outcome: OUTCOMES.PASS_WITH_FORCED_CLEANUP,
        measurementEligible: true,
        totalRunMs: 5000,
        median: 9,
        p95: 12000,
      }),
      fakeSingleRun({
        runN: 2,
        outcome: OUTCOMES.PASS_WITH_FORCED_CLEANUP,
        measurementEligible: true,
        totalRunMs: 5200,
        median: 9,
        p95: 12100,
      }),
    ];
    const aggregate = computeSingleModeAggregate({
      spec: "representative-latency",
      repeat: 2,
      runResults,
    });
    // The whole point of measurementEligible: these two Windows external
    // runs are usable for the benchmark aggregate even though neither is
    // CLEAN_PASS (see docs/E2E_WDIO_WINDOWS_PERFORMANCE.md).
    assert.equal(aggregate.cleanPassRuns, 0);
    assert.equal(aggregate.measurementEligibleRuns, 2);
    assert.equal(aggregate.status, "OK");
    assert.equal(aggregate.totalRunMs.median, 5000);
    assert.equal(aggregate.forcedCleanupRuns, 2);
  });

  it("reports INSUFFICIENT_MEASUREMENT_RUNS when fewer than 2 runs are measurementEligible", () => {
    const runResults = [
      fakeSingleRun({ runN: 1, outcome: OUTCOMES.CLEAN_PASS, measurementEligible: true, totalRunMs: 1000, median: 10, p95: 100 }),
      fakeSingleRun({ runN: 2, outcome: OUTCOMES.TEST_FAILED, measurementEligible: false, totalRunMs: 999999, median: 999, p95: 999 }),
    ];
    const aggregate = computeSingleModeAggregate({
      spec: "representative-latency",
      repeat: 2,
      runResults,
    });
    assert.equal(aggregate.measurementEligibleRuns, 1);
    assert.equal(aggregate.status, "INSUFFICIENT_MEASUREMENT_RUNS");
    // The failed run's absurd duration must not pollute the median.
    assert.equal(aggregate.totalRunMs.median, 1000);
  });
});

// ── constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("PROVIDER is external", () => {
    assert.equal(PROVIDER, "external");
  });

  it("REQUIRED_CORE_INVENTORY_STEPS has the 9 documented steps", () => {
    assert.equal(REQUIRED_CORE_INVENTORY_STEPS.length, 9);
  });
});

// ── classifyOutcome ──────────────────────────────────────────────────────────

describe("classifyOutcome", () => {
  const base = {
    interrupted: false,
    timedOut: false,
    testPassed: true,
    reportValid: true,
    cleanupRequired: false,
    cleanupSafe: true,
    cleanupSucceeded: null,
  };

  it("exit 0 + valid report + natural cleanup -> CLEAN_PASS", () => {
    assert.equal(classifyOutcome({ ...base }), OUTCOMES.CLEAN_PASS);
  });

  it("exit 0 + valid report + forced cleanup success -> PASS_WITH_FORCED_CLEANUP", () => {
    assert.equal(
      classifyOutcome({ ...base, cleanupRequired: true, cleanupSafe: true, cleanupSucceeded: true }),
      OUTCOMES.PASS_WITH_FORCED_CLEANUP,
    );
  });

  it("exit 0 + invalid report -> REPORT_INVALID", () => {
    assert.equal(classifyOutcome({ ...base, reportValid: false }), OUTCOMES.REPORT_INVALID);
  });

  it("non-zero exit -> TEST_FAILED", () => {
    assert.equal(classifyOutcome({ ...base, testPassed: false }), OUTCOMES.TEST_FAILED);
  });

  it("timeout -> TIMED_OUT regardless of report/cleanup state", () => {
    assert.equal(
      classifyOutcome({ ...base, timedOut: true, testPassed: false, reportValid: false }),
      OUTCOMES.TIMED_OUT,
    );
  });

  it("interrupt -> INTERRUPTED, takes precedence over everything else", () => {
    assert.equal(
      classifyOutcome({ ...base, interrupted: true, timedOut: true, testPassed: false }),
      OUTCOMES.INTERRUPTED,
    );
  });

  it("port occupied by an ambiguous/unsafe process -> CLEANUP_UNSAFE", () => {
    assert.equal(
      classifyOutcome({ ...base, cleanupRequired: true, cleanupSafe: false, cleanupSucceeded: false }),
      OUTCOMES.CLEANUP_UNSAFE,
    );
  });

  it("forced cleanup did not free the port -> CLEANUP_FAILED", () => {
    assert.equal(
      classifyOutcome({ ...base, cleanupRequired: true, cleanupSafe: true, cleanupSucceeded: false }),
      OUTCOMES.CLEANUP_FAILED,
    );
  });

  it("test failure takes precedence over cleanup state", () => {
    assert.equal(
      classifyOutcome({ ...base, testPassed: false, cleanupRequired: true, cleanupSafe: false }),
      OUTCOMES.TEST_FAILED,
    );
  });
});

describe("isEligibleForAggregate", () => {
  it("is true only for CLEAN_PASS", () => {
    assert.equal(isEligibleForAggregate(OUTCOMES.CLEAN_PASS), true);
    for (const outcome of Object.values(OUTCOMES)) {
      if (outcome === OUTCOMES.CLEAN_PASS) continue;
      assert.equal(isEligibleForAggregate(outcome), false, `${outcome} must not be aggregate-eligible`);
    }
  });
});

describe("summarizeRunOutcomes", () => {
  it("counts each outcome bucket independently", () => {
    const runs = [
      { outcome: OUTCOMES.CLEAN_PASS },
      { outcome: OUTCOMES.CLEAN_PASS },
      { outcome: OUTCOMES.PASS_WITH_FORCED_CLEANUP },
      { outcome: OUTCOMES.TEST_FAILED },
      { outcome: OUTCOMES.CLEANUP_UNSAFE },
    ];
    const counts = summarizeRunOutcomes(runs);
    assert.equal(counts.CLEAN_PASS, 2);
    assert.equal(counts.PASS_WITH_FORCED_CLEANUP, 1);
    assert.equal(counts.TEST_FAILED, 1);
    assert.equal(counts.CLEANUP_UNSAFE, 1);
    assert.equal(counts.CLEANUP_FAILED, 0);
  });
});

// ── resolvePortOwnership ─────────────────────────────────────────────────────

describe("resolvePortOwnership", () => {
  it("reports not listening for an empty PID list", () => {
    const r = resolvePortOwnership([]);
    assert.equal(r.listening, false);
    assert.equal(r.ambiguous, false);
    assert.equal(r.owningPid, null);
  });

  it("resolves a single owning PID", () => {
    const r = resolvePortOwnership([1234]);
    assert.equal(r.listening, true);
    assert.equal(r.ambiguous, false);
    assert.equal(r.owningPid, 1234);
  });

  it("de-duplicates a repeated PID into a single owner", () => {
    const r = resolvePortOwnership([1234, 1234]);
    assert.equal(r.ambiguous, false);
    assert.equal(r.owningPid, 1234);
  });

  it("flags multiple distinct PIDs as ambiguous — never guesses", () => {
    const r = resolvePortOwnership([1234, 5678]);
    assert.equal(r.listening, true);
    assert.equal(r.ambiguous, true);
    assert.equal(r.owningPid, null);
    assert.deepEqual(r.candidatePids.sort(), [1234, 5678]);
  });
});

// ── evaluateCleanupEligibility (process targeting) ──────────────────────────

describe("evaluateCleanupEligibility", () => {
  const runStartMs = 1_000_000;

  it("PID owns the port and was created during the run -> eligible", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "tauri-driver.exe",
      creationDateMs: runStartMs + 1000,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, true);
    assert.equal(d.unsafe, false);
  });

  it("PID existed before the run -> ineligible, not unsafe", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "tauri-driver.exe",
      creationDateMs: runStartMs + 1000,
      preRunPids: new Set([999]),
      runStartMs,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, false);
  });

  it("expected name but not the confirmed port owner -> ineligible", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "tauri-driver.exe",
      creationDateMs: runStartMs + 1000,
      preRunPids: new Set(),
      runStartMs,
      portOwnerMatch: false,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, false);
  });

  it("port owner has an unexpected process name -> unsafe", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "notepad.exe",
      creationDateMs: runStartMs + 1000,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, true);
  });

  it("missing CreationDate -> unsafe", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "tauri-driver.exe",
      creationDateMs: null,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, true);
  });

  it("CreationDate predating the run window (beyond margin) -> ineligible, not unsafe", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "tauri-driver.exe",
      creationDateMs: runStartMs - CLEANUP_CREATION_MARGIN_MS - 1,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, false);
  });

  it("the 5-second creation margin alone is not sufficient — wrong name still unsafe", () => {
    // CreationDate is within the margin window, PID is new, but the name is wrong:
    // the margin passing must not by itself qualify the process.
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "chrome.exe",
      creationDateMs: runStartMs - CLEANUP_CREATION_MARGIN_MS + 500,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, false);
    assert.equal(d.unsafe, true);
  });

  it("defaults expectedProcessNames to the documented driver binaries", () => {
    assert.deepEqual(EXPECTED_DRIVER_PROCESS_NAMES, ["tauri-driver.exe", "msedgedriver.exe"]);
  });

  it("accepts msedgedriver.exe as well as tauri-driver.exe", () => {
    const d = evaluateCleanupEligibility({
      pid: 999,
      processName: "msedgedriver.exe",
      creationDateMs: runStartMs + 100,
      preRunPids: new Set(),
      runStartMs,
    });
    assert.equal(d.eligible, true);
  });
});

// ── PowerShell output parsers ────────────────────────────────────────────────

describe("parsePortOwnerPids", () => {
  it("parses an empty result as no owners", () => {
    assert.deepEqual(parsePortOwnerPids(""), []);
    assert.deepEqual(parsePortOwnerPids(null), []);
    assert.deepEqual(parsePortOwnerPids(undefined), []);
  });

  it("parses a bare single PID (PowerShell ConvertTo-Json unwraps single-element arrays)", () => {
    assert.deepEqual(parsePortOwnerPids("1234"), [1234]);
  });

  it("parses a JSON array of PIDs", () => {
    assert.deepEqual(parsePortOwnerPids("[1234,5678]"), [1234, 5678]);
  });

  it("falls back to whitespace-separated integers on non-JSON output", () => {
    assert.deepEqual(parsePortOwnerPids("1234\n5678\n"), [1234, 5678]);
  });
});

describe("parseProcessInfoJson", () => {
  it("returns null for empty output (process not found)", () => {
    assert.equal(parseProcessInfoJson(""), null);
    assert.equal(parseProcessInfoJson(null), null);
  });

  it("parses a well-formed single process record", () => {
    const raw = JSON.stringify({
      ProcessId: 4321,
      Name: "tauri-driver.exe",
      ParentProcessId: 100,
      CreationDateIso: "2026-07-23T10:00:00.000Z",
    });
    const info = parseProcessInfoJson(raw);
    assert.equal(info.pid, 4321);
    assert.equal(info.name, "tauri-driver.exe");
    assert.equal(info.parentProcessId, 100);
    assert.equal(info.creationDateMs, Date.parse("2026-07-23T10:00:00.000Z"));
  });

  it("handles a null CreationDateIso as creationDateMs: null", () => {
    const raw = JSON.stringify({ ProcessId: 1, Name: "x.exe", ParentProcessId: 1, CreationDateIso: null });
    assert.equal(parseProcessInfoJson(raw).creationDateMs, null);
  });

  it("returns null for malformed JSON", () => {
    assert.equal(parseProcessInfoJson("not json"), null);
  });

  it("unwraps a single-element array (PowerShell ConvertTo-Json behaviour)", () => {
    const raw = JSON.stringify([{ ProcessId: 7, Name: "x.exe", ParentProcessId: 1, CreationDateIso: null }]);
    assert.equal(parseProcessInfoJson(raw).pid, 7);
  });
});
