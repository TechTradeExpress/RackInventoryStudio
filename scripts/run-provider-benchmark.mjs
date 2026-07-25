#!/usr/bin/env node
/**
 * External vs. embedded WDIO provider benchmark.
 *
 * Alternates external/embedded runs per spec (one discarded warm-up run per
 * provider, then N measured runs each, interleaved external/embedded to
 * control for system-load drift) and aggregates the metrics needed to
 * decide whether the embedded provider should become the default:
 * per-run total time, command count, median/p95 command latency, count of
 * commands >=5s, test outcome, cleanup state, and port state before/after —
 * plus cross-run median/mean/p95/min/max/CV per spec+provider and a
 * combined-across-specs comparison.
 *
 * Each single run spawns `node scripts/run-wdio-performance-benchmark.mjs
 * --provider <p> --spec <s> --repeat 1 --binary <bin>` as its own fresh
 * process — the same primitive the canonical external/embedded runners
 * delegate to — so PID-safe cleanup, the summary.json/commands.ndjson
 * timing report, and outcome classification are identical to a normal
 * `pnpm test:e2e:wdio[:embedded]` run, and each run's own module-level
 * state (cleanup context, SIGINT handling) never leaks into the next run
 * the way it would if runs were driven in-process in a shared Node
 * process. This script does not build binaries: build time is
 * intentionally excluded from the measurement, and both binaries must
 * already exist (build them first via `pnpm build:e2e:wdio-plugin` /
 * `pnpm build:e2e:wdio-embedded`).
 *
 * Usage:
 *   node scripts/run-provider-benchmark.mjs
 *   node scripts/run-provider-benchmark.mjs --specs app-smoke,core-inventory --measured-runs 5
 *   node scripts/run-provider-benchmark.mjs --measured-runs 1   (quick smoke test of this script)
 *
 * Options:
 *   --specs <a,b,c>        comma-separated spec names (default: the 4 benchmarked specs)
 *   --measured-runs <n>    measured runs per spec per provider, >=1 (default: 5)
 *   --warmup-runs <n>      discarded warm-up runs per spec per provider (default: 1)
 *   --external-binary <p>  override the external (wdio-plugin) binary path
 *   --embedded-binary <p>  override the embedded (wdio-embedded) binary path
 *   --out <dir>            output directory (default: os.tmpdir()/ris-provider-benchmark/<date>)
 *
 * Uses only Node.js built-in modules plus the existing benchmark/runner
 * scripts — no extra dependencies.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isKnownSpecName,
  listAvailableSpecNames,
  BENCHMARK_ONLY_SPECS,
  pct,
  avg,
  medianOf,
} from "./run-wdio-performance-benchmark.mjs";
import {
  resolveTargetDir as resolvePluginTargetDir,
  resolveBinaryPath as resolvePluginBinaryPathFrom,
} from "./build-wdio-plugin-binary.mjs";
import {
  resolveTargetDir as resolveEmbeddedTargetDir,
  resolveBinaryPath as resolveEmbeddedBinaryPathFrom,
} from "./build-wdio-embedded-binary.mjs";
import { inspectPortProbeResult } from "./run-wdio-e2e.mjs";

export const DEFAULT_BENCHMARK_SPECS = [
  "app-smoke",
  "core-inventory",
  "representative-latency",
  "searchable-select-regression",
];

const PROVIDER_PORTS = { external: 4444, embedded: 4445 };
const BOTH_PORTS = [4444, 4445];

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

export function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    specs: [...DEFAULT_BENCHMARK_SPECS],
    measuredRuns: 5,
    warmupRuns: 1,
    externalBinary: null,
    embeddedBinary: null,
    out: null,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--specs":
        result.specs = (args[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--measured-runs":
        result.measuredRuns = Number(args[++i]);
        break;
      case "--warmup-runs":
        result.warmupRuns = Number(args[++i]);
        break;
      case "--external-binary":
        result.externalBinary = args[++i] ?? null;
        break;
      case "--embedded-binary":
        result.embeddedBinary = args[++i] ?? null;
        break;
      case "--out":
        result.out = args[++i] ?? null;
        break;
      default:
        throw new Error(`[provider-benchmark] Unknown argument: ${args[i]}`);
    }
  }
  return result;
}

export function validateArgs(opts, specsDir) {
  const errors = [];
  if (!opts.specs || opts.specs.length === 0) {
    errors.push("--specs must not be empty");
  } else {
    for (const spec of opts.specs) {
      if (!isKnownSpecName(spec, specsDir)) {
        const known = [...BENCHMARK_ONLY_SPECS, ...listAvailableSpecNames(specsDir)];
        errors.push(`--specs contains unknown spec "${spec}". Known specs: ${known.join(", ")}`);
      }
    }
  }
  if (!Number.isInteger(opts.measuredRuns) || opts.measuredRuns < 1) {
    errors.push("--measured-runs must be a positive integer");
  }
  if (!Number.isInteger(opts.warmupRuns) || opts.warmupRuns < 0) {
    errors.push("--warmup-runs must be a non-negative integer");
  }
  return errors;
}

/**
 * Cross-run statistics (median/mean/p95/min/max/CV) over an array of
 * numeric samples. CV (coefficient of variation) is stdev/mean, using the
 * sample standard deviation (n-1) — meaningful even for small n like 5.
 * Returns null fields when values is empty rather than throwing or
 * silently reporting zero.
 */
