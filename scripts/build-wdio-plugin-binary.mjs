#!/usr/bin/env node
/**
 * Builds the wdio-plugin test binary — a separate, opt-in Tauri build
 * variant with tauri-plugin-wdio registered (see
 * docs/E2E_WDIO_LATENCY_OPTIMIZATION.md §11 for why this exists: without
 * it, @wdio/tauri-service retries a plugin-availability probe up to 100
 * times on every findElement/elementClick/getTitle/$/$$ command).
 *
 * Never touches the regular target/release binary: builds into its own
 * CARGO_TARGET_DIR (target-wdio-plugin/) so a normal `cargo build`/
 * `tauri build` elsewhere in the repo — and the production binary it
 * produces — is completely unaffected. Only the spawned build child
 * process sees VITE_WDIO_PLUGIN/CARGO_TARGET_DIR; this script's own shell
 * session (process.env) is never mutated.
 *
 * Usage:
 *   node scripts/build-wdio-plugin-binary.mjs
 *
 * Exit codes:
 *   0  success — binary built and verified at target-wdio-plugin/release/
 *   1  build failed, binary missing after a reported success, or the
 *      resolved binary path is inconsistent with the wdio-plugin variant
 *   N  the build process's own non-zero exit code, when available
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join, win32, posix } from "node:path";
import { fileURLToPath } from "node:url";

// ── Constants ────────────────────────────────────────────────────────────────

export const TARGET_DIR_NAME = "target-wdio-plugin";
export const CONFIG_RELATIVE_PATH = "src-tauri/tauri.wdio-plugin.conf.json";
export const BINARY_NAME = "rack-inventory-studio-desktop";

// ── Pure helpers (unit tested — no process spawned, no real build) ─────────────

/**
 * Selects the path implementation matching an explicit target platform,
 * independent of the host OS running this code — `join` from bare
 * "node:path" is bound to the host at import time, so it cannot be used
 * wherever a `platform` argument is meant to control the output format.
 */
function pathApiForPlatform(platform) {
  return platform === "win32" ? win32 : posix;
}

/** Absolute path to the wdio-plugin CARGO_TARGET_DIR, given the repo root. */
export function resolveTargetDir(repoRoot, platform = process.platform) {
  return pathApiForPlatform(platform).join(repoRoot, TARGET_DIR_NAME);
}

/** Absolute path to the built binary, given the target dir and platform. */
export function resolveBinaryPath(targetDir, platform = process.platform) {
  const name = platform === "win32" ? `${BINARY_NAME}.exe` : BINARY_NAME;
  return pathApiForPlatform(platform).join(targetDir, "release", name);
}

/**
 * True if `binaryPath` falls under the regular (non-wdio-plugin)
 * target/release directory rather than target-wdio-plugin/release/ — i.e.
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
 * environment (a shallow copy — never mutated) plus VITE_WDIO_PLUGIN and
 * CARGO_TARGET_DIR. The caller's own process.env is never touched; these
 * variables exist only for the spawned build child.
 */
export function buildChildEnv(baseEnv, repoRoot) {
  return {
    ...baseEnv,
    VITE_WDIO_PLUGIN: "true",
    CARGO_TARGET_DIR: resolveTargetDir(repoRoot),
  };
}

/** Argument list for `pnpm -C apps/desktop tauri build ...`. */
export function buildTauriArgs() {
  return [
    "-C",
    "apps/desktop",
    "tauri",
    "build",
    "--no-bundle",
    "--features",
    "wdio-plugin",
    "--config",
    CONFIG_RELATIVE_PATH,
  ];
}

/**
 * Resolves the final exit code/reason from a completed (or failed-to-spawn)
 * build attempt. Pure — takes already-observed facts, makes no I/O calls of
 * its own, so the propagation logic (spawn error -> exit 1, non-zero build
 * exit -> propagate it, success-but-missing-binary -> exit 1) is testable
 * without ever spawning a real process.
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
  const configPath = join(repoRoot, "apps", "desktop", CONFIG_RELATIVE_PATH);

  if (!existsSync(configPath)) {
    console.error(`[build-wdio-plugin-binary] Config file not found: ${configPath}`);
    process.exit(1);
  }

  const targetDir = resolveTargetDir(repoRoot);
  const binaryPath = resolveBinaryPath(targetDir);

  if (isRegularTargetPath(binaryPath, repoRoot)) {
    // Unreachable given resolveTargetDir always returns target-wdio-plugin/,
    // but guarded explicitly per the stated contract: never build the
    // plugin variant into the regular target/release directory.
    console.error(
      `[build-wdio-plugin-binary] Refusing to build: resolved binary path "${binaryPath}" ` +
        `falls under the regular target/release directory.`,
    );
    process.exit(1);
  }

  const childEnv = buildChildEnv(process.env, repoRoot);
  const args = buildTauriArgs();

  console.log(`[build-wdio-plugin-binary] repo root: ${repoRoot}`);
  console.log(`[build-wdio-plugin-binary] CARGO_TARGET_DIR: ${childEnv.CARGO_TARGET_DIR}`);
  console.log(`[build-wdio-plugin-binary] config: ${CONFIG_RELATIVE_PATH}`);
  console.log(`[build-wdio-plugin-binary] running: pnpm ${args.join(" ")}`);

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
    console.error(`[build-wdio-plugin-binary] ${reason}`);
  }
  if (exitCode === 0) {
    console.log(`[build-wdio-plugin-binary] Built application at: ${binaryPath}`);
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
