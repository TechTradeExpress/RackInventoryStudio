// Unit tests for the pure logic in scripts/run-provider-benchmark.mjs.
// No real WDIO session, no real process spawn.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DEFAULT_BENCHMARK_SPECS,
  parseArgs,
  validateArgs,
  computeStats,
  percentFaster,
} from "./run-provider-benchmark.mjs";

function makeTempSpecsDir(specNames) {
  const base = mkdtempSync(join(tmpdir(), "ris-provider-benchmark-test-"));
  for (const name of specNames) {
    writeFileSync(join(base, `${name}.e2e.ts`), "");
  }
  return base;
}

describe("DEFAULT_BENCHMARK_SPECS", () => {
  it("is exactly the four specs the task requires", () => {
    assert.deepEqual(DEFAULT_BENCHMARK_SPECS, [
      "app-smoke",
      "core-inventory",
      "representative-latency",
      "searchable-select-regression",
    ]);
  });
});

describe("parseArgs", () => {
  it("defaults to the standard spec list, 5 measured runs, 1 warm-up run", () => {
    const opts = parseArgs(["node", "script.mjs"]);
    assert.deepEqual(opts.specs, DEFAULT_BENCHMARK_SPECS);
    assert.equal(opts.measuredRuns, 5);
    assert.equal(opts.warmupRuns, 1);
  });

  it("parses a custom comma-separated --specs list", () => {
    const opts = parseArgs(["node", "script.mjs", "--specs", "app-smoke,core-inventory"]);
    assert.deepEqual(opts.specs, ["app-smoke", "core-inventory"]);
  });

  it("parses --measured-runs and --warmup-runs", () => {
    const opts = parseArgs(["node", "script.mjs", "--measured-runs", "3", "--warmup-runs", "2"]);
    assert.equal(opts.measuredRuns, 3);
    assert.equal(opts.warmupRuns, 2);
  });

  it("parses --external-binary / --embedded-binary / --out", () => {
    const opts = parseArgs([
      "node",
      "script.mjs",
      "--external-binary",
      "/a",
      "--embedded-binary",
      "/b",
      "--out",
      "/c",
    ]);
    assert.equal(opts.externalBinary, "/a");
    assert.equal(opts.embeddedBinary, "/b");
    assert.equal(opts.out, "/c");
  });

  it("throws on unknown argument", () => {
    assert.throws(() => parseArgs(["node", "script.mjs", "--nope"]), /Unknown argument/);
  });
});

describe("validateArgs", () => {
  const specsDir = makeTempSpecsDir(["app-smoke", "core-inventory", "searchable-select-regression"]);

  it("accepts the default spec list (representative-latency is benchmark-only)", () => {
    const errors = validateArgs(
      { specs: DEFAULT_BENCHMARK_SPECS, measuredRuns: 5, warmupRuns: 1 },
      specsDir,
    );
    assert.deepEqual(errors, []);
  });

  it("rejects an empty spec list", () => {
    const errors = validateArgs({ specs: [], measuredRuns: 5, warmupRuns: 1 }, specsDir);
    assert.ok(errors.some((e) => e.includes("must not be empty")));
  });

  it("rejects an unknown spec name", () => {
    const errors = validateArgs({ specs: ["nonexistent"], measuredRuns: 5, warmupRuns: 1 }, specsDir);
    assert.ok(errors.some((e) => e.includes("unknown spec")));
  });

  it("rejects measuredRuns < 1", () => {
    const errors = validateArgs({ specs: ["app-smoke"], measuredRuns: 0, warmupRuns: 1 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--measured-runs")));
  });

  it("rejects a non-integer measuredRuns", () => {
    const errors = validateArgs({ specs: ["app-smoke"], measuredRuns: 2.5, warmupRuns: 1 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--measured-runs")));
  });

  it("rejects negative warmupRuns", () => {
    const errors = validateArgs({ specs: ["app-smoke"], measuredRuns: 5, warmupRuns: -1 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--warmup-runs")));
  });

  it("accepts warmupRuns of 0", () => {
    const errors = validateArgs({ specs: ["app-smoke"], measuredRuns: 5, warmupRuns: 0 }, specsDir);
    assert.deepEqual(errors, []);
  });
});

describe("computeStats", () => {
  it("returns all-null stats for an empty array", () => {
    const stats = computeStats([]);
    assert.equal(stats.n, 0);
    assert.equal(stats.min, null);
    assert.equal(stats.max, null);
    assert.equal(stats.mean, null);
    assert.equal(stats.median, null);
    assert.equal(stats.cv, null);
  });

  it("computes min/max/mean/median for a simple sample", () => {
    const stats = computeStats([10, 20, 30, 40, 50]);
    assert.equal(stats.n, 5);
    assert.equal(stats.min, 10);
    assert.equal(stats.max, 50);
    assert.equal(stats.mean, 30);
    assert.equal(stats.median, 30);
  });

  it("stdev is 0 for a single-element sample", () => {
    const stats = computeStats([42]);
    assert.equal(stats.stdev, 0);
    assert.equal(stats.cv, 0);
  });

  it("cv is null when mean is 0", () => {
    const stats = computeStats([0, 0, 0]);
    assert.equal(stats.mean, 0);
    assert.equal(stats.cv, null);
  });

  it("reports non-zero cv for a sample with variance", () => {
    const stats = computeStats([100, 200, 300, 400, 500]);
    assert.ok(stats.stdev > 0);
    assert.ok(stats.cv > 0);
  });

  it("low-variance samples have a lower cv than high-variance samples with the same mean", () => {
    const low = computeStats([98, 99, 100, 101, 102]);
    const high = computeStats([50, 80, 100, 120, 150]);
    assert.ok(low.cv < high.cv);
  });
});

describe("percentFaster", () => {
  it("returns a positive value when the candidate is faster than the baseline", () => {
    // baseline 200ms, candidate 150ms -> 25% faster
    assert.equal(percentFaster(200, 150), 25);
  });

  it("returns a negative value when the candidate is slower than the baseline", () => {
    // baseline 100ms, candidate 150ms -> -50%
    assert.equal(percentFaster(100, 150), -50);
  });

  it("returns 0 when baseline and candidate are equal", () => {
    assert.equal(percentFaster(100, 100), 0);
  });

  it("returns null when baseline is null", () => {
    assert.equal(percentFaster(null, 100), null);
  });

  it("returns null when candidate is null", () => {
    assert.equal(percentFaster(100, null), null);
  });

  it("returns null when baseline is 0 (division by zero guard)", () => {
    assert.equal(percentFaster(0, 100), null);
  });
});
