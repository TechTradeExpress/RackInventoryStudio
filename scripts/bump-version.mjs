#!/usr/bin/env node
// All-sources version bump helper — updates all four canonical version sources.
// Usage: node scripts/bump-version.mjs <new-version> [--dry-run] [--root <path>]
// Example: node scripts/bump-version.mjs 0.1.1
//          node scripts/bump-version.mjs 0.2.0-beta.1 --dry-run
// Or via package script: pnpm bump:version 0.1.1

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Parse arguments: positional version + optional flags
const args = process.argv.slice(2);
let newVersion = null;
let dryRun = false;
let rootOverride = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--dry-run") {
    dryRun = true;
  } else if (args[i] === "--root") {
    rootOverride = args[++i];
    if (!rootOverride) {
      console.error("  ✗ --root requires a path argument");
      process.exit(1);
    }
  } else if (!newVersion) {
    newVersion = args[i];
  }
}

if (!newVersion) {
  console.error("Usage: node scripts/bump-version.mjs <new-version> [--dry-run] [--root <path>]");
  console.error("  node scripts/bump-version.mjs 0.1.1");
  console.error("  node scripts/bump-version.mjs 0.2.0-beta.1 --dry-run");
  process.exit(1);
}

// Resolve root: --root override for testing; otherwise infer from script location
const root = rootOverride
  ? resolve(rootOverride)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");

// SemVer: X.Y.Z with optional pre-release (-alpha.1, -beta.2, -rc.1) and optional build metadata.
// Pre-release and build identifiers must be non-empty alphanumeric segments separated by dots.
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
if (!SEMVER_RE.test(newVersion)) {
  console.error(`\n  ✗ Invalid version format: "${newVersion}"`);
  console.error("    Expected SemVer: 0.1.1  or  0.2.0-beta.1  or  1.0.0-rc.2\n");
  process.exit(1);
}

const FILES = [
  { rel: "package.json",                           label: "package.json (workspace root)",          kind: "json" },
  { rel: "apps/desktop/package.json",              label: "apps/desktop/package.json",              kind: "json" },
  { rel: "apps/desktop/src-tauri/Cargo.toml",      label: "apps/desktop/src-tauri/Cargo.toml",      kind: "toml" },
  { rel: "apps/desktop/src-tauri/tauri.conf.json", label: "apps/desktop/src-tauri/tauri.conf.json", kind: "json" },
];

function readVersion(rel, kind) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) throw new Error(`Missing file: ${rel}`);
  const content = readFileSync(abs, "utf8");
  if (kind === "toml") {
    const m = content.match(/^version\s*=\s*"([^"]+)"/m);
    if (!m) throw new Error(`Cannot parse version line from ${rel}`);
    return m[1];
  }
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error(`Cannot parse JSON from ${rel}`); }
  if (typeof parsed.version !== "string") throw new Error(`No .version field found in ${rel}`);
  return parsed.version;
}

function writeVersion(rel, kind, ver) {
  const abs = resolve(root, rel);
  const content = readFileSync(abs, "utf8");
  let updated;
  if (kind === "toml") {
    updated = content.replace(/^(version\s*=\s*)"[^"]+"$/m, `$1"${ver}"`);
    if (updated === content) throw new Error(`version line not replaced in ${rel} — pattern mismatch`);
  } else {
    const parsed = JSON.parse(content);
    parsed.version = ver;
    const trailing = content.endsWith("\n") ? "\n" : "";
    updated = JSON.stringify(parsed, null, 2) + trailing;
  }
  writeFileSync(abs, updated, "utf8");
}

// Read current state — errors exit with a clear message
let state;
try {
  state = FILES.map(({ rel, label, kind }) => ({ rel, label, kind, before: readVersion(rel, kind) }));
} catch (err) {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exit(1);
}

// Print before/after table
const colW = Math.max(...state.map((f) => f.label.length));
const sep = "─".repeat(colW + 32);
const dryTag = dryRun ? " [dry-run]" : "";
console.log(`\nBump version${dryTag}`);
console.log(sep);
console.log(`  ${"File".padEnd(colW)}  ${"Current".padEnd(14)}  New`);
console.log(sep);
for (const { label, before } of state) {
  const diff = before !== newVersion ? `→ ${newVersion}` : "(unchanged)";
  console.log(`  ${label.padEnd(colW)}  ${before.padEnd(14)}  ${diff}`);
}
console.log(sep);

if (state.every((f) => f.before === newVersion)) {
  console.log(`\n  All files already at ${newVersion} — nothing to do.\n`);
  process.exit(0);
}

if (dryRun) {
  console.log(`\n  Dry run — no files written.\n`);
  process.exit(0);
}

// Write all four files
try {
  for (const { rel, kind } of FILES) {
    writeVersion(rel, kind, newVersion);
  }
} catch (err) {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exit(1);
}

console.log(`\n  ✓ Updated ${FILES.length} files to version ${newVersion}`);
console.log("  Next: node scripts/check-version-consistency.mjs   (or: pnpm check:version)\n");
