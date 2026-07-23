// Unit tests for the pure logic in scripts/run-wdio-performance-benchmark.mjs.
// Long-running WDIO/Tauri process execution is explicitly out of scope here —
// only argument parsing, validation, sequencing, and statistics are tested.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ALLOWED_PROVIDERS,
  REQUIRED_CORE_INVENTORY_STEPS,
  parseArgs,
  validateArgs,
  isValidRunId,
  generateRunId,
  validatePort,
  resolveWdioEntrypoint,
  readCargoLockVersion,
  pct,
  avg,
  medianOf,
  computeDelta,
  buildCompareSequence,
  validateSummary,
  poolCommandDurationsFromNdjsonText,
  poolStepDurationsByName,
  computeComparison,
  OUTCOMES,
  classifyOutcome,
  isEligibleForAggregate,
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
  it("parses provider/spec/repeat/binary", () => {
    const opts = parseArgs([
      "node",
      "script.mjs",
      "--provider",
      "external",
      "--spec",
      "app-smoke",
      "--repeat",
      "2",
      "--binary",
      "C:\\bin\\app.exe",
    ]);
    assert.equal(opts.provider, "external");
    assert.equal(opts.spec, "app-smoke");
    assert.equal(opts.repeat, 2);
    assert.equal(opts.binary, "C:\\bin\\app.exe");
    assert.equal(opts.compare, false);
    assert.equal(opts.continueOnFailure, false);
  });

  it("parses --compare and --continue-on-failure flags", () => {
    const opts = parseArgs([
      "node",
      "script.mjs",
      "--compare",
      "--spec",
      "core-inventory",
      "--repeat",
      "2",
      "--binary",
      "app.exe",
      "--continue-on-failure",
    ]);
    assert.equal(opts.compare, true);
    assert.equal(opts.continueOnFailure, true);
  });

  it("throws on an unknown argument", () => {
    assert.throws(() => parseArgs(["node", "script.mjs", "--bogus"]), /Unknown argument/);
  });

  it("does not accept a repeat value with trailing garbage", () => {
    const opts = parseArgs(["node", "script.mjs", "--provider", "external", "--spec", "app-smoke", "--repeat", "2abc"]);
    assert.ok(Number.isNaN(opts.repeat), "Number('2abc') must be NaN, not silently truncated to 2");
  });
});

// ── validateArgs ─────────────────────────────────────────────────────────────

