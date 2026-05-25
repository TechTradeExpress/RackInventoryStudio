// Fixture-based tests for scripts/bump-version.mjs.
// Uses only Node built-ins: node:test, node:assert, node:fs, node:os, node:path, node:child_process.
// Each test creates an isolated temporary directory — the real repo files are never touched.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "bump-version.mjs");

// All four canonical version file paths relative to repo root.
const VERSION_FILES = [
  "package.json",
  join("apps", "desktop", "package.json"),
  join("apps", "desktop", "src-tauri", "Cargo.toml"),
  join("apps", "desktop", "src-tauri", "tauri.conf.json"),
];

/**
 * Create a temporary fixture repository with all four canonical version files
 * set to the given version. Returns the absolute path to the temp root.
 */
function makeFixture(version = "0.1.0") {
  const root = mkdtempSync(join(tmpdir(), "ris-bump-test-"));
  mkdirSync(join(root, "apps", "desktop", "src-tauri"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-workspace", version }, null, 2) + "\n",
  );
  writeFileSync(
    join(root, "apps", "desktop", "package.json"),
    JSON.stringify({ name: "test-desktop", version }, null, 2) + "\n",
  );
  writeFileSync(
    join(root, "apps", "desktop", "src-tauri", "Cargo.toml"),
    `[package]\nname = "test-app"\nversion = "${version}"\nedition = "2021"\n`,
  );
  writeFileSync(
    join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"),
    JSON.stringify({ version }, null, 2) + "\n",
  );

  return root;
}

/**
 * Run the bump-version script with an explicit --root pointing at a fixture.
 * Extra args are appended after --root so version and flags can be passed freely.
 */
function run(extraArgs, root) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...extraArgs], {
    encoding: "utf8",
  });
}

/** Read the version from a fixture file (JSON or Cargo.toml). */
function readVersion(root, rel) {
  const content = readFileSync(join(root, rel), "utf8");
  if (rel.endsWith(".toml")) {
    const m = content.match(/^version\s*=\s*"([^"]+)"/m);
    return m ? m[1] : undefined;
  }
  return JSON.parse(content).version;
}

/** Assert all four fixture version files equal `expected`. */
function assertAllVersions(root, expected) {
  for (const rel of VERSION_FILES) {
    assert.strictEqual(
      readVersion(root, rel),
      expected,
      `${rel} should be "${expected}"`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe("bump-version.mjs", () => {
  // ── Argument validation ───────────────────────────────────────────────────

  it("exits non-zero with usage message when no version arg is provided", () => {
    const root = makeFixture();
    const r = run([], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("Usage:"),
      `stderr should include "Usage:" — got: ${r.stderr}`,
    );
  });

  it("exits non-zero for version '1.2' (missing patch)", () => {
    const root = makeFixture();
    const r = run(["1.2"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(r.stderr.includes("Invalid version"), `got: ${r.stderr}`);
  });

  it("exits non-zero for version '1.2.3.4' (four segments)", () => {
    const root = makeFixture();
    const r = run(["1.2.3.4"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(r.stderr.includes("Invalid version"), `got: ${r.stderr}`);
  });

  it("exits non-zero for version 'not-semver'", () => {
    const root = makeFixture();
    const r = run(["not-semver"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(r.stderr.includes("Invalid version"), `got: ${r.stderr}`);
  });

  it("exits non-zero for '1.2.3-' (empty prerelease)", () => {
    const root = makeFixture();
    const r = run(["1.2.3-"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(r.stderr.includes("Invalid version"), `got: ${r.stderr}`);
  });

  it("exits non-zero for '1.2.3+' (empty build metadata)", () => {
    const root = makeFixture();
    const r = run(["1.2.3+"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(r.stderr.includes("Invalid version"), `got: ${r.stderr}`);
  });

  // ── No-op path ────────────────────────────────────────────────────────────

  it("exits 0 and does not alter files when version is already current", () => {
    const root = makeFixture("0.1.0");
    const r = run(["0.1.0"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.includes("nothing to do") || r.stdout.includes("unchanged"),
      `should print a no-op message — got: ${r.stdout}`,
    );
    assertAllVersions(root, "0.1.0");
  });

  // ── Successful bump ───────────────────────────────────────────────────────

  it("updates all four files to a valid stable version", () => {
    const root = makeFixture("0.1.0");
    const r = run(["0.2.0"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assertAllVersions(root, "0.2.0");
  });

  it("updates all four files to a valid prerelease version", () => {
    const root = makeFixture("0.1.0");
    const r = run(["0.2.0-beta.1"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assertAllVersions(root, "0.2.0-beta.1");
  });

  it("updates all four files to a valid rc version", () => {
    const root = makeFixture("0.1.0");
    const r = run(["1.0.0-rc.2"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assertAllVersions(root, "1.0.0-rc.2");
  });

  // ── Dry-run ───────────────────────────────────────────────────────────────

  it("dry-run prints the before/after table but does not write files", () => {
    const root = makeFixture("0.1.0");
    const r = run(["0.2.0", "--dry-run"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assert.ok(
      r.stdout.toLowerCase().includes("dry"),
      `should mention dry run — got: ${r.stdout}`,
    );
    assert.ok(
      r.stdout.includes("0.2.0"),
      `should show new version in table — got: ${r.stdout}`,
    );
    // Files must remain at original version
    assertAllVersions(root, "0.1.0");
  });

  it("dry-run exits 0 even when version would be a no-op", () => {
    const root = makeFixture("0.1.0");
    const r = run(["0.1.0", "--dry-run"], root);
    assert.strictEqual(r.status, 0, `should exit 0 — stderr: ${r.stderr}`);
    assertAllVersions(root, "0.1.0");
  });

  // ── Error paths ───────────────────────────────────────────────────────────

  it("exits non-zero when root package.json is missing", () => {
    const root = makeFixture("0.1.0");
    unlinkSync(join(root, "package.json"));
    const r = run(["0.2.0"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("Missing") || r.stderr.includes("missing"),
      `should mention missing file — got: ${r.stderr}`,
    );
  });

  it("exits non-zero when Cargo.toml is missing", () => {
    const root = makeFixture("0.1.0");
    unlinkSync(join(root, "apps", "desktop", "src-tauri", "Cargo.toml"));
    const r = run(["0.2.0"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("Missing") || r.stderr.includes("missing"),
      `should mention missing file — got: ${r.stderr}`,
    );
  });

  it("exits non-zero when package.json contains malformed JSON", () => {
    const root = makeFixture("0.1.0");
    writeFileSync(join(root, "package.json"), "{ not valid json }");
    const r = run(["0.2.0"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("parse") || r.stderr.includes("JSON") || r.stderr.includes("Parse"),
      `should mention JSON parse error — got: ${r.stderr}`,
    );
  });

  it("exits non-zero when Cargo.toml has no version line", () => {
    const root = makeFixture("0.1.0");
    writeFileSync(
      join(root, "apps", "desktop", "src-tauri", "Cargo.toml"),
      `[package]\nname = "test-app"\nedition = "2021"\n`,
    );
    const r = run(["0.2.0"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("version") || r.stderr.includes("parse"),
      `should mention version parse error — got: ${r.stderr}`,
    );
  });

  it("exits non-zero when package.json has no version field", () => {
    const root = makeFixture("0.1.0");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "test-workspace" }, null, 2) + "\n",
    );
    const r = run(["0.2.0"], root);
    assert.ok(r.status !== 0, "should exit non-zero");
    assert.ok(
      r.stderr.includes("version") || r.stderr.includes(".version"),
      `should mention missing version field — got: ${r.stderr}`,
    );
  });
});
