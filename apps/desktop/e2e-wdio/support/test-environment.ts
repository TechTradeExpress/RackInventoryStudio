import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

// ── Constants ────────────────────────────────────────────────────────────────

const SENTINEL = "ownership-sentinel";
const PREFIX = "ris-wdio-";

/**
 * Internal env var set by the launcher to signal that isolation is fully
 * configured.  Workers also load wdio.conf.ts; they check this marker and
 * validate the inherited state rather than creating a second run root.
 *
 * This is intentionally separate from RIS_E2E_REPOSITORY_PARENT so that a
 * pre-existing RIS_E2E_REPOSITORY_PARENT from the developer's shell is
 * detected and rejected instead of silently bypassing isolation.
 */
const INITIALIZED_MARKER = "RIS_E2E_ENV_INITIALIZED";
const RUN_ROOT_VAR = "RIS_E2E_RUN_ROOT";
const REPO_PARENT_VAR = "RIS_E2E_REPOSITORY_PARENT";
const INITIALIZED_VALUE = "1";

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when candidate is a strict descendant of parent — i.e., not
 * equal to parent and not a sibling reached via "..".
 */
export function isStrictChildPath(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return (
    rel !== "" &&
    !rel.startsWith(`..${sep}`) &&
    rel !== ".." &&
    !isAbsolute(rel)
  );
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates that runRoot is a legitimate owned WDIO run root.
 *
 * Throws a descriptive error if any guard fails:
 *  - runRoot must be a strict child of the system temp dir
 *  - basename must start with "ris-wdio-"
 *  - ownership sentinel must be present
 *  - if repositoryParent is supplied, it must be a strict child of runRoot
 */
export function validateOwnedRunRoot(
  runRoot: string,
  repositoryParent?: string,
): void {
  if (!isStrictChildPath(tmpdir(), runRoot)) {
    throw new Error(
      `[test-environment] safety guard: run root is not inside tmpdir(). ` +
        `Refusing. runRoot=${runRoot} tmpdir=${tmpdir()}`,
    );
  }

  if (!basename(runRoot).startsWith(PREFIX)) {
    throw new Error(
      `[test-environment] safety guard: basename does not start with '${PREFIX}'. ` +
        `Refusing. runRoot=${runRoot}`,
    );
  }

  if (!existsSync(join(runRoot, SENTINEL))) {
    throw new Error(
      `[test-environment] safety guard: ownership sentinel not found. ` +
        `Refusing. runRoot=${runRoot}`,
    );
  }

  if (repositoryParent !== undefined) {
    if (!isStrictChildPath(runRoot, repositoryParent)) {
      throw new Error(
        `[test-environment] safety guard: repository parent is not inside run root. ` +
          `runRoot=${runRoot} repositoryParent=${repositoryParent}`,
      );
    }
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Deletes runRoot after validating all safety guards.
 *
 * Returns true if the directory was deleted, false if it was preserved
 * because keepTemp was true.
 *
 * Throws if any safety guard fails.
 */
export function cleanupOwnedRunRoot(
  runRoot: string,
  options?: { keepTemp?: boolean },
): boolean {
  if (options?.keepTemp) {
    console.log(`[test-environment] keepTemp — preserved: ${runRoot}`);
    return false;
  }

  validateOwnedRunRoot(runRoot);
  // maxRetries/retryDelay: the app process's GPU/shader cache (e.g.
  // mesa_shader_cache under Xvfb software rendering) can still be writing
  // into runRoot for a brief moment after the WDIO worker considers the
  // session closed, racing this recursive delete with ENOTEMPTY/EBUSY. Retry
  // a few times with a short backoff instead of letting a transient race
  // fail the whole cleanup (and thus the run).
  rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`[test-environment] cleaned up: ${runRoot}`);
  return true;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Initialize the isolated temporary environment for the WDIO suite.
 *
 * Call at module-load time in wdio.conf.ts (before the config export) so
 * the env vars are set before WDIO spawns workers and before tauri-driver
 * launches the Tauri binary.
 *
 * Returns a cleanup function to register in the WDIO onComplete hook.
 *
 * Three cases:
 *
 * A. Launcher — no internal marker:
 *    A pre-existing RIS_E2E_REPOSITORY_PARENT is rejected to prevent
 *    accidental bypass of isolation.  A fresh run root is created and all
 *    isolation variables are set.
 *
 * B. Worker — internal marker present:
 *    The inherited run root is validated and a no-op cleanup is returned.
 *
 * C. Stale / foreign environment — internal marker absent but
 *    RIS_E2E_REPOSITORY_PARENT set:
 *    Throws immediately.
 */
export function initTestEnvironment(): () => void {
  const isInitialized =
    process.env[INITIALIZED_MARKER] === INITIALIZED_VALUE;

  // ── B. Worker process ─────────────────────────────────────────────────────
  if (isInitialized) {
    const inheritedRoot = process.env[RUN_ROOT_VAR];
    const inheritedRepoParent = process.env[REPO_PARENT_VAR];

    if (!inheritedRoot) {
      throw new Error(
        `[test-environment] ${INITIALIZED_MARKER}=${INITIALIZED_VALUE} is set ` +
          `but ${RUN_ROOT_VAR} is missing. Cannot validate inherited environment.`,
      );
    }
    if (!inheritedRepoParent) {
      throw new Error(
        `[test-environment] ${INITIALIZED_MARKER}=${INITIALIZED_VALUE} is set ` +
          `but ${REPO_PARENT_VAR} is missing. Cannot validate inherited environment.`,
      );
    }

    validateOwnedRunRoot(inheritedRoot, inheritedRepoParent);

    // Workers don't own cleanup — return no-op.
    return () => {};
  }

  // ── C. Foreign environment ────────────────────────────────────────────────
  if (process.env[REPO_PARENT_VAR]) {
    throw new Error(
      `[test-environment] ${REPO_PARENT_VAR} is already set ` +
        `without a valid ${INITIALIZED_MARKER} marker. ` +
        `Refusing to bypass the isolated WDIO test environment. ` +
        `Unset the variable and rerun.`,
    );
  }

  // ── A. Launcher process ───────────────────────────────────────────────────
  const runRoot = mkdtempSync(join(tmpdir(), PREFIX));

  // Write sentinel before any other work so guards can fire even on partial setup.
  writeFileSync(join(runRoot, SENTINEL), "ris-wdio-test-environment\n");

  const appConfig = join(runRoot, "app-config");
  const appData = join(runRoot, "app-data");
  const appCache = join(runRoot, "app-cache");
  const appLocalData = join(runRoot, "app-local-data");
  const appHome = join(runRoot, "home");
  const gitDir = join(runRoot, "git");
  const repoParent = join(runRoot, "repositories");

  for (const dir of [
    appConfig,
    appData,
    appCache,
    appLocalData,
    appHome,
    gitDir,
    repoParent,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  // Minimal git identity so `git init` + any initial commit does not fail.
  const gitConfig = join(gitDir, "config");
  writeFileSync(
    gitConfig,
    "[user]\n\tname = Rack Inventory Studio E2E\n\temail = e2e@localhost.invalid\n",
  );

  // Linux XDG dirs — isolate WebKit localStorage and Tauri app data.
  process.env["XDG_CONFIG_HOME"] = appConfig;
  process.env["XDG_DATA_HOME"] = appData;
  process.env["XDG_CACHE_HOME"] = appCache;

  // Windows equivalents (no-op on Linux; harmless to set).
  process.env["APPDATA"] = appData;
  process.env["LOCALAPPDATA"] = appLocalData;

  // HOME — isolate tools that read ~/.config, ~/.gitconfig, etc.
  process.env["HOME"] = appHome;

  // Git isolation — never touch the real global config.
  process.env["GIT_CONFIG_GLOBAL"] = gitConfig;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";

  // Internal markers (read by worker processes).
  process.env[RUN_ROOT_VAR] = runRoot;
  process.env[REPO_PARENT_VAR] = repoParent;
  process.env[INITIALIZED_MARKER] = INITIALIZED_VALUE;

  console.log(`[test-environment] run root: ${runRoot}`);

  return () => {
    cleanupOwnedRunRoot(runRoot, {
      keepTemp: process.env["RIS_E2E_KEEP_TEMP"] === "1",
    });
  };
}