export function computeStats(values) {
  if (!values || values.length === 0) {
    return { n: 0, min: null, max: null, mean: null, median: null, p95: null, stdev: null, cv: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = avg(values);
  const stdev =
    values.length > 1
      ? Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1))
      : 0;
  return {
    n: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: medianOf(values),
    p95: pct(sorted, 95),
    stdev: Math.round(stdev * 100) / 100,
    cv: mean !== 0 ? Math.round((stdev / mean) * 10000) / 10000 : null,
  };
}

/**
 * Percentage difference between two medians, defined so a positive value
 * means "b is faster than a" (a - b) / a * 100 — mirrors the sign
 * convention of computeDelta in run-wdio-performance-benchmark.mjs.
 */
export function percentFaster(baselineMs, candidateMs) {
  if (baselineMs === null || candidateMs === null || baselineMs === 0) return null;
  return Math.round(((baselineMs - candidateMs) / baselineMs) * 10000) / 100;
}

// ── Port contract (reuses the same ss-based probe as the canonical runners) ─

function checkPorts(ports = BOTH_PORTS) {
  if (process.platform !== "linux") {
    return { probeSucceeded: true, occupiedPorts: [] };
  }
  const spawnResult = spawnSync("ss", ["-ltnp"], { encoding: "utf8" });
  return inspectPortProbeResult(spawnResult, ports);
}

// ── Single-run execution (spawns run-wdio-performance-benchmark.mjs fresh) ──

function parseAggregateJsonPath(stdout) {
  const m = stdout.match(/\[benchmark\] Aggregate JSON: (.+)/);
  return m ? m[1].trim() : null;
}

/**
 * Runs one single measured/warm-up run by spawning
 * `node scripts/run-wdio-performance-benchmark.mjs --provider ... --repeat 1`
 * as its own fresh process (wrapped with xvfb-run -a on Linux, matching the
 * canonical runners), then reads back the JSON report it wrote to recover
 * the full per-run result (outcome, totalRunMs, cleanup fields, summary).
 *
 * stdout/stderr are redirected to a log file rather than captured via
 * spawnSync's in-memory pipe buffer: WDIO's verbose command-level logging
 * (full executeScript payloads per command) can exceed spawnSync's default
 * buffer on long specs, causing an ENOBUFS spawn failure. Writing to a file
 * has no such limit; the file is read back afterward only to locate the
 * "[benchmark] Aggregate JSON: <path>" line.
 */
