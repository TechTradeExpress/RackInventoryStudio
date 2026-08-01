/**
 * Isolated local Git fixture infrastructure for WDIO E2E (Stage 3F.0.5).
 *
 * Provides the building blocks future local Git workflow specs (Stage 3F.1)
 * will use: a controlled `git` execution helper, a repository-fixture
 * builder, and minimal repository-state inspection functions.
 *
 * This module does not test any Git workflow itself (init/commit/push/
 * pull/...) — it only prepares the ground. No remote, SSH, or network
 * operation is performed anywhere here.
 *
 * Every git process spawned by runGit() inherits process.env, which by the
 * time any spec or worker runs already carries the isolation variables set
 * by test-environment.ts's initTestEnvironment() — HOME, GIT_CONFIG_GLOBAL,
 * GIT_CONFIG_NOSYSTEM, XDG_CONFIG_HOME — so no real user Git config,
 * credential helper, SSH config, or alias is ever consulted. This module
 * additionally always sets user.name/user.email locally (never --global)
 * on every repository it creates, so commits never depend on either the
 * isolated test-environment identity or a real developer's global config.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { isStrictChildPath } from "./test-environment";

// ── Controlled git execution ─────────────────────────────────────────────────

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: 0;
}

export interface RunGitOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Redacts credentials that may appear in Git's own stdout/stderr (e.g. a
 * URL containing embedded userinfo) before they reach a test failure
 * message or log. Mirrors the intent of ris-git's redact_git_error
 * (crates/ris-git/src/lib.rs), at the simpler level this test-only helper
 * needs — no remote/SSH operations happen in this stage, so only the
 * generic HTTPS-userinfo case is covered.
 */
function redact(text: string): string {
  return text.replace(/(https?:\/\/)[^/\s@]+@/gi, "$1[redacted]@");
}

export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    info: { args: readonly string[]; cwd: string; exitCode: number | null; stdout: string; stderr: string },
  ) {
    super(message);
    this.name = "GitCommandError";
    this.args = info.args;
    this.cwd = info.cwd;
    this.exitCode = info.exitCode;
    this.stdout = info.stdout;
    this.stderr = info.stderr;
  }
}

/**
 * Runs `git <args>` in `cwd` under the isolated test environment (see
 * module doc comment) with no shell interpolation.
 *
 * Resolves with stdout/stderr/exitCode 0 on success. Rejects with a
 * GitCommandError — carrying args, cwd, exitCode, stdout, and stderr — on a
 * non-zero exit, a spawn failure, or a timeout, with a diagnostic message
 * covering all three cases.
 */
export function runGit(cwd: string, args: string[], options: RunGitOptions = {}): Promise<GitCommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd, env: process.env, timeout: timeoutMs, killSignal: "SIGKILL", windowsHide: true },
      (error, stdoutRaw, stderrRaw) => {
        const stdout = stdoutRaw.toString();
        const stderr = redact(stderrRaw.toString());

        if (error) {
          const err = error as NodeJS.ErrnoException & { killed?: boolean };
          const exitCode = typeof err.code === "number" ? err.code : null;
          const reason = err.killed
            ? `timed out after ${timeoutMs}ms`
            : exitCode !== null
              ? `exited with code ${exitCode}`
              : `failed to spawn (${err.message})`;
          reject(
            new GitCommandError(
              `[local-git] git ${args.join(" ")} ${reason} in ${cwd}${stderr ? `: ${stderr}` : ""}`,
              { args, cwd, exitCode, stdout, stderr },
            ),
          );
          return;
        }

        resolve({ stdout, stderr, exitCode: 0 });
      },
    );
  });
}

// ── Repository fixture builder ───────────────────────────────────────────────

export interface CreateLocalGitRepositoryOptions {
  /** Parent directory the fixture is created under. Defaults to
   * RIS_E2E_REPOSITORY_PARENT (set by test-environment.ts). */
  parent?: string;
  /** Run `git init` and set local user.name/user.email. Default true.
   * Forced true when initialCommit is true. */
  initialized?: boolean;
  /** Write the minimal RackInventoryStudio scaffold — repo.yaml,
   * locations.yaml, and empty racks/device-models/devices/placements
   * directories — mirroring what crates/ris-application/src/create.rs's
   * create_repository writes. The four directories are required to exist
   * for VAL-REPO-004 (crates/ris-validation/src/validators/repository.rs)
   * to pass, even though the *loader* (ris-repository) tolerates their
   * absence — see writeMinimalRisFixture's own comment. Default true. */
  fixture?: boolean;
  /** Stage and commit the fixture (or a placeholder file if fixture is
   * false) as an initial commit. Implies initialized. Default false. */
  initialCommit?: boolean;
  /** Leave an uncommitted working-tree change after setup. Default false. */
  dirty?: boolean;
  userName?: string;
  userEmail?: string;
  /** Short label folded into the generated directory/repo code, for
   * readability in failure output. */
  label?: string;
}

