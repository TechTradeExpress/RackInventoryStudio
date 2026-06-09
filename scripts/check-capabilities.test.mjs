#!/usr/bin/env node
// Guard test: verify that required Tauri window capabilities are present.
// Prevents silent regression where missing permissions cause destroy() to fail.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const capPath = resolve(root, "apps/desktop/src-tauri/capabilities/default.json");

const capabilities = JSON.parse(readFileSync(capPath, "utf8"));
const permissions = capabilities.permissions ?? [];

describe("capabilities/default.json — required window permissions", () => {
  it("contains core:window:allow-destroy (required for getCurrentWindow().destroy())", () => {
    assert.ok(
      permissions.includes("core:window:allow-destroy"),
      `Expected 'core:window:allow-destroy' in capabilities permissions.\nGot: ${JSON.stringify(permissions)}`,
    );
  });

  it("contains core:window:allow-close (required for close IPC path)", () => {
    assert.ok(
      permissions.includes("core:window:allow-close"),
      `Expected 'core:window:allow-close' in capabilities permissions.\nGot: ${JSON.stringify(permissions)}`,
    );
  });
});
