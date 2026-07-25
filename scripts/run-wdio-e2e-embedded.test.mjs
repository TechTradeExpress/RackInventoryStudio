/**
 * Unit tests for run-wdio-e2e-embedded.mjs — pure exported functions only.
 * No real WDIO session, no real process spawn, no filesystem writes.
 *
 * Port-contract primitives (parseListeningPorts, inspectPortProbeResult,
 * deriveFinalRunnerExitCode) are implemented once in run-wdio-e2e.mjs and
 * reused here — see run-wdio-e2e.test.mjs for their dedicated coverage.
 *
 * Run:
 *   node --test scripts/run-wdio-e2e-embedded.test.mjs
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";

import {
  parseArgs,
  validateArgs,
  resolveEmbeddedBinaryPath,
  shouldBuildEmbedded,
  buildChildEnv,
  buildRunCommand,
  deriveExitCode,
} from "./run-wdio-e2e-embedded.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Creates a temp specsDir with the given spec names as .e2e.ts files. */
function makeTempSpecsDir(specNames) {
  const base = mkdtempSync(join(tmpdir(), "ris-e2e-embedded-test-"));
  for (const name of specNames) {
    writeFileSync(join(base, `${name}.e2e.ts`), "");
  }
  return base;
}

// ── parseArgs ─────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("sets spec from --spec", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "core-inventory"]);
    assert.equal(opts.spec, "core-inventory");
  });

  it("defaults repeat to 1 when --repeat is not provided", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "core-inventory"]);
    assert.equal(opts.repeat, 1);
  });

  it("defaults port to 4445 when --port is not provided", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "core-inventory"]);
    assert.equal(opts.port, 4445);
  });

  it("passes repeat when --repeat is provided", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "core-inventory", "--repeat", "3"]);
    assert.equal(opts.repeat, 3);
  });

  it("passes port when --port is provided", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "core-inventory", "--port", "5555"]);
    assert.equal(opts.port, 5555);
  });

  it("sets skipBuild from --skip-build", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "foo", "--skip-build"]);
    assert.equal(opts.skipBuild, true);
  });

  it("sets continueOnFailure from --continue-on-failure", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "foo", "--continue-on-failure"]);
    assert.equal(opts.continueOnFailure, true);
  });

  it("sets binary from --binary", () => {
    const opts = parseArgs(["node", "script.mjs", "--spec", "foo", "--binary", "/my/binary"]);
    assert.equal(opts.binary, "/my/binary");
  });

  it("throws on unknown argument", () => {
    assert.throws(
      () => parseArgs(["node", "script.mjs", "--unknown-flag"]),
      /Unknown argument/,
    );
  });
});

// ── validateArgs ──────────────────────────────────────────────────────────────

describe("validateArgs", () => {
  const specsDir = makeTempSpecsDir(["core-inventory", "app-smoke"]);

  it("accepts a known spec name with default repeat/port", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 1, port: 4445 }, specsDir);
    assert.equal(errors.length, 0);
  });

  it("accepts a benchmark-only spec (representative-latency) without a file in specsDir", () => {
    const errors = validateArgs({ spec: "representative-latency", repeat: 1, port: 4445 }, specsDir);
    assert.equal(errors.length, 0, `Unexpected errors: ${errors.join(", ")}`);
  });

  it("rejects null spec", () => {
    const errors = validateArgs({ spec: null, repeat: 1, port: 4445 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--spec is required")), `errors: ${errors}`);
  });

  it("rejects an unknown spec name that passes the character check", () => {
    const errors = validateArgs({ spec: "nonexistent-spec", repeat: 1, port: 4445 }, specsDir);
    assert.ok(errors.length > 0, "Expected validation error for unknown spec");
  });

  it("rejects non-integer repeat", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 1.5, port: 4445 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--repeat")), `errors: ${errors}`);
  });

  it("rejects repeat < 1", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 0, port: 4445 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--repeat")), `errors: ${errors}`);
  });

  it("rejects a non-integer port", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 1, port: NaN }, specsDir);
    assert.ok(errors.some((e) => e.includes("--port")), `errors: ${errors}`);
  });

  it("rejects a port below 1024", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 1, port: 80 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--port")), `errors: ${errors}`);
  });

  it("rejects a port above 65535", () => {
    const errors = validateArgs({ spec: "core-inventory", repeat: 1, port: 70000 }, specsDir);
    assert.ok(errors.some((e) => e.includes("--port")), `errors: ${errors}`);
  });
});

// ── resolveEmbeddedBinaryPath ─────────────────────────────────────────────────

