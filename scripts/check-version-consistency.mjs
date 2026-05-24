#!/usr/bin/env node
// Reads the app version from four canonical sources and exits non-zero if they differ.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
if (versions.length === 1) {
  console.log(`\n✓ All versions match: ${versions[0]}\n`);
  process.exit(0);
} else {
  console.error("\n✗ Version mismatch detected! Update all four files to the same version.\n");
  process.exit(1);
}
