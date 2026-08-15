// Unit tests for the pure logic in scripts/build-wdio-plugin-binary.mjs.
// No real Tauri build is ever run here — only path resolution, env
// construction, and exit-code determination.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, win32, posix } from "node:path";

import {
  TARGET_DIR_NAME,
  CONFIG_RELATIVE_PATH,
  resolveTargetDir,
  resolveBinaryPath,
  isRegularTargetPath,
  buildChildEnv,
  buildTauriArgs,
  determineExitCode,
} from "./build-wdio-plugin-binary.mjs";

const WIN_REPO_ROOT = "C:\\ris\\RackInventoryStudio";
const LINUX_REPO_ROOT = "/home/dev/RackInventoryStudio";
const MAC_REPO_ROOT = "/Users/dev/RackInventoryStudio";
const SPACEY_WIN_REPO_ROOT = "C:\\Users\\dev user\\Rack Inventory Studio";
const SPACEY_LINUX_REPO_ROOT = "/home/dev user/Rack Inventory Studio";

// These tests must prove the cross-platform contract regardless of which OS
// they happen to run on — expected values are built with the explicit
// path.win32/path.posix APIs, never the host-bound bare `join` from
// "node:path", so a test run on Windows cannot accidentally validate itself
// against the same host-bound bug it's meant to catch.

describe("resolveTargetDir", () => {
  it("never uses target/ (the regular, non-wdio-plugin dir)", () => {
    const dir = resolveTargetDir(LINUX_REPO_ROOT, "linux");
    assert.ok(!dir.endsWith(`${LINUX_REPO_ROOT}/target`));
  });

  it("win32: produces a backslash-separated path under target-wdio-plugin", () => {
    const dir = resolveTargetDir(WIN_REPO_ROOT, "win32");
    assert.equal(dir, win32.join(WIN_REPO_ROOT, TARGET_DIR_NAME));
    assert.equal(dir, `${WIN_REPO_ROOT}\\target-wdio-plugin`);
  });

  it("linux: produces a forward-slash-separated path under target-wdio-plugin", () => {
    const dir = resolveTargetDir(LINUX_REPO_ROOT, "linux");
    assert.equal(dir, posix.join(LINUX_REPO_ROOT, TARGET_DIR_NAME));
    assert.equal(dir, `${LINUX_REPO_ROOT}/target-wdio-plugin`);
  });

  it("darwin: produces a forward-slash-separated path, same as linux", () => {
    const dir = resolveTargetDir(MAC_REPO_ROOT, "darwin");
    assert.equal(dir, posix.join(MAC_REPO_ROOT, TARGET_DIR_NAME));
    assert.equal(dir, `${MAC_REPO_ROOT}/target-wdio-plugin`);
  });

  it("defaults to process.platform when no platform argument is given", () => {
    const dir = resolveTargetDir(LINUX_REPO_ROOT);
    assert.equal(dir, pathApiForCurrentPlatform().join(LINUX_REPO_ROOT, TARGET_DIR_NAME));
  });

  it("win32: repo roots containing spaces are preserved verbatim", () => {
    const dir = resolveTargetDir(SPACEY_WIN_REPO_ROOT, "win32");
    assert.equal(dir, `${SPACEY_WIN_REPO_ROOT}\\target-wdio-plugin`);
  });

  it("linux: repo roots containing spaces are preserved verbatim", () => {
    const dir = resolveTargetDir(SPACEY_LINUX_REPO_ROOT, "linux");
    assert.equal(dir, `${SPACEY_LINUX_REPO_ROOT}/target-wdio-plugin`);
  });
});

