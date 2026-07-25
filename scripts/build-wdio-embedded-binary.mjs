#!/usr/bin/env node
/**
 * Builds the wdio-embedded test binary — a separate, opt-in Tauri build
 * variant with tauri-plugin-wdio-webdriver's in-process W3C WebDriver HTTP
 * server compiled in (RIS_WDIO_DRIVER_PROVIDER=embedded; see
 * apps/desktop/src-tauri/src/lib.rs and Cargo.toml's wdio-embedded feature).
 *
 * Never touches the regular target/release binary, nor the wdio-plugin
 * variant's target-wdio-plugin/: builds into its own CARGO_TARGET_DIR
 * (target-embedded/) so a normal `cargo build`/`tauri build` elsewhere in
 * the repo — and the production binary it produces — is completely
 * unaffected. Only the spawned build child process sees CARGO_TARGET_DIR;
 * this script's own shell session (process.env) is never mutated.
 *
 * Unlike the wdio-plugin variant, no committed Tauri config override is
 * needed: build.rs (apps/desktop/src-tauri/build.rs) generates
 * capabilities/embedded-test.json itself, conditioned on the
 * CARGO_FEATURE_WDIO_EMBEDDED env var Cargo sets automatically for
 * `--features wdio-embedded`, and the file is gitignored between builds.
 *
 * Usage:
 *   node scripts/build-wdio-embedded-binary.mjs
 *
 * Exit codes:
 *   0  success — binary built and verified at target-embedded/release/
 *   1  build failed, binary missing after a reported success, or the
 *      resolved binary path is inconsistent with the wdio-embedded variant
 *   N  the build process's own non-zero exit code, when available
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

export const TARGET_DIR_NAME = "target-embedded";
export const BINARY_NAME = "rack-inventory-studio-desktop";

// ── Pure helpers (unit tested — no process spawned, no real build) ─────────────

/** Absolute path to the wdio-embedded CARGO_TARGET_DIR, given the repo root. */
export function resolveTargetDir(repoRoot) {
  return join(repoRoot, TARGET_DIR_NAME);
}

/** Absolute path to the built binary, given the target dir and platform. */
export function resolveBinaryPath(targetDir, platform = process.platform) {
  const name = platform === "win32" ? `${BINARY_NAME}.exe` : BINARY_NAME;
  return join(targetDir, "release", name);
}

/**
 * True if `binaryPath` falls under the regular (non-wdio-embedded)
 * target/release directory rather than target-embedded/release/ — i.e.
 * this build would silently overwrite the production binary. Compares
 * resolved, separator-normalized absolute paths so mixed `/`/`\` input on
 * either platform still compares correctly.
 */
export function isRegularTargetPath(binaryPath, repoRoot) {
  const norm = (p) => resolve(p).toLowerCase().replace(/\\/g, "/");
  const resolved = norm(binaryPath);
  const regularTargetRelease = norm(join(repoRoot, "target", "release"));
  return resolved === regularTargetRelease || resolved.startsWith(`${regularTargetRelease}/`);
}

/**
 * Builds the child-process environment for the build command: the base
 * environment (a shallow copy — never mutated) plus CARGO_TARGET_DIR. The
 * caller's own process.env is never touched; this variable exists only for
 * the spawned build child.
 */
export function buildChildEnv(baseEnv, repoRoot) {
  return {
    ...baseEnv,
    CARGO_TARGET_DIR: resolveTargetDir(repoRoot),
  };
}

/** Argument list for `pnpm -C apps/desktop tauri build ...`. */
export function buildTauriArgs() {
  return ["-C", "apps/desktop", "tauri", "build", "--no-bundle", "--features", "wdio-embedded"];
}

/**
 * Resolves the final exit code/reason from a completed (or failed-to-spawn)
 * build attempt. Pure — takes already-observed facts, makes no I/O calls of
 * its own, so the propagation logic (spawn error -> exit 1, non-zero build
 * exit -> propagate it, success-but-missing-binary -> exit 1) is testable
 * without ever spawning a real process. Mirrors
 * build-wdio-plugin-binary.mjs's determineExitCode.
 */
export function determineExitCode({ spawnError, exitStatus, binaryExists }) {
  if (spawnError) {
    return { exitCode: 1, reason: `failed to spawn build process: ${spawnError.message}` };
  }
  if (exitStatus !== 0) {
    return { exitCode: exitStatus ?? 1, reason: `build failed with exit code ${exitStatus}` };
  }
  if (!binaryExists) {
    return {
      exitCode: 1,
      reason: "build reported success but the expected binary is missing",
    };
  }
  return { exitCode: 0, reason: null };
}

// ── Main (side-effecting — not unit tested) ─────────────────────────────────

function main() {
  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const repoRoot = resolve(scriptDir, "..");

  const targetDir = resolveTargetDir(repoRoot);
  const binaryPath = resolveBinaryPath(targetDir);

  if (isRegularTargetPath(binaryPath, repoRoot)) {
    // Unreachable given resolveTargetDir always returns target-embedded/,
    // but guarded explicitly per the stated contract: never build the
    // embedded variant into the regular target/release directory.
    console.error(
      `[build-wdio-embedded-binary] Refusing to build: resolved binary path "${binaryPath}" ` +
        `falls under the regular target/release directory.`,
    );
    process.exit(1);
  }

  const childEnv = buildChildEnv(process.env, repoRoot);
  const args = buildTauriArgs();

  console.log(`[build-wdio-embedded-binary] repo root: ${repoRoot}`);
  console.log(`[build-wdio-embedded-binary] CARGO_TARGET_DIR: ${childEnv.CARGO_TARGET_DIR}`);
  console.log(`[build-wdio-embedded-binary] build variant: wdio-embedded`);
  console.log(`[build-wdio-embedded-binary] running: pnpm ${args.join(" ")}`);

  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    env: childEnv,
    stdio: "inherit",
    shell: true,
  });

  const binaryExists = existsSync(binaryPath);
  const { exitCode, reason } = determineExitCode({
    spawnError: result.error,
    exitStatus: result.status,
    binaryExists,
  });

  if (reason) {
    console.error(`[build-wdio-embedded-binary] ${reason}`);
  }
  if (exitCode === 0) {
    console.log(`[build-wdio-embedded-binary] Built application at: ${binaryPath}`);
  }
  process.exit(exitCode);
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}
