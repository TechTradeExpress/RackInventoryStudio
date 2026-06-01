#!/usr/bin/env node
// Beta smoke gate — automated layer for TEST-01.
// Runs fast checks that can be verified locally before the manual smoke walk.
// Usage: node scripts/smoke-beta-gate.mjs
//        pnpm smoke:beta

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── pnpm resolution ──────────────────────────────────────────────────────────

function resolvePnpm() {
  const probe = spawnSync("pnpm", ["--version"], { encoding: "utf8", shell: false });
  if (!probe.error) return "pnpm";
  // pnpm not on PATH — fall back to the version pinned in packageManager
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const version = (pkg.packageManager ?? "pnpm@10.33.4").split("@")[1] ?? "10.33.4";
  return `pnpm@${version}`;
}

const pnpmBin = resolvePnpm();
const [pnpmCmd, ...pnpmPrefix] =
  pnpmBin === "pnpm" ? ["pnpm"] : ["npx", pnpmBin];

// ── runner ───────────────────────────────────────────────────────────────────

const results = [];

function run(label, cmd, args, opts = {}) {
  process.stdout.write(`  Running: ${label} ... `);
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
    ...opts,
  });
  const ok = result.status === 0 && !result.error;
  results.push({ label, ok, result });
  console.log(ok ? "✓" : "✗ FAILED");
  if (!ok && result.stdout) process.stdout.write(result.stdout);
  if (!ok && result.stderr) process.stderr.write(result.stderr);
  if (result.error) console.error(`  spawn error: ${result.error.message}`);
  return ok;
}

// ── header ───────────────────────────────────────────────────────────────────

const sep = "─".repeat(64);
console.log("\nBeta smoke gate — automated layer");
console.log(sep);

// ── 1. Version consistency ────────────────────────────────────────────────────

run(
  "Version consistency (4 sources)",
  process.execPath,
  ["scripts/check-version-consistency.mjs"],
);

// ── 2. Repository hygiene ─────────────────────────────────────────────────────

run(
  "Repository hygiene",
  process.execPath,
  ["scripts/check-repo-hygiene.mjs"],
);

// ── 3. Script unit tests ──────────────────────────────────────────────────────

run(
  "Script unit tests (node --test)",
  process.execPath,
  ["--test", "scripts/bump-version.test.mjs"],
);

// ── 4. Frontend TypeScript type check ─────────────────────────────────────────

run(
  "Frontend TypeScript (tsc --noEmit)",
  pnpmCmd,
  [...pnpmPrefix, "-C", "apps/desktop", "exec", "tsc", "--noEmit"],
);

// ── 5. Frontend Vitest suite ──────────────────────────────────────────────────

run(
  "Frontend Vitest suite",
  pnpmCmd,
  [...pnpmPrefix, "--filter", "@rack-inventory-studio/desktop", "exec", "vitest", "run"],
);

// ── 6. Frontend production build ──────────────────────────────────────────────

const buildOk = run(
  "Frontend production build (vite build)",
  pnpmCmd,
  [...pnpmPrefix, "--filter", "@rack-inventory-studio/desktop", "exec", "vite", "build"],
);

// ── 7. Built HTML sanity check ────────────────────────────────────────────────

{
  const label = "Built HTML: no inline scripts or styles";
  process.stdout.write(`  Running: ${label} ... `);
  let ok = false;
  let detail = "";
  if (!buildOk) {
    detail = "skipped (build failed)";
    console.log(`⚠  ${detail}`);
    results.push({ label, ok: false, skipped: true });
  } else {
    const htmlPath = resolve(root, "apps/desktop/dist/index.html");
    if (!existsSync(htmlPath)) {
      detail = "dist/index.html not found";
      console.log(`✗ FAILED — ${detail}`);
      results.push({ label, ok: false });
    } else {
      const html = readFileSync(htmlPath, "utf8");
      const hasInlineScript = /<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(html);
      const hasInlineStyle = /<style[^>]*>[^<]/i.test(html);
      ok = !hasInlineScript && !hasInlineStyle;
      if (ok) {
        console.log("✓");
      } else {
        if (hasInlineScript) detail += " inline <script> found;";
        if (hasInlineStyle) detail += " inline <style> found;";
        console.log(`✗ FAILED —${detail}`);
      }
      results.push({ label, ok });
    }
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

const failures = results.filter((r) => !r.ok && !r.skipped);
const skipped = results.filter((r) => r.skipped);

console.log(sep);
if (failures.length === 0 && skipped.length === 0) {
  console.log(`\n  ✓  All ${results.length} automated checks passed.\n`);
} else {
  if (failures.length > 0) {
    console.error(`\n  ✗  ${failures.length} automated check(s) FAILED:`);
    for (const r of failures) console.error(`       – ${r.label}`);
  }
  if (skipped.length > 0) {
    console.log(`\n  ⚠  ${skipped.length} check(s) skipped:`);
    for (const r of skipped) console.log(`       – ${r.label}`);
  }
  console.log();
}

// ── Still requires manual verification ───────────────────────────────────────

console.log("Manual steps still required (docs/BETA1_SMOKE_TEST_EN.md):");
console.log(sep);
const manual = [
  "CI green on candidate commit (Rust workspace, dependency audit)",
  "App launches in dev mode — no blank screen, no console errors",
  "Open example repository — summary counts match expected",
  "Locations / Racks / Devices / Device Models render correctly",
  "Create location + rack → Save → Close → Reopen → data persists",
  "Unsaved-changes guard fires before close (dirty repository guard)",
  "Git status visible; dirty indicator after uncommitted save",
  "Push/pull using a safe, disposable test repository only",
  "Cancel in dialogs and modals — no crash, no stale state",
  "Create new repository from scratch — Git auto-initialized",
  "CSV import preview and import flow",
  "Log check — no credentials, no panics, log path accessible",
];
for (const step of manual) {
  console.log(`  [ ] ${step}`);
}
console.log(sep);
console.log(
  "\n  See docs/BETA1_SMOKE_TEST_EN.md for the full manual checklist.\n",
);

process.exit(failures.length > 0 ? 1 : 0);