describe("resolveBinaryPath", () => {
  it("resolves the Windows binary path with .exe using backslashes, even off a POSIX-style target dir", () => {
    const targetDir = resolveTargetDir(WIN_REPO_ROOT, "win32");
    const binPath = resolveBinaryPath(targetDir, "win32");
    assert.equal(
      binPath,
      `${WIN_REPO_ROOT}\\target-wdio-plugin\\release\\rack-inventory-studio-desktop.exe`,
    );
  });

  it("resolves the Linux binary path without an extension, using forward slashes throughout", () => {
    const targetDir = resolveTargetDir(LINUX_REPO_ROOT, "linux");
    const binPath = resolveBinaryPath(targetDir, "linux");
    assert.equal(
      binPath,
      `${LINUX_REPO_ROOT}/target-wdio-plugin/release/rack-inventory-studio-desktop`,
    );
    assert.ok(!binPath.endsWith(".exe"));
  });

  it("resolves the darwin binary path the same way as linux (no .exe, forward slashes)", () => {
    const targetDir = resolveTargetDir(MAC_REPO_ROOT, "darwin");
    const binPath = resolveBinaryPath(targetDir, "darwin");
    assert.equal(
      binPath,
      `${MAC_REPO_ROOT}/target-wdio-plugin/release/rack-inventory-studio-desktop`,
    );
    assert.ok(!binPath.endsWith(".exe"));
  });

  it("requesting a platform explicitly produces that platform's separators even when it differs from the host", () => {
    // Regression test for the historical bug: resolveBinaryPath/resolveTargetDir
    // used the bare, host-bound `join` from "node:path", so an explicit
    // platform argument only ever controlled the .exe suffix, never the
    // separator style — a "linux" request on a Windows host still produced
    // backslashes. This must hold true independent of process.platform.
    const linuxTargetDir = resolveTargetDir(LINUX_REPO_ROOT, "linux");
    const linuxBinPath = resolveBinaryPath(linuxTargetDir, "linux");
    assert.equal(linuxBinPath.includes("\\"), false, `expected no backslashes, got: ${linuxBinPath}`);

    const winTargetDir = resolveTargetDir(WIN_REPO_ROOT, "win32");
    const winBinPath = resolveBinaryPath(winTargetDir, "win32");
    assert.equal(winBinPath.includes("/"), false, `expected no forward slashes, got: ${winBinPath}`);
  });

  it("win32: paths containing spaces are preserved verbatim", () => {
    const targetDir = resolveTargetDir(SPACEY_WIN_REPO_ROOT, "win32");
    const binPath = resolveBinaryPath(targetDir, "win32");
    assert.equal(
      binPath,
      `${SPACEY_WIN_REPO_ROOT}\\target-wdio-plugin\\release\\rack-inventory-studio-desktop.exe`,
    );
  });

  it("linux: paths containing spaces are preserved verbatim", () => {
    const targetDir = resolveTargetDir(SPACEY_LINUX_REPO_ROOT, "linux");
    const binPath = resolveBinaryPath(targetDir, "linux");
    assert.equal(
      binPath,
      `${SPACEY_LINUX_REPO_ROOT}/target-wdio-plugin/release/rack-inventory-studio-desktop`,
    );
  });
});

/** Mirrors resolveTargetDir/resolveBinaryPath's own default-platform selection, for the one test that intentionally omits the platform argument. */
function pathApiForCurrentPlatform() {
  return process.platform === "win32" ? win32 : posix;
}

describe("isRegularTargetPath", () => {
  it("rejects a binary path under the regular target/release directory", () => {
    const badPath = join(WIN_REPO_ROOT, "target", "release", "rack-inventory-studio-desktop.exe");
    assert.equal(isRegularTargetPath(badPath, WIN_REPO_ROOT), true);
  });

  it("accepts a binary path under target-wdio-plugin/release", () => {
    const goodPath = join(WIN_REPO_ROOT, "target-wdio-plugin", "release", "rack-inventory-studio-desktop.exe");
    assert.equal(isRegularTargetPath(goodPath, WIN_REPO_ROOT), false);
  });

  it("compares correctly across mixed path separators", () => {
    const badPathMixed = `${WIN_REPO_ROOT.replace(/\\/g, "/")}/target/release/rack-inventory-studio-desktop.exe`;
    assert.equal(isRegularTargetPath(badPathMixed, WIN_REPO_ROOT), true);
  });

  it("does not false-positive on a directory name that merely starts with 'target' (e.g. target-wdio-plugin)", () => {
    const goodPath = join(WIN_REPO_ROOT, "target-wdio-plugin", "release", "rack-inventory-studio-desktop.exe");
    assert.equal(isRegularTargetPath(goodPath, WIN_REPO_ROOT), false);
  });
});