describe("resolveEmbeddedBinaryPath", () => {
  it("returns the correct Linux binary path (no .exe)", () => {
    const path = resolveEmbeddedBinaryPath("/repo/root", "linux");
    assert.ok(
      path.endsWith("/target-embedded/release/rack-inventory-studio-desktop"),
      `Expected linux path, got: ${path}`,
    );
    assert.ok(!path.endsWith(".exe"), "Linux path must not end with .exe");
  });

  it("returns the correct Windows binary path (.exe suffix)", () => {
    const path = resolveEmbeddedBinaryPath("/repo/root", "win32");
    assert.ok(
      path.endsWith(`${sep}rack-inventory-studio-desktop.exe`) ||
        path.endsWith("/rack-inventory-studio-desktop.exe"),
      `Expected windows path with .exe, got: ${path}`,
    );
    assert.ok(path.includes("target-embedded"), "Windows path must use target-embedded");
  });

  it("includes target-embedded in the path, never target/release or target-wdio-plugin", () => {
    const path = resolveEmbeddedBinaryPath("/repo/root", "linux");
    assert.ok(path.includes("target-embedded"), `Expected target-embedded in path, got: ${path}`);
    assert.ok(!path.includes("target/release"), "Path must not contain target/release");
    assert.ok(!path.includes("target-wdio-plugin"), "Path must not reuse the wdio-plugin variant's target dir");
  });
});

// ── shouldBuildEmbedded ────────────────────────────────────────────────────────

describe("shouldBuildEmbedded", () => {
  it("returns true by default (no skip-build, no custom binary)", () => {
    assert.equal(shouldBuildEmbedded({ skipBuild: false, binary: null }), true);
  });

  it("returns false when --skip-build is set", () => {
    assert.equal(shouldBuildEmbedded({ skipBuild: true, binary: null }), false);
  });

  it("returns false when a custom --binary is provided (caller is responsible for it)", () => {
    assert.equal(shouldBuildEmbedded({ skipBuild: false, binary: "/custom/binary" }), false);
  });

  it("returns false when both --skip-build and --binary are set", () => {
    assert.equal(shouldBuildEmbedded({ skipBuild: true, binary: "/custom/binary" }), false);
  });
});

// ── buildChildEnv ─────────────────────────────────────────────────────────────

describe("buildChildEnv", () => {
  it("sets RIS_WDIO_DRIVER_PROVIDER=embedded", () => {
    const env = buildChildEnv({}, { port: 4445, binaryPath: "/bin/app" });
    assert.equal(env["RIS_WDIO_DRIVER_PROVIDER"], "embedded");
  });

  it("sets RIS_WDIO_EMBEDDED_PORT to the given port", () => {
    const env = buildChildEnv({}, { port: 5555, binaryPath: "/bin/app" });
    assert.equal(env["RIS_WDIO_EMBEDDED_PORT"], "5555");
  });

  it("sets TAURI_BINARY_PATH to the provided binary path", () => {
    const env = buildChildEnv({}, { port: 4445, binaryPath: "/my/embedded/binary" });
    assert.equal(env["TAURI_BINARY_PATH"], "/my/embedded/binary");
  });

  it("does not mutate the baseEnv object", () => {
    const base = { SOME_VAR: "original" };
    const baseCopy = { ...base };
    buildChildEnv(base, { port: 4445, binaryPath: "/bin/app" });
    assert.deepEqual(base, baseCopy, "buildChildEnv must not mutate the baseEnv argument");
  });

  it("preserves existing env vars from baseEnv", () => {
    const env = buildChildEnv({ EXISTING_VAR: "hello" }, { port: 4445, binaryPath: "/x" });
    assert.equal(env["EXISTING_VAR"], "hello");
  });

  it("replaces an inherited RIS_WDIO_DRIVER_PROVIDER=external with 'embedded'", () => {
    const env = buildChildEnv(
      { RIS_WDIO_DRIVER_PROVIDER: "external" },
      { port: 4445, binaryPath: "/bin/app" },
    );
    assert.equal(env["RIS_WDIO_DRIVER_PROVIDER"], "embedded");
  });

  it("replaces an inherited RIS_WDIO_EMBEDDED_PORT with the requested port", () => {
    const env = buildChildEnv(
      { RIS_WDIO_EMBEDDED_PORT: "9999" },
      { port: 4445, binaryPath: "/bin/app" },
    );
    assert.equal(env["RIS_WDIO_EMBEDDED_PORT"], "4445");
  });

  it("replaces an inherited TAURI_BINARY_PATH with the resolved binary path", () => {
    const env = buildChildEnv(
      { TAURI_BINARY_PATH: "/stale/binary" },
      { port: 4445, binaryPath: "/fresh/binary" },
    );
    assert.equal(env["TAURI_BINARY_PATH"], "/fresh/binary");
  });

  it("leaves baseEnv unchanged when it carries inherited controlled vars", () => {
    const base = {
      RIS_WDIO_DRIVER_PROVIDER: "external",
      RIS_WDIO_EMBEDDED_PORT: "9999",
      TAURI_BINARY_PATH: "/stale",
    };
    const baseCopy = { ...base };
    buildChildEnv(base, { port: 4445, binaryPath: "/bin/app" });
    assert.deepEqual(base, baseCopy, "buildChildEnv must not mutate baseEnv even when deleting inherited keys");
  });

  it("returns a new object, not the same reference as baseEnv", () => {
    const base = { PATH: "/usr/bin" };
    const env = buildChildEnv(base, { port: 4445, binaryPath: "/bin/app" });
    assert.notEqual(env, base);
  });
});