export interface LocalGitRepository {
  path: string;
  repoCode: string;
  initialized: boolean;
  initialCommitSha: string | null;
  cleanup: () => Promise<void>;
}

const DEFAULT_USER_NAME = "RIS WDIO Local Git Fixture";
const DEFAULT_USER_EMAIL = "wdio-local-git@localhost.invalid";

function resolveParent(explicit: string | undefined): string {
  const parent = explicit ?? process.env["RIS_E2E_REPOSITORY_PARENT"];
  if (!parent) {
    throw new Error(
      "[local-git] no parent directory supplied and RIS_E2E_REPOSITORY_PARENT is not set. " +
        "Run via WDIO with the test-environment initialized in wdio.conf.ts, or pass { parent }.",
    );
  }
  return parent;
}

function writeMinimalRisFixture(repoPath: string, repoCode: string, repoName: string): void {
  const inventoryDir = join(repoPath, "inventory");
  mkdirSync(inventoryDir, { recursive: true });
  const repoYaml =
    "format: rack-inventory-studio\n" +
    "version: '0.1'\n" +
    "repository:\n" +
    `  id: ${randomBytes(8).toString("hex")}\n` +
    `  code: ${repoCode}\n` +
    `  name: ${repoName}\n`;
  writeFileSync(join(inventoryDir, "repo.yaml"), repoYaml);
  writeFileSync(join(inventoryDir, "locations.yaml"), "locations: []\n");
  // The loader (ris-repository) tolerates these being absent entirely — an
  // empty glob read. The *validator* does not: VAL-REPO-004
  // (crates/ris-validation/src/validators/repository.rs) is an ERROR-level
  // check that each of these paths exists, found while implementing Stage
  // 3F.1B's own Validate workflow spec (a fixture missing all four failed
  // validation with 4 errors, blocking the "Validate" step from ever
  // succeeding). Creating them empty here matches what the app's own
  // "Create repository" wizard does (crates/ris-application/src/create.rs).
  for (const dir of ["racks", "device-models", "devices", "placements"]) {
    mkdirSync(join(inventoryDir, dir), { recursive: true });
  }
}

/**
 * Validates that `path` is a strict descendant of the isolated
 * RIS_E2E_RUN_ROOT before allowing a delete — reusing the same ownership
 * boundary test-environment.ts's own cleanup relies on
 * (isStrictChildPath), rather than introducing a second, parallel safety
 * mechanism. Throws instead of deleting when the guard fails.
 */
function assertPathIsCleanupSafe(path: string): void {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) {
    throw new Error(
      `[local-git] safety guard: RIS_E2E_RUN_ROOT is not set — refusing to clean up ` +
        `${path} because there is no isolated root to validate it against.`,
    );
  }
  if (!isStrictChildPath(runRoot, path)) {
    throw new Error(
      `[local-git] safety guard: refusing to remove a path outside the isolated WDIO run root. ` +
        `runRoot=${runRoot} path=${path}`,
    );
  }
}

/**
 * Creates a Git repository fixture in an isolated temp directory for future
 * local Git workflow specs (Stage 3F.1). See the module doc comment for the
 * environment isolation guarantee every git subprocess runs under.
 *
 * This is an example call, not a mandatory signature:
 *   createLocalGitRepository({ initialized: true, initialCommit: true, dirty: false })
 */