describe("buildChildEnv", () => {
  it("sets VITE_WDIO_PLUGIN=true and a target-wdio-plugin CARGO_TARGET_DIR", () => {
    const base = { PATH: "/usr/bin", EXISTING: "1" };
    const env = buildChildEnv(base, LINUX_REPO_ROOT);
    assert.equal(env.VITE_WDIO_PLUGIN, "true");
    assert.equal(env.CARGO_TARGET_DIR, resolveTargetDir(LINUX_REPO_ROOT));
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.EXISTING, "1");
  });

  it("never mutates the base environment object passed in", () => {
    const base = { PATH: "/usr/bin" };
    const snapshot = { ...base };
    buildChildEnv(base, LINUX_REPO_ROOT);
    assert.deepEqual(base, snapshot, "the caller's environment object must be left untouched");
    assert.equal(base.VITE_WDIO_PLUGIN, undefined, "VITE_WDIO_PLUGIN must not leak into the base env object");
  });

  it("returns a new object, not the same reference as the base env", () => {
    const base = { PATH: "/usr/bin" };
    const env = buildChildEnv(base, LINUX_REPO_ROOT);
    assert.notEqual(env, base);
  });
});

describe("buildTauriArgs", () => {
  it("builds the expected pnpm tauri build argument list", () => {
    const args = buildTauriArgs();
    assert.deepEqual(args, [
      "-C",
      "apps/desktop",
      "tauri",
      "build",
      "--no-bundle",
      "--features",
      "wdio-plugin",
      "--config",
      CONFIG_RELATIVE_PATH,
    ]);
  });

  it("references the committed config file, not a temp file", () => {
    const args = buildTauriArgs();
    const configArgIndex = args.indexOf("--config") + 1;
    assert.equal(args[configArgIndex], "src-tauri/tauri.wdio-plugin.conf.json");
    assert.ok(!args[configArgIndex].includes(".tmp"));
  });
});

describe("determineExitCode", () => {
  it("returns 0 when the build succeeded and the binary exists", () => {
    const result = determineExitCode({ spawnError: null, exitStatus: 0, binaryExists: true });
    assert.equal(result.exitCode, 0);
    assert.equal(result.reason, null);
  });

  it("propagates a spawn error as exit code 1 with a descriptive reason", () => {
    const result = determineExitCode({
      spawnError: new Error("ENOENT: pnpm not found"),
      exitStatus: null,
      binaryExists: false,
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.reason, /failed to spawn/);
    assert.match(result.reason, /ENOENT/);
  });

  it("propagates the build process's own non-zero exit code", () => {
    const result = determineExitCode({ spawnError: null, exitStatus: 2, binaryExists: false });
    assert.equal(result.exitCode, 2);
    assert.match(result.reason, /exit code 2/);
  });

  it("falls back to exit code 1 when the process exit status is null (e.g. killed by signal)", () => {
    const result = determineExitCode({ spawnError: null, exitStatus: null, binaryExists: false });
    assert.equal(result.exitCode, 1);
  });

  it("fails with exit code 1 when the build reports success but the binary is missing", () => {
    const result = determineExitCode({ spawnError: null, exitStatus: 0, binaryExists: false });
    assert.equal(result.exitCode, 1);
    assert.match(result.reason, /binary is missing/);
  });
});