describe("validateArgs", () => {
  it("accepts a valid single-provider config", () => {
    const errors = validateArgs({ provider: "external", spec: "app-smoke", repeat: 2, binary: null, compare: false });
    assert.deepEqual(errors, []);
  });

  it("rejects a provider outside the allowed set", () => {
    const errors = validateArgs({ provider: "chrome", spec: "app-smoke", repeat: 1, binary: null, compare: false });
    assert.ok(errors.some((e) => e.includes("--provider")));
  });

  it("rejects missing --spec", () => {
    const errors = validateArgs({ provider: "external", spec: null, repeat: 1, binary: null, compare: false });
    assert.ok(errors.some((e) => e.includes("--spec")));
  });

  it("rejects repeat = 0", () => {
    const errors = validateArgs({ provider: "external", spec: "app-smoke", repeat: 0, binary: null, compare: false });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("rejects a non-integer repeat", () => {
    const errors = validateArgs({ provider: "external", spec: "app-smoke", repeat: 1.5, binary: null, compare: false });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("rejects NaN repeat", () => {
    const errors = validateArgs({ provider: "external", spec: "app-smoke", repeat: NaN, binary: null, compare: false });
    assert.ok(errors.some((e) => e.includes("--repeat")));
  });

  it("requires --binary in compare mode", () => {
    const errors = validateArgs({ provider: null, spec: "app-smoke", repeat: 1, binary: null, compare: true });
    assert.ok(errors.some((e) => e.includes("--binary")));
  });

  it("rejects --provider combined with --compare", () => {
    const errors = validateArgs({ provider: "external", spec: "app-smoke", repeat: 1, binary: "app.exe", compare: true });
    assert.ok(errors.some((e) => e.includes("--compare")));
  });

  it("accepts a valid compare config", () => {
    const errors = validateArgs({ provider: null, spec: "app-smoke", repeat: 2, binary: "app.exe", compare: true });
    assert.deepEqual(errors, []);
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

// ── Port validation ──────────────────────────────────────────────────────────

describe("validatePort", () => {
  it("accepts a valid port", () => {
    assert.equal(validatePort("4445"), 4445);
  });

  it("rejects trailing garbage like '4445abc'", () => {
    assert.throws(() => validatePort("4445abc"));
  });

  it("rejects a port below 1024", () => {
    assert.throws(() => validatePort("80"));
  });

  it("rejects a port above 65535", () => {
    assert.throws(() => validatePort("70000"));
  });

  it("rejects a non-integer port", () => {
    assert.throws(() => validatePort("4445.5"));
  });

  it("rejects an empty string", () => {
    assert.throws(() => validatePort(""));
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

// ── readCargoLockVersion ─────────────────────────────────────────────────────

describe("readCargoLockVersion", () => {
  it("finds a package version in a CRLF Cargo.lock (Windows checkout line endings)", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-cargolock-test-"));
    try {
      const lockPath = join(root, "Cargo.lock");
      const content =
        '[[package]]\r\nname = "other-crate"\r\nversion = "9.9.9"\r\n\r\n' +
        '[[package]]\r\nname = "tauri-plugin-wdio-webdriver"\r\nversion = "1.2.0"\r\n' +
        'source = "registry+..."\r\n';
      writeFileSync(lockPath, content);
      assert.equal(readCargoLockVersion(lockPath, "tauri-plugin-wdio-webdriver"), "1.2.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds a package version in an LF Cargo.lock", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-cargolock-test-"));
    try {
      const lockPath = join(root, "Cargo.lock");
      writeFileSync(lockPath, '[[package]]\nname = "tauri-plugin-wdio-webdriver"\nversion = "1.2.0"\n');
      assert.equal(readCargoLockVersion(lockPath, "tauri-plugin-wdio-webdriver"), "1.2.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when the package is not present", () => {
    const root = mkdtempSync(join(tmpdir(), "ris-cargolock-test-"));
    try {
      const lockPath = join(root, "Cargo.lock");
      writeFileSync(lockPath, '[[package]]\r\nname = "unrelated-crate"\r\nversion = "1.0.0"\r\n');
      assert.equal(readCargoLockVersion(lockPath, "tauri-plugin-wdio-webdriver"), null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when Cargo.lock does not exist", () => {
    assert.equal(readCargoLockVersion(join(tmpdir(), "does-not-exist", "Cargo.lock"), "foo"), null);
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

  it("medianOf sorts unsorted input", () => {
    assert.equal(medianOf([5, 1, 3]), 3);
  });

  it("computeDelta: positive means embedded is faster", () => {
    const d = computeDelta(1000, 800);
    assert.equal(d.absolute, 200);
    assert.equal(d.percent, 20);
  });

  it("computeDelta: negative means embedded is slower", () => {
    const d = computeDelta(800, 1000);
    assert.equal(d.absolute, -200);
    assert.equal(d.percent, -25);
  });

  it("computeDelta: null when either input is null", () => {
    assert.deepEqual(computeDelta(null, 100), { absolute: null, percent: null });
    assert.deepEqual(computeDelta(100, null), { absolute: null, percent: null });
  });

  it("computeDelta: percent is null when external value is 0", () => {
    const d = computeDelta(0, 0);
    assert.equal(d.absolute, 0);
    assert.equal(d.percent, null);
  });
});

// ── buildCompareSequence ─────────────────────────────────────────────────────

describe("buildCompareSequence", () => {
  it("alternates external/embedded for repeat=2", () => {
    const seq = buildCompareSequence(2);
    assert.deepEqual(seq, [
      { provider: "external", runN: 1 },
      { provider: "embedded", runN: 1 },
      { provider: "external", runN: 2 },
      { provider: "embedded", runN: 2 },
    ]);
  });

  it("produces exactly 2*repeat entries", () => {
    assert.equal(buildCompareSequence(5).length, 10);
  });

  it("returns an empty sequence for repeat=0", () => {
    assert.deepEqual(buildCompareSequence(0), []);
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
    const summary = validSummaryFixture({ provider: "embedded" });
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

// ── Command-duration pooling ──────────────────────────────────────────────────

describe("poolCommandDurationsFromNdjsonText", () => {
  it("pools only command-type records across multiple NDJSON texts, sorted ascending", () => {
    const text1 = [
      JSON.stringify({ type: "command", durationMs: 300 }),
      JSON.stringify({ type: "step", durationMs: 9999 }),
      JSON.stringify({ type: "command", durationMs: 100 }),
    ].join("\n");
    const text2 = JSON.stringify({ type: "command", durationMs: 200 }) + "\n";

    const pooled = poolCommandDurationsFromNdjsonText([text1, text2]);
    assert.deepEqual(pooled, [100, 200, 300]);
  });

  it("skips unparsable lines without throwing", () => {
    const text = "not json\n" + JSON.stringify({ type: "command", durationMs: 50 });
    assert.deepEqual(poolCommandDurationsFromNdjsonText([text]), [50]);
  });

  it("returns an empty array for empty input", () => {
    assert.deepEqual(poolCommandDurationsFromNdjsonText([]), []);
  });
});

describe("poolStepDurationsByName", () => {
  it("only pools steps from passed runs", () => {
    const runs = [
      { passed: true, summary: { steps: [{ stepName: "a", durationMs: 10 }] } },
      { passed: false, summary: { steps: [{ stepName: "a", durationMs: 9999 }] } },
      { passed: true, summary: { steps: [{ stepName: "a", durationMs: 20 }] } },
    ];
    const map = poolStepDurationsByName(runs);
    assert.deepEqual(map.get("a"), [10, 20]);
  });
});

// ── computeComparison ─────────────────────────────────────────────────────────

function fakeRun({ provider, runN, passed, totalRunMs, sessionStartupMs, testExecutionMs, commandDurations, steps }) {
  const ndjsonRecords = (commandDurations ?? []).map((d) => JSON.stringify({ type: "command", durationMs: d }));
  return {
    provider,
    runN,
    passed,
    totalRunMs,
    ndjsonText: ndjsonRecords.length ? ndjsonRecords.join("\n") + "\n" : "",
    summary: {
      sessionStartupMs,
      testExecutionMs,
      p95: commandDurations?.length ? Math.max(...commandDurations) : null,
      steps: (steps ?? []).map((s) => ({ stepName: s.stepName, durationMs: s.durationMs, success: true, testName: "t", startMs: 0, endMs: 0 })),
    },
  };
}

describe("computeComparison", () => {
  it("computes medians, pooled p95, and improvement-direction deltas", () => {
    const runs = [
      fakeRun({ provider: "external", runN: 1, passed: true, totalRunMs: 1000, sessionStartupMs: 300, testExecutionMs: 600, commandDurations: [100, 200, 1200] }),
      fakeRun({ provider: "embedded", runN: 1, passed: true, totalRunMs: 700, sessionStartupMs: 150, testExecutionMs: 500, commandDurations: [50, 80, 90] }),
      fakeRun({ provider: "external", runN: 2, passed: true, totalRunMs: 1100, sessionStartupMs: 320, testExecutionMs: 650, commandDurations: [110, 220] }),
      fakeRun({ provider: "embedded", runN: 2, passed: true, totalRunMs: 750, sessionStartupMs: 160, testExecutionMs: 520, commandDurations: [60, 70] }),
    ];

    const comparison = computeComparison({ runs, spec: "app-smoke" });

    // medianOf uses nearest-rank percentiles (consistent with pct()), not interpolated averages.
    assert.equal(comparison.external.medianTotalRunMs, 1000);
    assert.equal(comparison.embedded.medianTotalRunMs, 700);
    assert.equal(comparison.deltas.medianTotalRunMs.absolute, 300);
    assert.ok(comparison.deltas.medianTotalRunMs.percent > 0, "positive percent means embedded is faster");

    assert.equal(comparison.external.pooledCommandCount, 5);
    assert.equal(comparison.embedded.pooledCommandCount, 5);
    assert.equal(comparison.external.commandsGe1s, 1);
    assert.equal(comparison.embedded.commandsGe1s, 0);
  });

  it("excludes failed runs from provider stats", () => {
    const runs = [
      fakeRun({ provider: "external", runN: 1, passed: true, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] }),
      fakeRun({ provider: "external", runN: 2, passed: false, totalRunMs: 99999, sessionStartupMs: 999, testExecutionMs: 999, commandDurations: [99999] }),
    ];
    const comparison = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(comparison.external.passedCount, 1);
    assert.equal(comparison.external.medianTotalRunMs, 1000);
  });

  it("includes a step comparison table for core-inventory, absent for other specs", () => {
    const runs = [
      fakeRun({
        provider: "external",
        runN: 1,
        passed: true,
        totalRunMs: 1000,
        sessionStartupMs: 100,
        testExecutionMs: 200,
        commandDurations: [10],
        steps: [{ stepName: "create-repository", durationMs: 500 }],
      }),
      fakeRun({
        provider: "embedded",
        runN: 1,
        passed: true,
        totalRunMs: 800,
        sessionStartupMs: 80,
        testExecutionMs: 150,
        commandDurations: [10],
        steps: [{ stepName: "create-repository", durationMs: 300 }],
      }),
    ];

    const withSteps = computeComparison({ runs, spec: "core-inventory" });
    assert.ok(withSteps.steps);
    assert.equal(withSteps.steps[0].stepName, "create-repository");
    assert.equal(withSteps.steps[0].externalMedianMs, 500);
    assert.equal(withSteps.steps[0].embeddedMedianMs, 300);

    const withoutSteps = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(withoutSteps.steps, null);
  });

  it("reports null medians (not zero) when a provider has no passed runs", () => {
    const runs = [fakeRun({ provider: "external", runN: 1, passed: false, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] })];
    const comparison = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(comparison.external.medianTotalRunMs, null);
    assert.equal(comparison.embedded.medianTotalRunMs, null);
    assert.equal(comparison.deltas.medianTotalRunMs.absolute, null);
  });

  it("excludes PASS_WITH_FORCED_CLEANUP runs from aggregation even though the test itself passed", () => {
    const cleanRun = fakeRun({ provider: "external", runN: 1, passed: true, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] });
    const forcedRun = fakeRun({ provider: "external", runN: 2, passed: false, totalRunMs: 99999, sessionStartupMs: 999, testExecutionMs: 999, commandDurations: [99999] });
    forcedRun.outcome = OUTCOMES.PASS_WITH_FORCED_CLEANUP;
    const runs = [cleanRun, forcedRun];
    const comparison = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(comparison.external.passedCount, 1, "forced-cleanup run must not count toward passedCount");
    assert.equal(comparison.external.medianTotalRunMs, 1000, "forced-cleanup run's duration must not pollute the median");
    assert.equal(comparison.external.outcomeCounts.PASS_WITH_FORCED_CLEANUP, 1);
  });

  it("reports status INSUFFICIENT_CLEAN_RUNS when a provider has fewer than 2 CLEAN_PASS runs", () => {
    const runs = [
      fakeRun({ provider: "external", runN: 1, passed: true, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] }),
      fakeRun({ provider: "embedded", runN: 1, passed: true, totalRunMs: 800, sessionStartupMs: 80, testExecutionMs: 150, commandDurations: [10] }),
    ];
    const comparison = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(comparison.status, "INSUFFICIENT_CLEAN_RUNS");
  });

  it("reports status OK when both providers have at least 2 CLEAN_PASS runs", () => {
    const runs = [
      fakeRun({ provider: "external", runN: 1, passed: true, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] }),
      fakeRun({ provider: "external", runN: 2, passed: true, totalRunMs: 1000, sessionStartupMs: 100, testExecutionMs: 200, commandDurations: [10] }),
      fakeRun({ provider: "embedded", runN: 1, passed: true, totalRunMs: 800, sessionStartupMs: 80, testExecutionMs: 150, commandDurations: [10] }),
      fakeRun({ provider: "embedded", runN: 2, passed: true, totalRunMs: 800, sessionStartupMs: 80, testExecutionMs: 150, commandDurations: [10] }),
    ];
    const comparison = computeComparison({ runs, spec: "app-smoke" });
    assert.equal(comparison.status, "OK");
  });
});

// ── ALLOWED_PROVIDERS sanity ───────────────────────────────────────────────────

describe("constants", () => {
  it("ALLOWED_PROVIDERS is exactly external/embedded", () => {
    assert.deepEqual(ALLOWED_PROVIDERS, ["external", "embedded"]);
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
