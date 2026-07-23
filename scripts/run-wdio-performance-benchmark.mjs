#!/usr/bin/env node
/**
 * WDIO performance benchmark runner — external vs. embedded driver provider.
 *
 * Usage:
 *   node scripts/run-wdio-performance-benchmark.mjs \
 *     --provider external \
 *     --spec app-smoke \
 *     --repeat 2
 *
 *   node scripts/run-wdio-performance-benchmark.mjs \
 *     --provider embedded \
 *     --spec core-inventory \
 *     --repeat 2 \
 *     --binary "C:\path\to\rack-inventory-studio-desktop.exe"
 *
 * Options:
 *   --provider  external | embedded  (required)
 *   --spec      spec name without .e2e.ts  (required)
 *   --repeat    number of runs  (required, min 1)
 *   --binary    path to the Tauri binary  (optional; defaults to auto-detect)
 *   --continue-on-failure   keep running after a failed run (default: stop)
 *
 * Environment requirements:
 *   The script runs from the repository root.
 *   WDIO is invoked as: node_modules/.bin/wdio (from apps/desktop/).
 *   On Linux: DISPLAY must be set (e.g. DISPLAY=:77).
 *
 * Output:
 *   <os.tmpdir()>/ris-wdio-bench/<run-id>/         per-run timing data
 *   <os.tmpdir()>/ris-wdio-bench/benchmark-<date>/ aggregate JSON + Markdown
 *
 * Uses only Node.js built-in modules — no extra dependencies.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, platform, cpus, totalmem } from "node:os";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ── Parse arguments ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    provider: null,
    spec: null,
    repeat: null,
    binary: null,
    continueOnFailure: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--provider":
        result.provider = args[++i];
        break;
      case "--spec":
        result.spec = args[++i];
        break;
      case "--repeat":
        result.repeat = parseInt(args[++i], 10);
        break;
      case "--binary":
        result.binary = args[++i];
        break;
      case "--continue-on-failure":
        result.continueOnFailure = true;
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  return result;
}

const opts = parseArgs(process.argv);

// ── Validate ──────────────────────────────────────────────────────────────────

const ALLOWED_PROVIDERS = ["external", "embedded"];

if (!opts.provider || !ALLOWED_PROVIDERS.includes(opts.provider)) {
  console.error(`--provider must be one of: ${ALLOWED_PROVIDERS.join(", ")}`);
  process.exit(1);
}
if (!opts.spec) {
  console.error("--spec is required");
  process.exit(1);
}
if (!opts.repeat || !Number.isFinite(opts.repeat) || opts.repeat < 1) {
  console.error("--repeat must be a positive integer");
  process.exit(1);
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const desktopDir = join(repoRoot, "apps", "desktop");
const wdioBin = join(desktopDir, "node_modules", ".bin", "wdio");
const wdioConf = join(desktopDir, "e2e-wdio", "wdio.conf.ts");
const specPath = join(desktopDir, "e2e-wdio", "specs", `${opts.spec}.e2e.ts`);

if (!existsSync(wdioBin)) {
  console.error(`WDIO binary not found: ${wdioBin}`);
  console.error("Run: pnpm install (from apps/desktop)");
  process.exit(1);
}
if (!existsSync(wdioConf)) {
  console.error(`WDIO config not found: ${wdioConf}`);
  process.exit(1);
}
if (!existsSync(specPath)) {
  console.error(`Spec file not found: ${specPath}`);
  console.error(`Expected: ${specPath}`);
  process.exit(1);
}

// ── Benchmark output directory ────────────────────────────────────────────────

const benchDate = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const benchDir = join(tmpdir(), "ris-wdio-bench", `benchmark-${benchDate}`);
mkdirSync(benchDir, { recursive: true });

// ── Environment info ──────────────────────────────────────────────────────────

function getNodeVersion() {
  return process.version;
}

function getRustVersion() {
  try {
    const out = execFileSync("cargo", ["--version"], { encoding: "utf8" });
    return out.trim();
  } catch {
    return "unavailable";
  }
}

function getEdgeVersion() {
  if (platform() !== "win32") return "N/A (not Windows)";
  try {
    // Edge is typically at this path on Windows
    const edgePaths = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const p of edgePaths) {
      if (existsSync(p)) {
        const out = execFileSync(p, ["--version"], { encoding: "utf8" }).trim();
        return out;
      }
    }
    return "path not found";
  } catch {
    return "unavailable";
  }
}

const envInfo = {
  platform: platform(),
  arch: process.arch,
  cpuModel: cpus()[0]?.model ?? "unknown",
  cpuCount: cpus().length,
  totalRamMB: Math.round(totalmem() / 1024 / 1024),
  node: getNodeVersion(),
  rust: getRustVersion(),
  edge: getEdgeVersion(),
  provider: opts.provider,
  spec: opts.spec,
  repeat: opts.repeat,
  binary: opts.binary ?? "(auto-detect)",
  benchmarkStarted: new Date().toISOString(),
};

console.log("[benchmark] Environment:");
console.log(JSON.stringify(envInfo, null, 2));

// ── Run WDIO ──────────────────────────────────────────────────────────────────

const runResults = [];

for (let runN = 1; runN <= opts.repeat; runN++) {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const runStartMs = Date.now();

  console.log(`\n[benchmark] === Run ${runN}/${opts.repeat} provider=${opts.provider} spec=${opts.spec} runId=${runId} ===`);

  const env = {
    ...process.env,
    RIS_WDIO_TIMING: "1",
    RIS_WDIO_DRIVER_PROVIDER: opts.provider,
    RIS_WDIO_RUN_ID: runId,
    RIS_WDIO_SLOW_COMMAND_MS: "500",
  };

  if (opts.binary) {
    env["TAURI_BINARY_PATH"] = resolve(opts.binary);
  }

  if (opts.provider === "embedded") {
    env["RIS_WDIO_EMBEDDED_PORT"] = "4445";
  }

  let exitCode = 0;
  let timedOut = false;

  try {
    execFileSync(wdioBin, ["run", wdioConf, "--spec", specPath], {
      cwd: desktopDir,
      env,
      stdio: "inherit",
      // 120 minutes max per run
      timeout: 120 * 60 * 1000,
    });
  } catch (err) {
    exitCode = err.status ?? 1;
    timedOut = err.signal === "SIGTERM" && err.killed;
  }

  const durationMs = Date.now() - runStartMs;
  const reportRunDir = join(tmpdir(), "ris-wdio-bench", runId);
  const summaryPath = join(reportRunDir, "summary.json");

  let summary = null;
  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch {
      console.warn(`[benchmark] Could not parse summary: ${summaryPath}`);
    }
  }

  const result = {
    runN,
    runId,
    provider: opts.provider,
    spec: opts.spec,
    exitCode,
    passed: exitCode === 0,
    timedOut,
    durationMs,
    reportDir: reportRunDir,
    summaryPath: existsSync(summaryPath) ? summaryPath : null,
    summary,
  };

  runResults.push(result);

  console.log(
    `[benchmark] Run ${runN} ${result.passed ? "PASSED" : "FAILED"} in ${Math.round(durationMs / 1000)}s exitCode=${exitCode}`,
  );

  if (summary) {
    console.log(
      `[benchmark] Commands: ${summary.commandCount} median=${summary.median}ms p95=${summary.p95}ms p99=${summary.p99}ms max=${summary.max}ms`,
    );
  }

  if (!result.passed && !opts.continueOnFailure) {
    console.error(`[benchmark] Stopping after failure in run ${runN}. Use --continue-on-failure to proceed.`);
    break;
  }
}

// ── Aggregate statistics ──────────────────────────────────────────────────────

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function avg(values) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

const passedRuns = runResults.filter((r) => r.passed && r.summary);
const allDurationMs = passedRuns.map((r) => r.durationMs).sort((a, b) => a - b);
const allMedians = passedRuns.map((r) => r.summary.median).sort((a, b) => a - b);
const allP95 = passedRuns.map((r) => r.summary.p95).sort((a, b) => a - b);
const allP99 = passedRuns.map((r) => r.summary.p99).sort((a, b) => a - b);
const allMax = passedRuns.map((r) => r.summary.max).sort((a, b) => a - b);

const aggregate = {
  provider: opts.provider,
  spec: opts.spec,
  totalRuns: opts.repeat,
  passedRuns: passedRuns.length,
  failedRuns: runResults.filter((r) => !r.passed).length,
  durationMs: {
    min: allDurationMs[0] ?? 0,
    median: pct(allDurationMs, 50),
    max: allDurationMs[allDurationMs.length - 1] ?? 0,
  },
  commandLatencyMs: {
    medianOfMedians: pct(allMedians, 50),
    p95ofP95: pct(allP95, 95),
    p99ofP99: pct(allP99, 99),
    maxOfMax: allMax[allMax.length - 1] ?? 0,
  },
};

const benchmarkResult = {
  meta: envInfo,
  runs: runResults,
  aggregate,
  benchmarkCompleted: new Date().toISOString(),
};

// ── Write outputs ─────────────────────────────────────────────────────────────

const jsonPath = join(benchDir, `${opts.provider}-${opts.spec}.json`);
writeFileSync(jsonPath, JSON.stringify(benchmarkResult, null, 2));

// Markdown summary
const md = [
  `# Benchmark: ${opts.provider} / ${opts.spec}`,
  ``,
  `Date: ${envInfo.benchmarkStarted}`,
  `Platform: ${envInfo.platform} ${envInfo.arch} | CPU: ${envInfo.cpuModel} (${envInfo.cpuCount} cores) | RAM: ${envInfo.totalRamMB} MB`,
  `Node: ${envInfo.node} | Rust: ${envInfo.rust}`,
  `Provider: **${opts.provider}** | Spec: \`${opts.spec}\` | Repeat: ${opts.repeat}`,
  ``,
  `## Run Results`,
  ``,
  `| Run | Result | Duration | Commands | Median | P95 | P99 | Max | ≥1s | ≥5s |`,
  `|-----|--------|----------|----------|--------|-----|-----|-----|-----|-----|`,
  ...runResults.map((r) => {
    const s = r.summary;
    return `| ${r.runN} | ${r.passed ? "PASSED ✓" : "FAILED ✗"} | ${Math.round(r.durationMs / 1000)}s | ${s?.commandCount ?? "—"} | ${s?.median ?? "—"}ms | ${s?.p95 ?? "—"}ms | ${s?.p99 ?? "—"}ms | ${s?.max ?? "—"}ms | ${s?.bucketsGe?.ms1000 ?? "—"} | ${s?.bucketsGe?.ms5000 ?? "—"} |`;
  }),
  ``,
  `## Aggregate (passed runs)`,
  ``,
  `- Passed: ${aggregate.passedRuns}/${aggregate.totalRuns}`,
  `- Duration (median): ${aggregate.durationMs.median}ms`,
  `- Command latency median-of-medians: ${aggregate.commandLatencyMs.medianOfMedians}ms`,
  `- Command latency p95-of-p95: ${aggregate.commandLatencyMs.p95ofP95}ms`,
  ``,
  `## Report files`,
  ``,
  ...runResults.map((r) => `- Run ${r.runN}: \`${r.reportDir}\``),
  `- Aggregate JSON: \`${jsonPath}\``,
  ``,
].join("\n");

const mdPath = join(benchDir, `${opts.provider}-${opts.spec}.md`);
writeFileSync(mdPath, md);

console.log(`\n[benchmark] === Complete ===`);
console.log(`[benchmark] Passed: ${aggregate.passedRuns}/${aggregate.totalRuns}`);
console.log(`[benchmark] Aggregate JSON: ${jsonPath}`);
console.log(`[benchmark] Markdown:       ${mdPath}`);
console.log(`[benchmark] Benchmark dir:  ${benchDir}`);

const allPassed = runResults.every((r) => r.passed);
process.exit(allPassed ? 0 : 1);