// ── buildRunCommand ───────────────────────────────────────────────────────────

describe("buildRunCommand — Linux", () => {
  const base = {
    nodeExe: "/usr/bin/node",
    benchmarkScript: "/repo/scripts/run-wdio-performance-benchmark.mjs",
    spec: "core-inventory",
    repeat: 2,
    binary: "/repo/target-embedded/release/rack-inventory-studio-desktop",
    continueOnFailure: false,
  };

  it("uses xvfb-run as the executable on Linux", () => {
    const { executable } = buildRunCommand({ ...base, platform: "linux" });
    assert.equal(executable, "xvfb-run");
  });

  it("passes -a as the first arg on Linux", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    assert.equal(args[0], "-a");
  });

  it("places node executable after -a on Linux", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    assert.equal(args[1], "/usr/bin/node");
  });

  it("passes --provider embedded", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    const idx = args.indexOf("--provider");
    assert.ok(idx !== -1, "--provider not found in args");
    assert.equal(args[idx + 1], "embedded");
  });

  it("passes --spec correctly", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    const idx = args.indexOf("--spec");
    assert.ok(idx !== -1, "--spec not found in args");
    assert.equal(args[idx + 1], "core-inventory");
  });

  it("passes --repeat correctly", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    const idx = args.indexOf("--repeat");
    assert.ok(idx !== -1, "--repeat not found in args");
    assert.equal(args[idx + 1], "2");
  });

  it("passes --binary correctly", () => {
    const { args } = buildRunCommand({ ...base, platform: "linux" });
    const idx = args.indexOf("--binary");
    assert.ok(idx !== -1, "--binary not found in args");
    assert.equal(args[idx + 1], base.binary);
  });

  it("includes --continue-on-failure when set", () => {
    const { args } = buildRunCommand({ ...base, continueOnFailure: true, platform: "linux" });
    assert.ok(args.includes("--continue-on-failure"), "--continue-on-failure missing");
  });

  it("omits --continue-on-failure when not set", () => {
    const { args } = buildRunCommand({ ...base, continueOnFailure: false, platform: "linux" });
    assert.ok(!args.includes("--continue-on-failure"), "--continue-on-failure should be absent");
  });
});

describe("buildRunCommand — Windows / other platforms", () => {
  const base = {
    nodeExe: "C:\\Program Files\\nodejs\\node.exe",
    benchmarkScript: "C:\\repo\\scripts\\run-wdio-performance-benchmark.mjs",
    spec: "core-inventory",
    repeat: 1,
    binary: "C:\\repo\\target-embedded\\release\\rack-inventory-studio-desktop.exe",
    continueOnFailure: false,
  };

  it("uses node as the executable on win32 (no xvfb-run)", () => {
    const { executable } = buildRunCommand({ ...base, platform: "win32" });
    assert.equal(executable, base.nodeExe);
  });

  it("does not include xvfb-run anywhere in args on win32", () => {
    const { args } = buildRunCommand({ ...base, platform: "win32" });
    assert.ok(!args.includes("xvfb-run"), "xvfb-run must not appear on Windows");
    assert.ok(!args.includes("-a"), "-a (xvfb-run flag) must not appear on Windows");
  });

  it("still passes --provider embedded on win32", () => {
    const { args } = buildRunCommand({ ...base, platform: "win32" });
    const idx = args.indexOf("--provider");
    assert.ok(idx !== -1);
    assert.equal(args[idx + 1], "embedded");
  });
});

// ── deriveExitCode ────────────────────────────────────────────────────────────

describe("deriveExitCode", () => {
  it("returns the status code from a successful child", () => {
    assert.equal(deriveExitCode({ status: 0, error: null }), 0);
  });

  it("returns the non-zero status code from a failed child", () => {
    assert.equal(deriveExitCode({ status: 1, error: null }), 1);
    assert.equal(deriveExitCode({ status: 42, error: null }), 42);
  });

  it("returns 1 when status is null (signal kill or spawn issue)", () => {
    assert.equal(deriveExitCode({ status: null, error: null }), 1);
  });

  it("returns 1 when there is a spawn error regardless of status", () => {
    assert.equal(deriveExitCode({ status: 0, error: new Error("spawn failed") }), 1);
  });
});
