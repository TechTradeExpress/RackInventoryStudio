#!/usr/bin/env node
// Usage: node scripts/check-version-consistency.mjs [--root <path>]
// Reads the app version from four canonical sources and exits non-zero if they differ.
// Also cross-checks the Node.js/pnpm toolchain declarations for drift.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let rootOverride = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--root") {
    rootOverride = args[++i];
    if (!rootOverride) {
      console.error("  ✗ --root requires a path argument");
      process.exit(1);
    }
  }
}

const root = rootOverride
  ? resolve(rootOverride)
  : resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), "utf8"));
}

function readCargoVersion(relPath) {
  const content = readFileSync(resolve(root, relPath), "utf8");
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error(`Could not parse version from ${relPath}`);
  return match[1];
}

const sources = [
  { label: "package.json (workspace root)", version: readJson("package.json").version },
  { label: "apps/desktop/package.json",      version: readJson("apps/desktop/package.json").version },
  { label: "apps/desktop/src-tauri/Cargo.toml",       version: readCargoVersion("apps/desktop/src-tauri/Cargo.toml") },
  { label: "apps/desktop/src-tauri/tauri.conf.json",  version: readJson("apps/desktop/src-tauri/tauri.conf.json").version },
];

const width = Math.max(...sources.map((s) => s.label.length));
console.log("\nVersion consistency check");
console.log("─".repeat(width + 14));
for (const { label, version } of sources) {
  console.log(`  ${label.padEnd(width)}  ${version}`);
}
console.log("─".repeat(width + 14));

const versions = [...new Set(sources.map((s) => s.version))];
let ok = versions.length === 1;
if (ok) {
  console.log(`\n✓ All versions match: ${versions[0]}\n`);
} else {
  console.error("\n✗ Version mismatch detected! Update all four files to the same version.\n");
}

// --- Toolchain (Node.js / pnpm) consistency -------------------------------

function readNvmrcMajor() {
  const content = readFileSync(resolve(root, ".nvmrc"), "utf8").trim();
  const match = content.match(/^(\d+)/);
  if (!match) throw new Error(`Could not parse Node major version from .nvmrc: "${content}"`);
  return match[1];
}

function readEnginesNodeMajor() {
  const engines = readJson("package.json").engines;
  if (!engines?.node) throw new Error('package.json is missing "engines.node"');
  const match = engines.node.match(/>=\s*(\d+)/);
  if (!match) throw new Error(`Could not parse minimum Node major version from engines.node: "${engines.node}"`);
  return match[1];
}

function readPackageManagerPnpmVersion() {
  const pm = readJson("package.json").packageManager;
  if (!pm) throw new Error('package.json is missing "packageManager"');
  const match = pm.match(/^pnpm@(\d+\.\d+\.\d+)$/);
  if (!match) throw new Error(`Could not parse pnpm version from packageManager: "${pm}"`);
  return match[1];
}

function readWorkflowNodeVersions() {
  const workflowsDir = resolve(root, ".github/workflows");
  const results = [];
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const relPath = join(".github/workflows", file);
    const content = readFileSync(resolve(root, relPath), "utf8");
    for (const match of content.matchAll(/node-version:\s*["']?(\d+)["']?/g)) {
      results.push({ file: relPath, nodeVersion: match[1] });
    }
  }
  return results;
}

const nvmrcMajor = readNvmrcMajor();
const enginesMajor = readEnginesNodeMajor();
const pnpmVersion = readPackageManagerPnpmVersion();
const workflowNodeVersions = readWorkflowNodeVersions();

console.log("Toolchain consistency check");
console.log("─".repeat(width + 14));
console.log(`  .nvmrc                          ${nvmrcMajor}`);
console.log(`  package.json engines.node       >=${enginesMajor}`);
console.log(`  package.json packageManager     pnpm@${pnpmVersion}`);
for (const { file, nodeVersion } of workflowNodeVersions) {
  console.log(`  ${file.padEnd(width)}  node-version: ${nodeVersion}`);
}
console.log("─".repeat(width + 14));

const toolchainMajors = new Set([nvmrcMajor, enginesMajor, ...workflowNodeVersions.map((w) => w.nodeVersion)]);
if (toolchainMajors.size === 1) {
  console.log(`\n✓ Node.js toolchain declarations match: ${nvmrcMajor}\n`);
} else {
  console.error(
    `\n✗ Node.js toolchain mismatch detected across .nvmrc, package.json engines.node, and GitHub workflow node-version declarations: ${[...toolchainMajors].join(", ")}\n`,
  );
  ok = false;
}

if (workflowNodeVersions.length === 0) {
  console.error("\n✗ No node-version declarations found under .github/workflows — expected at least one.\n");
  ok = false;
}

process.exit(ok ? 0 : 1);
