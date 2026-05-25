#!/usr/bin/env node
// Repository hygiene checks — exits non-zero if any check fails.
// Usage: node scripts/check-repo-hygiene.mjs
// Or via package script: pnpm check:hygiene

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function gitLsFiles(...patterns) {
  const result = spawnSync("git", ["ls-files", "--", ...patterns], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.error || result.status === null) return null;
  return result.stdout.trim().split("\n").filter(Boolean);
}

const checks = [];

function check(name, pass, detail = null) {
  checks.push({ name, pass, detail });
}

// ── 1. No package-lock.json (project uses pnpm) ──────────────────────────────
{
  const tracked = gitLsFiles("package-lock.json", "**/package-lock.json");
  check(
    "No package-lock.json tracked (project uses pnpm)",
    tracked !== null && tracked.length === 0,
    tracked?.length ? `Found: ${tracked.join(", ")}` : null,
  );
}

// ── 2. No .env files in git tree ─────────────────────────────────────────────
{
  const tracked = gitLsFiles(".env", "**/.env", ".env.*", "**/.env.*");
  const envFiles = (tracked ?? []).filter(
    (f) => !f.endsWith(".env.example") && !f.endsWith(".env.sample"),
  );
  check(
    "No .env files committed",
    envFiles.length === 0,
    envFiles.length ? `Found: ${envFiles.join(", ")}` : null,
  );
}

// ── 3. No review-context files committed ─────────────────────────────────────
{
  const tracked = gitLsFiles(".ai/review-context-*.md");
  check(
    "No .ai/review-context-*.md files committed",
    tracked !== null && tracked.length === 0,
    tracked?.length ? `Found: ${tracked.join(", ")}` : null,
  );
}

// ── 4. No node_modules directories in git tree ───────────────────────────────
{
  const tracked = gitLsFiles("node_modules/**", "**/node_modules/**");
  check(
    "No node_modules tracked by git",
    tracked !== null && tracked.length === 0,
    tracked?.length ? `Found ${tracked.length} node_modules entr${tracked.length === 1 ? "y" : "ies"}` : null,
  );
}

// ── 5. pnpm-lock.yaml is present and tracked ─────────────────────────────────
{
  const tracked = gitLsFiles("pnpm-lock.yaml");
  check(
    "pnpm-lock.yaml is tracked by git",
    tracked !== null && tracked.length === 1,
    tracked?.length === 0 ? "pnpm-lock.yaml is missing or untracked" : null,
  );
}

// ── 6. CHANGELOG.md is present ───────────────────────────────────────────────
{
  const exists = existsSync(resolve(root, "CHANGELOG.md"));
  check("CHANGELOG.md is present", exists, exists ? null : "CHANGELOG.md not found at repo root");
}

// ── Print results ─────────────────────────────────────────────────────────────
const nameWidth = Math.max(...checks.map((c) => c.name.length));
const sep = "─".repeat(nameWidth + 10);
const failures = checks.filter((c) => !c.pass);

console.log("\nRepository hygiene");
console.log(sep);
for (const { name, pass, detail } of checks) {
  const icon = pass ? "✓" : "✗";
  const suffix = detail && !pass ? `  ← ${detail}` : "";
  console.log(`  ${icon} ${name.padEnd(nameWidth)}${suffix}`);
}
console.log(sep);

if (failures.length === 0) {
  console.log(`\n  All ${checks.length} hygiene checks passed.\n`);
  process.exit(0);
} else {
  console.error(`\n  ${failures.length} hygiene check(s) failed.\n`);
  process.exit(1);
}
