// Fixture-based tests for scripts/check-version-consistency.mjs.
// Uses only Node built-ins: node:test, node:assert, node:fs, node:os, node:path, node:child_process.
// Each test creates an isolated temporary directory — the real repo files are never touched.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dir, "check-version-consistency.mjs");

/**
 * Create a temporary fixture repository with the four canonical version files
 * and the toolchain declarations (.nvmrc, engines.node, packageManager, workflow
 * node-version) all consistent, unless overridden.
 */
function makeFixture({
  version = "0.1.0",
  nvmrc = "24",
  enginesNode = ">=24 <25",
  packageManager = "pnpm@10.33.4",
  workflowNodeVersions = { "ci.yml": "24", "dependency-audit.yml": "24" },
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "ris-version-consistency-test-"));
  mkdirSync(join(root, "apps", "desktop", "src-tauri"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-workspace", version, packageManager, engines: { node: enginesNode } }, null, 2) + "\n",
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
  writeFileSync(join(root, ".nvmrc"), `${nvmrc}\n`);

  for (const [file, nodeVersion] of Object.entries(workflowNodeVersions)) {
    writeFileSync(
      join(root, ".github", "workflows", file),
      `name: ${file}\njobs:\n  build:\n    steps:\n      - uses: actions/setup-node@v6\n        with:\n          node-version: ${nodeVersion}\n`,
    );
  }

  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe("check-version-consistency", () => {
  it("passes when app versions and toolchain declarations are all consistent", () => {
    const root = makeFixture();
    const { status, stdout } = run(root);
    assert.equal(status, 0);
    assert.match(stdout, /All versions match: 0\.1\.0/);
    assert.match(stdout, /Node\.js toolchain declarations match: 24/);
  });

  it("fails when app versions diverge", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "apps", "desktop", "package.json"),
      JSON.stringify({ name: "test-desktop", version: "0.2.0" }, null, 2) + "\n",
    );
    const { status, stderr } = run(root);
    assert.equal(status, 1);
    assert.match(stderr, /Version mismatch detected/);
  });

  it("fails when .nvmrc disagrees with package.json engines.node", () => {
    const root = makeFixture({ nvmrc: "22" });
    const { status, stderr } = run(root);
    assert.equal(status, 1);
    assert.match(stderr, /Node\.js toolchain mismatch detected/);
  });

  it("fails when a workflow pins a different Node major than .nvmrc", () => {
    const root = makeFixture({
      workflowNodeVersions: { "ci.yml": "24", "windows-installer.yml": "22" },
    });
    const { status, stderr } = run(root);
    assert.equal(status, 1);
    assert.match(stderr, /Node\.js toolchain mismatch detected/);
  });

  it("fails when engines.node is missing", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "test-workspace", version: "0.1.0", packageManager: "pnpm@10.33.4" }, null, 2) + "\n",
    );
    const { status } = run(root);
    assert.equal(status, 1);
  });

  it("fails when no workflow declares a node-version", () => {
    const root = makeFixture({ workflowNodeVersions: {} });
    const { status, stderr } = run(root);
    assert.equal(status, 1);
    assert.match(stderr, /No node-version declarations found/);
  });
});