function runOneViaSubprocess({ provider, spec, binary, scriptDir, repoRoot, logDir }) {
  const benchmarkScript = join(scriptDir, "run-wdio-performance-benchmark.mjs");
  const benchArgs = [benchmarkScript, "--provider", provider, "--spec", spec, "--repeat", "1", "--binary", binary];
  const { executable, args } =
    process.platform === "linux"
      ? { executable: "xvfb-run", args: ["-a", process.execPath, ...benchArgs] }
      : { executable: process.execPath, args: benchArgs };

  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${provider}-${spec}-${Date.now()}.log`);
  const logFd = openSync(logPath, "w");
  let spawnResult;
  try {
    spawnResult = spawnSync(executable, args, { cwd: repoRoot, stdio: ["ignore", logFd, logFd] });
  } finally {
    closeSync(logFd);
  }

  if (spawnResult.error) {
    throw new Error(`Failed to spawn benchmark process: ${spawnResult.error.message}`, {
      cause: spawnResult.error,
    });
  }

  const output = readFileSync(logPath, "utf8");
  const jsonPath = parseAggregateJsonPath(output);
  if (!jsonPath || !existsSync(jsonPath)) {
    console.error(output.split("\n").slice(-60).join("\n"));
    throw new Error(
      `[provider-benchmark] Could not locate the benchmark JSON report for provider=${provider} spec=${spec} ` +
        `(parsed path: ${jsonPath ?? "none"}). Child exit code: ${spawnResult.status}. Full log: ${logPath}`,
    );
  }

  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  const run = report.runs?.[0];
  if (!run) {
    throw new Error(`[provider-benchmark] Benchmark report at ${jsonPath} has no run data.`);
  }
  return run;
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
    for (const err of errors) console.error(`[provider-benchmark] ${err}`);
    process.exit(1);
  }

  const externalBinary = resolve(
    opts.externalBinary ?? resolvePluginBinaryPathFrom(resolvePluginTargetDir(repoRoot)),
  );
  const embeddedBinary = resolve(
    opts.embeddedBinary ?? resolveEmbeddedBinaryPathFrom(resolveEmbeddedTargetDir(repoRoot)),
  );

  for (const [label, path] of [
    ["external", externalBinary],
    ["embedded", embeddedBinary],
  ]) {
    if (!existsSync(path)) {
      console.error(
        `[provider-benchmark] ${label} binary not found: ${path}\n` +
          `[provider-benchmark] Build it first (build time is excluded from the benchmark on purpose):\n` +
          (label === "external"
            ? "[provider-benchmark]   pnpm build:e2e:wdio-plugin"
            : "[provider-benchmark]   pnpm build:e2e:wdio-embedded"),
      );
      process.exit(1);
    }
  }

  const benchDate = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = opts.out ?? join(os.tmpdir(), "ris-provider-benchmark", benchDate);
  mkdirSync(outDir, { recursive: true });

  console.log("[provider-benchmark] Environment:");
  console.log(
    JSON.stringify(
      {
        specs: opts.specs,
        measuredRuns: opts.measuredRuns,
        warmupRuns: opts.warmupRuns,
        externalBinary,
        embeddedBinary,
        platform: process.platform,
        nodeVersion: process.version,
        outDir,
      },
      null,
      2,
    ),
  );

  /** @type {Record<string, Record<string, any[]>>} raw per-run records: bySpec[spec][provider] */
  const raw = {};

  for (const spec of opts.specs) {
    raw[spec] = { external: [], embedded: [] };
    const binaries = { external: externalBinary, embedded: embeddedBinary };

    async function doRun({ provider, runLabel, measured }) {
      const prePorts = checkPorts([PROVIDER_PORTS[provider]]);
      const result = runOneViaSubprocess({
        provider,
        spec,
        binary: binaries[provider],
        scriptDir,
        repoRoot,
        logDir: join(outDir, "logs"),
      });
      const postPorts = checkPorts([PROVIDER_PORTS[provider]]);

      const record = {
        runLabel,
        provider,
        spec,
        totalRunMs: result.totalRunMs,
        outcome: result.outcome,
        passed: result.passed,
        cleanupRequired: result.cleanupRequired,
        cleanupSafe: result.cleanupSafe,
        cleanupSucceeded: result.cleanupSucceeded,
        commandCount: result.summary?.commandCount ?? null,
        medianCommandMs: result.summary?.median ?? null,
        p95CommandMs: result.summary?.p95 ?? null,
        commandsGe5s: result.summary?.bucketsGe?.ms5000 ?? null,
        portsFreeBefore: prePorts.probeSucceeded && prePorts.occupiedPorts.length === 0,
        portsFreeAfter: postPorts.probeSucceeded && postPorts.occupiedPorts.length === 0,
      };

      console.log(
        `[provider-benchmark] ${runLabel} provider=${provider} spec=${spec} ` +
          `outcome=${record.outcome} totalRunMs=${record.totalRunMs} ` +
          `portsFreeBefore=${record.portsFreeBefore} portsFreeAfter=${record.portsFreeAfter}`,
      );

      if (measured) raw[spec][provider].push(record);
      return record;
    }

    console.log(`\n[provider-benchmark] === spec=${spec}: warm-up (${opts.warmupRuns} per provider) ===`);
    for (let w = 1; w <= opts.warmupRuns; w++) {
      await doRun({ provider: "external", runLabel: `warmup-external-${w}`, measured: false });
      await doRun({ provider: "embedded", runLabel: `warmup-embedded-${w}`, measured: false });
    }

    console.log(`\n[provider-benchmark] === spec=${spec}: measured (${opts.measuredRuns} per provider, alternating) ===`);
    for (let m = 1; m <= opts.measuredRuns; m++) {
      await doRun({ provider: "external", runLabel: `measured-external-${m}`, measured: true });
      await doRun({ provider: "embedded", runLabel: `measured-embedded-${m}`, measured: true });
    }
  }

  // ── Aggregation ──────────────────────────────────────────────────────────

  const perSpec = {};
  for (const spec of opts.specs) {
    perSpec[spec] = {};
    for (const provider of ["external", "embedded"]) {
      const records = raw[spec][provider];
      const stable = records.every(
        (r) => r.outcome === "CLEAN_PASS" && r.portsFreeBefore && r.portsFreeAfter,
      );
      perSpec[spec][provider] = {
        totalTimeMs: computeStats(records.map((r) => r.totalRunMs)),
        commandCount: computeStats(records.map((r) => r.commandCount).filter((v) => v !== null)),
        medianCommandMs: computeStats(records.map((r) => r.medianCommandMs).filter((v) => v !== null)),
        p95CommandMs: computeStats(records.map((r) => r.p95CommandMs).filter((v) => v !== null)),
        commandsGe5s: computeStats(records.map((r) => r.commandsGe5s).filter((v) => v !== null)),
        cleanPassCount: records.filter((r) => r.outcome === "CLEAN_PASS").length,
        totalRuns: records.length,
        allCleanPassPortsFree: stable,
        records,
      };
    }
    perSpec[spec].embeddedFasterPercent = percentFaster(
      perSpec[spec].external.totalTimeMs.median,
      perSpec[spec].embedded.totalTimeMs.median,
    );
  }

  const combined = {};
  for (const provider of ["external", "embedded"]) {
    const allTotals = opts.specs.flatMap((spec) => raw[spec][provider].map((r) => r.totalRunMs));
    combined[provider] = computeStats(allTotals);
  }
  combined.embeddedFasterPercent = percentFaster(combined.external.median, combined.embedded.median);
  combined.specsWhereEmbeddedFaster = opts.specs.filter(
    (spec) => (perSpec[spec].embeddedFasterPercent ?? -Infinity) > 0,
  ).length;
  combined.specsWhereEmbeddedFasterByAtLeast10Percent = opts.specs.filter(
    (spec) => (perSpec[spec].embeddedFasterPercent ?? -Infinity) >= 10,
  ).length;

  const report = {
    generatedAt: new Date().toISOString(),
    specs: opts.specs,
    measuredRuns: opts.measuredRuns,
    warmupRuns: opts.warmupRuns,
    externalBinary,
    embeddedBinary,
    perSpec,
    combined,
  };

  const jsonPath = join(outDir, "provider-benchmark.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  console.log(`\n[provider-benchmark] === Complete ===`);
  console.log(
    `[provider-benchmark] combined median: external=${combined.external.median}ms embedded=${combined.embedded.median}ms ` +
      `(embedded ${combined.embeddedFasterPercent}% ${combined.embeddedFasterPercent >= 0 ? "faster" : "slower"})`,
  );
  console.log(
    `[provider-benchmark] specs where embedded faster: ${combined.specsWhereEmbeddedFaster}/${opts.specs.length}; ` +
      `by >=10%: ${combined.specsWhereEmbeddedFasterByAtLeast10Percent}/${opts.specs.length}`,
  );
  console.log(`[provider-benchmark] Report: ${jsonPath}`);

  process.exit(0);
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
    console.error(`[provider-benchmark] Fatal error: ${e.stack ?? e.message}`);
    process.exit(1);
  });
}