export async function createLocalGitRepository(
  options: CreateLocalGitRepositoryOptions = {},
): Promise<LocalGitRepository> {
  const parent = resolveParent(options.parent);
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const repoCode = `${options.label ?? "git-fixture"}-${suffix}`;
  const repoPath = join(parent, repoCode);

  mkdirSync(repoPath, { recursive: true });

  const initialCommit = options.initialCommit ?? false;
  const initialized = initialCommit ? true : (options.initialized ?? true);
  const fixture = options.fixture ?? true;

  if (initialized) {
    await runGit(repoPath, ["init"]);
    // Always local (never --global) — see module doc comment.
    await runGit(repoPath, ["config", "user.name", options.userName ?? DEFAULT_USER_NAME]);
    await runGit(repoPath, ["config", "user.email", options.userEmail ?? DEFAULT_USER_EMAIL]);
  }

  if (fixture) {
    writeMinimalRisFixture(repoPath, repoCode, `WDIO Local Git ${suffix}`);
  } else if (initialCommit) {
    // Nothing to commit otherwise — leave a minimal placeholder file.
    writeFileSync(join(repoPath, "README.md"), `# ${repoCode}\n`);
  }

  let initialCommitSha: string | null = null;
  if (initialCommit) {
    await runGit(repoPath, ["add", "-A"]);
    await runGit(repoPath, ["commit", "-m", "Initial commit"]);
    const head = await runGit(repoPath, ["rev-parse", "HEAD"]);
    initialCommitSha = head.stdout.trim();
  }

  if (options.dirty) {
    const marker = `# dirty marker ${suffix}\n`;
    if (fixture) {
      appendFileSync(join(repoPath, "inventory", "locations.yaml"), marker);
    } else {
      writeFileSync(join(repoPath, "DIRTY.md"), marker);
    }
  }

  async function cleanup(): Promise<void> {
    assertPathIsCleanupSafe(repoPath);
    if (!existsSync(repoPath)) return; // idempotent
    await rm(repoPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }

  return { path: repoPath, repoCode, initialized, initialCommitSha, cleanup };
}

// ── Repository state inspection ──────────────────────────────────────────────
//
// Only the functions Stage 3F.1's planned local workflows (init, status,
// commit, add-remote) actually need — see docs/E2E_WDIO_PLAN.md's Stage
// 3F.0.5 section for the full rationale. Deliberately not implemented here:
// merge/rebase/stash/tag/fetch/SSH/credential inspection.

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const result = await runGit(path, ["rev-parse", "--is-inside-work-tree"]);
    return result.stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Uses `symbolic-ref` rather than `rev-parse --abbrev-ref HEAD` because the
 * latter fails on an unborn HEAD (`git init` with no commit yet, exit 128 —
 * "ambiguous argument 'HEAD'"), a real state Stage 3F.1A's own detection/init
 * specs exercise. `symbolic-ref --short HEAD` resolves correctly both before
 * and after the first commit. */
export async function getCurrentBranch(path: string): Promise<string> {
  const result = await runGit(path, ["symbolic-ref", "--short", "HEAD"]);
  return result.stdout.trim();
}

export async function getHeadCommit(path: string): Promise<string> {
  const result = await runGit(path, ["rev-parse", "HEAD"]);
  return result.stdout.trim();
}

export async function getCommitCount(path: string): Promise<number> {
  const result = await runGit(path, ["rev-list", "--count", "HEAD"]);
  return Number.parseInt(result.stdout.trim(), 10);
}

export type WorkingTreeStatus = "clean" | "dirty";

export async function getWorkingTreeStatus(path: string): Promise<WorkingTreeStatus> {
  const result = await runGit(path, ["status", "--porcelain"]);
  return result.stdout.trim().length === 0 ? "clean" : "dirty";
}

/** Reads a remote's URL via `git remote get-url` — never contacts the
 * network. Returns null if the remote does not exist. */
export async function getRemoteUrl(path: string, name = "origin"): Promise<string | null> {
  try {
    const result = await runGit(path, ["remote", "get-url", name]);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/** Reads a single key from the repository's local config only
 * (`--local`) — never falls through to the isolated global config or any
 * real user/system config. Returns null if unset. */
export async function readGitConfig(path: string, key: string): Promise<string | null> {
  try {
    const result = await runGit(path, ["config", "--local", key]);
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Returns true if `ancestorSha` is an ancestor of (or equal to)
 * `descendantSha`, via `git merge-base --is-ancestor` (exit 0 = ancestor,
 * exit 1 = not an ancestor — a normal, expected outcome, not a failure;
 * any other exit propagates as a GitCommandError). Both commits must
 * already exist as objects in `path`'s object database — a bare fetch
 * with no destination refspec is enough to bring in a commit that is not
 * yet reachable from any local ref.
 *
 * Added for Stage 3F.4 (git-diverged-pull.e2e.ts) to verify a genuinely
 * diverged history — neither commit is an ancestor of the other — rather
 * than inferring divergence solely from the app's pull-error text.
 */
export async function isAncestor(
  path: string,
  ancestorSha: string,
  descendantSha: string,
): Promise<boolean> {
  try {
    await runGit(path, ["merge-base", "--is-ancestor", ancestorSha, descendantSha]);
    return true;
  } catch (e) {
    if (e instanceof GitCommandError && e.exitCode === 1) return false;
    throw e;
  }
}
