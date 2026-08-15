/**
 * Containerized Git-over-SSH fixture infrastructure (Stage 3F.5.4 proof of
 * concept; hardened in Stage 3F.5.4-R1 — see that RP's section in
 * docs/E2E_WDIO_PLAN.md for the lifecycle/cache defects this file's design
 * now guards against).
 *
 * Alternative to support/git-remote.ts's local-sshd fixture: instead of a
 * Windows-native `sshd` process (which Stage 3F.5.1-3F.5.3 found forces every
 * incoming git command through Win32 OpenSSH's `cmd.exe`/Git-Bash ForceCommand
 * chain — a real, ongoing source of intermittent hangs), this module drives a
 * disposable Linux container (apps/desktop/e2e-wdio/fixtures/git-ssh-server)
 * running plain OpenSSH + git, reached over a Docker-published 127.0.0.1
 * port. On Windows the container is managed through `wsl.exe` invoking
 * Docker Engine inside a WSL2 distribution — no Docker Desktop, no elevated
 * privileges, no host filesystem mounts into the container. On Linux
 * (Stage 3F.5.8A) the same container is managed through direct, native
 * Docker CLI execution — no `wsl.exe`, no distro concept, no path
 * translation. See "Host backend abstraction" below for how the two are
 * unified behind one shared lifecycle.
 *
 * What still runs natively on the host, unchanged: the application itself,
 * its `git`/`ssh` client tooling (askpass included), and every WDIO
 * interaction. Only the *server* side of the SSH conversation moves into the
 * container — see docs/E2E_WDIO_PLAN.md's Stage 3F.5.4 section for the full
 * architecture writeup.
 *
 * This is intentionally a separate module, not a refactor of git-remote.ts:
 * per this stage's own NSP, it must not silently share Windows
 * sshd-specific implementation detail (ForceCommand/Git-Bash/icacls, none of
 * which apply here — the container's sshd is plain Linux OpenSSH). The only
 * piece genuinely shared is `shQuote` (a pure string-escaping utility, not
 * sshd-specific) and support/ssh-wrapper.sh itself: both fixtures write the
 * exact same `RIS_SSH_REMOTE_PORT`/`RIS_SSH_REMOTE_IDENTITY` env file, so the
 * wrapper script GIT_SSH_COMMAND already points at needs no changes at all
 * to serve either provider — see configureContainerSsh's doc comment.
 *
 * ── Selecting this provider ───────────────────────────────────────────────
 *
 * `container` is the default provider on Windows as of Stage 3F.5.7 — see
 * resolveGitRemoteProvider. Set `RIS_E2E_GIT_REMOTE_PROVIDER=native` to use
 * the native local-sshd fixture instead. All three Git-over-SSH specs
 * (git-remote-workflows.e2e.ts, git-clone-workflows.e2e.ts,
 * git-diverged-pull.e2e.ts) resolve the provider through this same function.
 * Use createContainerRemoteFixture() — not
 * startContainerRemote()/configureContainerSsh() called separately — for the
 * atomic-initialization guarantee described below.
 *
 * Stage 3F.5.8A: on Linux, unset/empty still resolves to "native" (see
 * resolveGitRemoteProvider's own doc comment) — this stage adds a
 * Linux-native backend *implementation* for `RIS_E2E_GIT_REMOTE_PROVIDER=container`,
 * exercised manually against a real Docker daemon (image build, container
 * start, healthcheck, key install, cleanup); it does not claim the three
 * WDIO Git-over-SSH specs pass end to end against it (see
 * resolveGitRemoteProvider's doc comment and Stage 3F.5.8A-R1's "Deferred
 * real-host acceptance checklist" in docs/E2E_WDIO_PLAN.md), and it does not
 * make container the Linux default. Both are separate, deliberately
 * deferred decisions (Stage 3F.5.8B, gated on that acceptance run passing).
 *
 * ── Host backend abstraction (Stage 3F.5.8A) ────────────────────────────────
 *
 * Everything above the "Host backend abstraction" section below is a
 * platform-neutral fixture lifecycle: image identity/caching, container
 * naming, run/cleanup orchestration, rollback, bare-remote administration.
 * None of it knows or cares whether Docker is reached through WSL2 or
 * natively. The only two things that differ by host platform are (a) how a
 * `docker <args>` invocation actually runs, and (b) how a host filesystem
 * path is presented to that invocation (a Windows drive path needs
 * `/mnt/<drive>/...` translation for WSL2's automounter; a Linux path is
 * already what Docker expects). Both are captured by `ContainerHostBackend`
 * — implemented once for `"windows-wsl2"` (wrapping the pre-3F.5.8A
 * `wsl.exe`-invoking logic verbatim, unchanged in behavior) and once for
 * `"linux-native"` (new: direct `execFile("docker", ...)`, no distro, no
 * path translation). `resolveContainerHostKind`/`createContainerHostBackend`
 * choose between them from `process.platform` alone — never from an
 * environment variable, and never by probing for `wsl.exe`/`docker` first
 * and guessing (Stage F's own requirement). `darwin` and any other platform
 * throw immediately, before invoking either WSL or Docker.
 *
 * A resolved backend never carries a fake or placeholder identity: the
 * Windows backend's WSL2 distribution is resolved once, during
 * `preflight()`, and cached privately inside the backend instance for the
 * rest of its lifetime — nothing outside this module (or even outside the
 * Windows backend's own closure) ever sees a distribution name again. The
 * Linux backend has no equivalent concept at all.
 *
 * ── The WSL2 VM idle-shutdown finding (Windows-only; critical to that
 * backend's design) ──────────────────────────────────────────────────────
 *
 * Empirically confirmed during Stage 3F.5.4's Phase 1/2 environment audit: on
 * a default WSL2 install, the lightweight utility VM backing a distro can be
 * torn down — along with every container running inside it — after as
 * little as ~10-30 seconds with no `wsl.exe` client process attached, even
 * while that container has an open, actively-used TCP connection (a plain
 * `sleep 30` between the last `wsl.exe` invocation and the next one was
 * enough to lose the container entirely; `docker ps -a` afterward showed no
 * trace of it, not even an Exited entry — the whole VM was recreated, not
 * just the container). A real WDIO spec's UI waits routinely exceed that
 * window (`waitForDisplayed` timeouts of 10-30s are the norm throughout this
 * suite), so relying on the VM staying up between our own `wsl.exe` calls is
 * not safe.
 *
 * The fix (validated empirically, see Stage 3F.5.4's report) needs no global
 * WSL configuration change: holding one extra `wsl.exe -d <distro> --
 * sleep <n>` child process open for the fixture's entire lifetime keeps the
 * distro "attached" and prevents the teardown. The Windows backend's
 * `startKeepAlive()` starts this session before any Docker command runs, and
 * `stopKeepAlive()` kills it — callers invoke it last, in a `finally`, so it
 * stays available for every Docker command cleanup itself still needs to run
 * (see cleanupContainerRemote's own doc comment). Linux has no equivalent
 * VM-teardown behavior — the Linux backend's `startKeepAlive()`/
 * `stopKeepAlive()` are no-ops, present only so shared lifecycle code never
 * needs to branch on backend kind to know whether to call them.
 *
 * ── Transactional startup (Stage 3F.5.4-R1) ─────────────────────────────────
 *
 * `startContainerRemote()` never returns a partially-built server object,
 * and never leaves resources it acquired dangling on failure: every
 * resource it acquires (backend/keep-alive, container, host work directory)
 * is tracked in a `PartialContainerFixtureState` as it goes, and any
 * failure — at any step, including ones after the container already exists
 * — triggers `rollbackPartialContainerFixture()` before the original error
 * is rethrown. `cleanupContainerRemote()` is deliberately *not* reused for
 * this: it expects a complete `ContainerSshRemoteServer`, which may not
 * exist yet during a partial startup failure.
 *
 * `createContainerRemoteFixture()` is the atomic boundary one layer up: it
 * calls `startContainerRemote()` then `configureContainerSsh()` and only
 * returns the ready provider abstraction once both succeed. If
 * `configureContainerSsh()` throws — a complete server *does* exist by that
 * point — it calls `cleanupContainerRemote()` (not the partial-rollback
 * helper) before rethrowing. Callers (the spec) should use this factory, not
 * call `startContainerRemote()`/`configureContainerSsh()` separately.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import { join, posix as posixPath } from "node:path";
import { shQuote, securePrivateKeyFile as securePrivateKeyFileImpl } from "./git-remote";
import { runGit } from "./local-git";
import { isStrictChildPath } from "./test-environment";

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[container-git-remote ${ts}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Constants ─────────────────────────────────────────────────────────────

const IMAGE_REPOSITORY = "ris-e2e-git-ssh-server";
const CONTAINER_NAME_PREFIX = "ris-e2e-git-ssh-";
/** Attached to every container this module creates — the basis of the safe,
 * label-scoped cleanup contract (see buildCleanupArgs / cleanupOrphanedContainers).
 * Never remove a container that doesn't carry this label. */
export const FIXTURE_LABEL = "ris.e2e.fixture=git-ssh";
const RUN_LABEL_PREFIX = "ris.e2e.run=";
const FIXTURE_HASH_LABEL_PREFIX = "ris.e2e.fixture-hash=";
const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "git-ssh-server");
const CONTAINER_USERNAME = "git";
const CONTAINER_REPOS_DIR = "/home/git/repos";
const CONTAINER_AUTHORIZED_KEYS = "/home/git/.ssh/authorized_keys";

// ── Safe-identifier validation ───────────────────────────────────────────────
//
// Every value interpolated into a container name, image tag, WSL distro
// argument, or path handed to `sh -c` inside the container goes through
// this first — restricting to a conservative safe set closes off shell/
// argument-injection concerns structurally rather than per call site.

const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafeIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= 128 && SAFE_IDENTIFIER_RE.test(value);
}

export function assertSafeIdentifier(value: string, kind: string): string {
  if (!isSafeIdentifier(value)) {
    throw new Error(
      `[container-git-remote] refusing unsafe ${kind}: "${value}" (must match ${SAFE_IDENTIFIER_RE.source})`,
    );
  }
  return value;
}

// ── Run id / naming ───────────────────────────────────────────────────────────

export function generateRunId(): string {
  return `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export function buildContainerName(runId: string): string {
  return assertSafeIdentifier(`${CONTAINER_NAME_PREFIX}${assertSafeIdentifier(runId, "run id")}`, "container name");
}

/** Builds `<repository>:<tag>` after validating `tag` — the only caller-supplied
 * part — as a safe identifier. Kept separate from the fixed repository name so
 * a content-hash-based cache key (see computeFixtureContentHash) can't
 * accidentally smuggle shell/argument metacharacters into a docker CLI arg. */
export function buildImageTag(tag: string): string {
  return `${IMAGE_REPOSITORY}:${assertSafeIdentifier(tag, "image tag")}`;
}

// ── Content-addressed image identity (Stage 3F.5.4-R1) ──────────────────────

export interface FixtureSourceFile {
  name: string;
  content: string;
}

/** Deterministic, boundary-safe order — `ensureImageBuilt` always reads and
 * hashes exactly these three files, in exactly this order. */
const FIXTURE_SOURCE_FILENAMES = ["Dockerfile", "entrypoint.sh", "sshd_config"] as const;

/**
 * Deterministic image cache key from an ordered list of named fixture
 * source files. Pure — no filesystem access, so callers control exactly
 * what's hashed and this stays unit testable.
 *
 * Each file's name and content are both fed into the hash, delimited by NUL
 * bytes on both sides of the name (`\0<name>\0<content>`) — plain
 * concatenation of file *contents* alone (the original Stage 3F.5.4 design)
 * is ambiguous: `["ab", "c"]` and `["a", "bc"]` hash identically with no
 * separators. Including the name as an explicit, delimited field (not just
 * a separator character, which content could still theoretically contain)
 * means two different (name, content) sequences cannot collide through
 * concatenation alone — changing which file a byte sequence belongs to
 * changes which name-fields surround it.
 *
 * Truncated to 12 hex chars: plenty of collision resistance for a
 * dev-machine build cache key, short enough to stay a comfortable image tag.
 *
 * Deliberately independent of host platform (Stage 3F.5.8A): no absolute
 * host path is ever fed into this hash, only the fixture's own source file
 * names/contents, so the same fixture source produces the same image tag on
 * Windows and Linux — see Stage I of that stage's NSP.
 */
export function computeFixtureContentHash(files: readonly FixtureSourceFile[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update("\0");
    hash.update(file.name);
    hash.update("\0");
    hash.update(file.content);
  }
  return hash.digest("hex").slice(0, 12);
}

function readFixtureSourceFiles(): FixtureSourceFile[] {
  return FIXTURE_SOURCE_FILENAMES.map((name) => ({
    name,
    content: readFileSync(join(FIXTURE_DIR, name), "utf8"),
  }));
}

/** The content-addressed tag `ensureImageBuilt` would currently select,
 * derived from the fixture source files actually on disk right now. Exposed
 * separately from `ensureImageBuilt` so callers/tests can predict or assert
 * the expected tag without invoking Docker. */
export function computeCurrentFixtureImageTag(sourceFiles: FixtureSourceFile[] = readFixtureSourceFiles()): string {
  return buildImageTag(computeFixtureContentHash(sourceFiles));
}

// ── Windows path -> WSL /mnt path ────────────────────────────────────────────

/**
 * Converts an absolute Windows drive path to its default WSL2 automount
 * path (`C:\foo\bar` -> `/mnt/c/foo/bar`). Windows-backend-only — WSL2's
 * default automount convention, not something the fixture image/entrypoint/
 * sshd_config themselves depend on (see this module's own doc comment). If a
 * host has automount disabled or remapped, the Windows backend's
 * `resolveBuildContext` (used by `ensureImageBuilt`'s docker build call)
 * fails with a clear "path not found inside WSL" error rather than a
 * confusing Docker context error — see `windowsWsl2Backend`'s own doc
 * comment.
 */
export function windowsPathToWslMountPath(windowsPath: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) {
    throw new Error(
      `[container-git-remote] cannot convert to a WSL mount path (expected an absolute Windows drive path): "${windowsPath}"`,
    );
  }
  const [, drive, rest] = match;
  return `/mnt/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
}

/**
 * Validates and returns a Linux-native absolute path unchanged — the
 * Linux backend's counterpart to `windowsPathToWslMountPath`: Docker on
 * Linux is handed the exact same absolute path the host filesystem uses, no
 * translation needed. Rejects a relative path outright (Stage 3F.5.8A's own
 * "reject relative paths where an authoritative absolute path is required"
 * requirement) rather than silently resolving it against `process.cwd()`,
 * which would make the fixture's behavior depend on the caller's working
 * directory.
 *
 * Deliberately uses `node:path`'s **`posix`** namespace (`posixPath.isAbsolute`),
 * not the ambient, host-platform-dependent `isAbsolute` — this function
 * validates Linux/POSIX path *syntax*, and that must not depend on which OS
 * happens to be executing the code (or the unit test) at the time. The
 * ambient import previously used here was reached in production only via
 * the Linux backend (itself only ever constructed when `process.platform
 * === "linux"`), so it happened to behave correctly at runtime — but this
 * function is also called directly, unconditionally, from this module's own
 * unit tests (Stage 3F.5.8A-R2-R1), and `node:path`'s ambient `isAbsolute`
 * resolves against whatever platform is actually running the test process.
 * On a Windows host, ambient `isAbsolute("C:\\Users\\dev\\project")`
 * correctly returns `true` under *Windows* path semantics, which silently
 * broke this function's Linux-path-rejection contract there. `posix.isAbsolute`
 * has no such ambiguity: it always applies POSIX syntax rules, regardless of
 * host OS.
 */
export function assertLinuxAbsolutePath(hostPath: string): string {
  if (!posixPath.isAbsolute(hostPath)) {
    throw new Error(
      `[container-git-remote] expected an absolute Linux path, got: "${hostPath}"`,
    );
  }
  return hostPath;
}

// ── Command execution primitives ─────────────────────────────────────────────
//
// Every Docker call goes through argument arrays (execFile/spawn), never a
// concatenated shell string — see this module's "Command execution
// contract". The one place a shell runs at all is *inside* the container for
// a handful of chained repository-administration commands
// (createContainerBareRemote, pushSimulatedContainerRemoteCommit), and even
// there every interpolated value is centrally quoted through shQuote
// (imported from git-remote.ts, already exercised by its own round-trip
// tests through a real `bash -c`).

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/** A failed `docker <args>` invocation, with the raw stderr/exit code
 * preserved rather than only a flattened message string — see this
 * module's Docker not-found classification, which needs the exact stderr
 * text, not `error.message` (which also carries this module's own
 * `[container-git-remote] docker ... failed via <backend> ...` prefix and
 * the generic `execFile` error text). `hostDescription` is whatever the
 * originating backend's `describe()` returned at the time — a WSL2
 * distribution name on Windows, a fixed "native Linux Docker" string on
 * Linux — informational only; nothing in this module classifies on it. */
export interface DockerCommandError extends Error {
  dockerArgs: string[];
  hostDescription: string;
  stderr: string;
  exitCode: number | null;
  /** Node's structured errno code (e.g. `"ENOENT"`) when the failure came
   * from the executable itself failing to spawn, preserved from the
   * original error so classification (`isNodeErrorWithCode`,
   * `classifyLinuxExecError`) can run directly on a `DockerCommandError`
   * without unwrapping `cause`. Absent for a plain non-zero exit, since
   * Node never assigns an errno code to that case. */
  code?: NodeJS.ErrnoException["code"];
}

export function isDockerCommandError(value: unknown): value is DockerCommandError {
  return (
    value instanceof Error &&
    typeof (value as Partial<DockerCommandError>).stderr === "string" &&
    Array.isArray((value as Partial<DockerCommandError>).dockerArgs)
  );
}

/** Wraps `execFile` in a Promise while preserving Node's structured error
 * `code` (either an errno string like `"ENOENT"` when the executable itself
 * could not be spawned, or a number when it spawned but exited non-zero —
 * Node overloads the same field for both cases) on the *rejected* error, not
 * just on the original error stashed in `cause`. Callers like
 * `classifyLinuxExecError` check `error.code` on whatever they catch
 * directly; if `code` were dropped here, a real missing-`docker` ENOENT
 * would silently misclassify as "unknown Docker error" instead of "Docker
 * CLI is not installed".
 *
 * Exported (narrowly, alongside the rest of this module's already-exported
 * internals used for testing) so unit tests can exercise this exact
 * production wrapping path — real `execFile`, a real ENOENT from a genuinely
 * nonexistent executable — rather than only asserting against a
 * hand-constructed error shape that could drift from what this function
 * actually produces. */
/** Splits Node's overloaded `error.code` into a structured errno string
 * (`code`, e.g. `"ENOENT"` — only ever present when the executable itself
 * failed to spawn) and a numeric process exit status (`exitCode` — only
 * ever present when the process actually started and exited unsuccessfully).
 * Node reuses the same `.code` field for both cases, so a naive copy
 * conflates them: a `docker` invocation that exits with status 7 must never
 * be misread as an errno `7` by `isNodeErrorWithCode`-based classification. */
function splitNodeErrorCode(rawCode: unknown): { code: NodeJS.ErrnoException["code"]; exitCode: number | null } {
  return {
    code: typeof rawCode === "string" ? rawCode : undefined,
    exitCode: typeof rawCode === "number" ? rawCode : null,
  };
}

export function execFileP(cmd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }, (error, stdoutBuf, stderrBuf) => {
      const stdout = stdoutBuf.toString("utf8");
      const stderr = stderrBuf.toString("utf8");
      if (error) {
        const nodeError = error as NodeJS.ErrnoException;
        const { code, exitCode } = splitNodeErrorCode(nodeError.code);
        reject(
          Object.assign(new Error(`${error.message}\n${stderr}`.trim(), { cause: error }), {
            code,
            stdout,
            stderr,
            exitCode,
          }),
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/** Wraps a raw exec failure into a `DockerCommandError` — shared by both
 * backends so `isDockerCommandError`/`isDockerNotFoundError`-based
 * classification downstream never needs to know which backend produced the
 * error. */
function wrapDockerError(hostDescription: string, dockerArgs: string[], error: unknown): DockerCommandError {
  const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr: unknown }).stderr) : "";
  const exitCode = error instanceof Error && "exitCode" in error ? ((error as { exitCode: number | null }).exitCode) : null;
  const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
  const wrapped = new Error(
    `[container-git-remote] docker ${dockerArgs.join(" ")} failed via ${hostDescription}: ${errMsg(error)}`,
    { cause: error },
  ) as DockerCommandError;
  wrapped.dockerArgs = dockerArgs;
  wrapped.hostDescription = hostDescription;
  wrapped.stderr = stderr;
  wrapped.exitCode = exitCode;
  wrapped.code = code;
  return wrapped;
}

/**
 * Appended to every container-prerequisite failure message (WSL/distro
 * discovery, distribution selection, Docker availability, image build) so
 * the first actionable error a user sees explains *why* a container fixture
 * was even being attempted and how to opt out temporarily — rather than a
 * bare Docker/WSL error with no mention that container is now the default
 * on Windows. Never wraps or replaces the underlying diagnostic text; only
 * appends this fixed hint after it.
 *
 * Stage 3F.5.8A wording: platform-neutral ("supported on Windows through
 * WSL2 Docker and on Linux through native Docker") rather than naming only
 * Windows — this hint is now reachable from Linux-backend failures too (see
 * `linuxNativeBackend.buildFailureHint`), and the previous Windows-only
 * wording would have been actively misleading there.
 */
const NATIVE_FALLBACK_HINT =
  "The containerized Git-over-SSH fixture is supported on Windows through WSL2 Docker and on Linux through " +
  "native Docker. Set RIS_E2E_GIT_REMOTE_PROVIDER=native to use the local-sshd fixture temporarily instead, " +
  "provided its native prerequisites are installed.";

function withNativeFallbackHint(message: string): string {
  return `${message} ${NATIVE_FALLBACK_HINT}`;
}

/** Classifies a docker CLI/daemon error's stderr into a short, precise
 * diagnostic string — shared by both backends' prerequisite-failure
 * messages (Windows' "no WSL2 distribution has a working Docker Engine",
 * Linux's own preflight failure). Pure — takes already-captured stderr
 * text, no process access. */
export function classifyDockerError(stderr: string): string {
  if (/cannot connect to the docker daemon/i.test(stderr)) return "Docker daemon is not running";
  if (/permission denied/i.test(stderr)) return "current user lacks Docker permissions (not in the docker group)";
  if (/command not found|not recognized as an internal|no such file or directory/i.test(stderr)) {
    return "Docker CLI is not installed";
  }
  return "unknown Docker error";
}

/**
 * Linux-specific wrapper around `classifyDockerError`: a genuinely missing
 * `docker` executable on Linux surfaces as a structured Node `ENOENT` on the
 * spawn itself (`isNodeErrorWithCode`, never a message-text match — see this
 * module's "do not classify errors by message text" rule, already applied
 * to `isDockerNotFoundError`/`isNodeErrorWithCode` elsewhere), not as stderr
 * text `classifyDockerError` would recognize — checked first, before
 * falling back to the same stderr-text classification the Windows backend
 * uses for daemon-unavailable/permission-denied cases (Docker prints the
 * same "Cannot connect to the Docker daemon"/"permission denied" text on
 * every platform).
 */
export function classifyLinuxExecError(error: unknown): string {
  if (isNodeErrorWithCode(error, "ENOENT")) {
    return "Docker CLI is not installed (docker executable not found on PATH)";
  }
  const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr: unknown }).stderr) : "";
  return classifyDockerError(stderr || errMsg(error));
}

// ── Host backend abstraction (Stage 3F.5.8A) ─────────────────────────────────

export type ContainerHostKind = "windows-wsl2" | "linux-native";

export interface ContainerHostPreflight {
  ok: true;
  detail: string;
}

/**
 * The one seam every platform-specific piece of the container fixture goes
 * through — see this module's "Host backend abstraction" doc comment above
 * for the full design rationale. `preflight()` must be called (and must
 * succeed) exactly once, before any other method — it is where the Windows
 * backend resolves and caches its WSL2 distribution, and where the Linux
 * backend proves Docker is reachable; every other method may assume it
 * already ran.
 */
export interface ContainerHostBackend {
  readonly kind: ContainerHostKind;
  readonly platform: NodeJS.Platform;
  /** Short, human-readable identity for logs and error messages — e.g.
   * `WSL2 distribution "Ubuntu"` or `native Linux Docker`. Never throws. */
  describe(): string;
  /** Resolves/validates whatever this backend needs before any Docker
   * command can run (Windows: pick a working WSL2 distribution; Linux:
   * confirm the Docker CLI/daemon are reachable without sudo). Throws with a
   * classified, actionable message on failure — never returns a
   * `{ ok: false }` shape, so callers cannot forget to check it. */
  preflight(): Promise<ContainerHostPreflight>;
  /** Runs `docker <args>`, never through a shell. Throws a
   * `DockerCommandError` on failure. */
  execDocker(args: string[]): Promise<ExecResult>;
  /** Runs `docker <args>`, piping `stdinData` to the child's stdin — the
   * only shape `installPublicKey` needs, kept separate from `execDocker`
   * because piped stdin isn't expressible through the simple
   * capture-and-resolve shape `execDocker`/`execFileP` use. */
  execDockerWithStdin(args: string[], stdinData: string): Promise<void>;
  /** Resolves a host filesystem path to whatever Docker's `build` context
   * argument needs on this backend (a WSL `/mnt/<drive>/...` path on
   * Windows, the same absolute path unchanged on Linux). */
  resolveBuildContext(hostPath: string): Promise<string>;
  /** Resolves a host filesystem path to whatever a Docker bind-mount source
   * needs on this backend. Not exercised by any current fixture operation
   * (the fixture image is fully self-contained — no bind mounts), kept for
   * parity with `resolveBuildContext` and Stage 3F.5.8A's own "mounted
   * fixture/configuration paths" coverage requirement, and because a bind
   * mount is the obvious next thing a future stage would add. */
  resolveBindSource(hostPath: string): Promise<string>;
  /** Windows: starts the WSL2-VM-idle-shutdown keep-alive session (see this
   * module's own doc comment). Linux: no-op. Idempotent — safe to call
   * without checking whether a session is already running. */
  startKeepAlive(): void;
  /** Idempotent counterpart to `startKeepAlive` — safe to call even if no
   * session was ever started. */
  stopKeepAlive(): void;
  /** Platform-specific troubleshooting sentence appended to an image-build
   * failure — Windows' WSL2-automount hint, Linux's Docker-permission hint.
   * Never mentions WSL on the Linux backend. */
  buildFailureHint(): string;
}

// ── Windows / WSL2 backend ───────────────────────────────────────────────────
//
// Every function in this section is the pre-3F.5.8A `wsl.exe`-invoking
// implementation, unchanged in behavior — only reshaped from free functions
// taking an explicit `distro: string` into a backend instance that resolves
// and caches its own distro once, in `preflight()`. Windows regression
// coverage (Stage 3F.5.7-R1 and earlier) exercised the *behavior* here, not
// this exact function shape, so re-validating that behavior (Stage N) is
// what actually matters, not a line-for-line diff against the pre-refactor
// module.

export interface WslDistribution {
  name: string;
  state: string;
  version: number;
  isDefault: boolean;
}

/**
 * wsl.exe's own meta-commands (`--status`, `--list`) emit UTF-16LE whenever
 * stdout is not a real console — which is always true when invoked via
 * child_process — confirmed empirically in Stage 3F.5.4's Phase 1
 * environment audit. Detection is content-based rather than assumed
 * unconditionally (Stage 3F.5.4-R1 hardening): a UTF-16LE BOM, if present,
 * is authoritative; otherwise NUL-byte density is used as a heuristic
 * (UTF-16LE encoding of ASCII/Latin-1-range text puts a 0x00 byte in every
 * other position, ~50% density, vs. ~0% for ordinary UTF-8 text) — anything
 * not clearly UTF-16LE by either signal is decoded as UTF-8. Output from a
 * program run *inside* a distro (`wsl -d <distro> -- <cmd>`) is that
 * program's own native UTF-8 and is unaffected — decodeWslMetaOutput is
 * only ever applied to `wsl.exe`'s own list/status output, never to
 * anything docker/git prints from inside the container.
 */
const UTF16LE_BOM_BYTES: readonly [number, number] = [0xff, 0xfe];
const UTF16LE_NUL_DENSITY_THRESHOLD = 0.3;

function hasUtf16LeBom(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === UTF16LE_BOM_BYTES[0] && buffer[1] === UTF16LE_BOM_BYTES[1];
}

function looksLikeUtf16Le(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  if (hasUtf16LeBom(buffer)) return true;
  let nulCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0) nulCount++;
  }
  return nulCount / buffer.length > UTF16LE_NUL_DENSITY_THRESHOLD;
}

export function decodeWslMetaOutput(buffer: Buffer): string {
  if (looksLikeUtf16Le(buffer)) {
    return buffer.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return buffer.toString("utf8");
}

async function execWslMeta(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("wsl.exe", args, { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 }, (error, stdoutBuf) => {
      if (error) {
        reject(
          new Error(
            withNativeFallbackHint(`[container-git-remote] wsl.exe ${args.join(" ")} failed: ${error.message}`),
            { cause: error },
          ),
        );
        return;
      }
      resolve(decodeWslMetaOutput(stdoutBuf));
    });
  });
}

/** Runs `docker <dockerArgs>` inside `distro` via `wsl.exe -d <distro> --
 * docker ...` — always an argument array, never a shell string. */
async function execDockerViaWsl(distro: string, dockerArgs: string[]): Promise<ExecResult> {
  assertSafeIdentifier(distro, "WSL distribution name");
  try {
    return await execFileP("wsl.exe", ["-d", distro, "--", "docker", ...dockerArgs]);
  } catch (error) {
    throw wrapDockerError(`WSL2 distribution "${distro}"`, dockerArgs, error);
  }
}

/**
 * Parses `wsl.exe --list --verbose` output (already UTF-16LE-decoded — see
 * decodeWslMetaOutput) into structured rows. Pure — no filesystem/process
 * access — so the whole table format (variable column widths, the leading
 * `*` default-distro marker, multi-word state values) is unit-testable
 * without a real WSL install.
 */
export function parseWslList(rawOutput: string): WslDistribution[] {
  const lines = rawOutput.split(/\r?\n/);
  const distros: WslDistribution[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (/^\s*\*?\s*NAME\b/i.test(line)) continue; // header row
    const isDefault = /^\s*\*/.test(line);
    const withoutMarker = line.replace(/^\s*\*?\s*/, "");
    const parts = withoutMarker.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const name = parts[0]!;
    const version = Number.parseInt(parts[parts.length - 1]!, 10);
    const state = parts.slice(1, -1).join(" ");
    if (!name || Number.isNaN(version)) continue;
    distros.push({ name, state, version, isDefault });
  }
  return distros;
}

export async function discoverWslDistributions(): Promise<WslDistribution[]> {
  const output = await execWslMeta(["--list", "--verbose"]);
  return parseWslList(output);
}

interface DockerAvailability {
  available: boolean;
  diagnostic?: string;
}

async function checkDockerAvailabilityViaWsl(distro: string): Promise<DockerAvailability> {
  try {
    await execDockerViaWsl(distro, ["info"]);
    return { available: true };
  } catch (error) {
    const stderr = isDockerCommandError(error) ? error.stderr : "";
    return { available: false, diagnostic: classifyDockerError(stderr || errMsg(error)) };
  }
}

export interface DistroDockerCheck extends DockerAvailability {
  distro: string;
}

/**
 * Chooses which WSL2 distribution to run Docker commands against, given the
 * already-parsed `wsl.exe --list --verbose` rows and an injected Docker
 * availability checker (dependency-injected so this whole selection policy
 * — override handling, WSL1 filtering, first-match-wins iteration order —
 * is unit-testable with a fake checker and zero real WSL/Docker access).
 *
 * `override`, when given (RIS_E2E_WSL_DISTRO), is validated and used
 * directly — no automatic distribution is substituted for an explicit,
 * unusable override. With no override, WSL1 distributions are filtered out
 * entirely, then each remaining WSL2 distribution is checked in the order
 * `wsl --list --verbose` reported them until one has a working Docker
 * Engine; the pick is deterministic given the same input list and checker.
 */
export async function selectDistribution(
  distros: WslDistribution[],
  checkDocker: (distro: string) => Promise<DockerAvailability>,
  override?: string | null,
): Promise<{ distro: string; diagnostics: DistroDockerCheck[] }> {
  if (override) {
    const match = distros.find((d) => d.name === override);
    if (!match) {
      throw new Error(
        withNativeFallbackHint(
          `[container-git-remote] RIS_E2E_WSL_DISTRO="${override}" is not an installed WSL distribution ` +
            `(found: ${distros.map((d) => d.name).join(", ") || "none"}).`,
        ),
      );
    }
    if (match.version !== 2) {
      throw new Error(
        withNativeFallbackHint(
          `[container-git-remote] RIS_E2E_WSL_DISTRO="${override}" is WSL${match.version}, not WSL2 — ` +
            `the container fixture requires WSL2. Run: wsl --set-version ${override} 2`,
        ),
      );
    }
    const check = await checkDocker(override);
    if (!check.available) {
      throw new Error(
        withNativeFallbackHint(
          `[container-git-remote] Docker is not available in WSL distribution "${override}": ${check.diagnostic}.`,
        ),
      );
    }
    return { distro: override, diagnostics: [{ distro: override, ...check }] };
  }

  if (distros.length === 0) {
    throw new Error(
      withNativeFallbackHint(
        "[container-git-remote] no WSL distributions are installed. Install a WSL2 distribution " +
          "(e.g. `wsl --install -d Ubuntu`) with Docker Engine before running the container fixture.",
      ),
    );
  }

  const wsl2 = distros.filter((d) => d.version === 2);
  if (wsl2.length === 0) {
    throw new Error(
      withNativeFallbackHint(
        `[container-git-remote] only WSL1 distribution(s) found (${distros.map((d) => d.name).join(", ")}) — ` +
          "the container fixture requires WSL2. Run: wsl --set-version <distro> 2",
      ),
    );
  }

  const diagnostics: DistroDockerCheck[] = [];
  for (const d of wsl2) {
    const check = await checkDocker(d.name);
    diagnostics.push({ distro: d.name, ...check });
    if (check.available) return { distro: d.name, diagnostics };
  }
  throw new Error(
    withNativeFallbackHint(
      "[container-git-remote] no WSL2 distribution has a working Docker Engine. Checked: " +
        diagnostics.map((d) => `${d.distro} (${d.diagnostic ?? "unavailable"})`).join(", "),
    ),
  );
}

export function resolveWslDistroOverride(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env["RIS_E2E_WSL_DISTRO"];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveDistribution(): Promise<string> {
  const override = resolveWslDistroOverride();
  const distros = await discoverWslDistributions();
  const { distro } = await selectDistribution(distros, checkDockerAvailabilityViaWsl, override);
  return distro;
}

function startKeepAliveSessionViaWsl(distro: string): ChildProcess {
  // 86400s (24h) is just "far longer than any single WDIO spec run could
  // take" — the process is always explicitly killed by cleanup, never left
  // to time out on its own.
  const child = spawn("wsl.exe", ["-d", distro, "--", "sleep", "86400"], { stdio: "ignore" });
  child.unref();
  return child;
}

function stopKeepAliveSessionViaWsl(child: ChildProcess): void {
  if (!child.killed && child.exitCode === null) {
    child.kill();
  }
}

/** Upper bound on accumulated stderr for `spawnWithStdin`, enforced in
 * actual bytes (not JS string length/UTF-16 code units) — a runaway or
 * malicious child process must not be able to grow unbounded diagnostic
 * text in memory just because nothing ever reads its stderr except this
 * accumulator (`stdio: ["pipe", "ignore", "pipe"]` never lets a consumer
 * drain it another way). Comfortably larger than any real Docker/git
 * diagnostic output while still being a hard, explicit limit. */
export const MAX_STDIN_EXEC_STDERR_BYTES = 64 * 1024;
export const STDERR_TRUNCATION_MARKER = "\n...[stderr truncated]";

/** Accumulates raw stderr `Buffer` chunks up to `MAX_STDIN_EXEC_STDERR_BYTES`
 * actual bytes, decoding to UTF-8 only once at the end (`read()`) rather
 * than on every chunk — comparing/truncating on the decoded string would
 * silently enforce a *character* limit instead of the byte limit the
 * constant name promises. A chunk landing exactly on the boundary, or a
 * multi-byte UTF-8 character split across the truncation point, is
 * accepted as an unavoidable edge case of a hard byte cutoff (Node's own
 * `Buffer#toString("utf8")` replaces an incomplete trailing sequence with
 * U+FFFD rather than throwing). */
class BoundedStderrCollector {
  private readonly chunks: Buffer[] = [];
  private byteLength = 0;
  private truncated = false;

  append(chunk: Buffer): void {
    if (this.truncated) return;
    const remaining = MAX_STDIN_EXEC_STDERR_BYTES - this.byteLength;
    if (remaining <= 0) {
      this.truncated = true;
      return;
    }
    if (chunk.length > remaining) {
      this.chunks.push(chunk.subarray(0, remaining));
      this.byteLength += remaining;
      this.truncated = true;
    } else {
      this.chunks.push(chunk);
      this.byteLength += chunk.length;
    }
  }

  read(): string {
    const decoded = Buffer.concat(this.chunks).toString("utf8");
    return this.truncated ? decoded + STDERR_TRUNCATION_MARKER : decoded;
  }
}

/** Injectable `spawn` seam for `spawnWithStdin` — production code always
 * uses the real `node:child_process.spawn` (`defaultSpawnWithStdinDeps`);
 * tests inject an `EventEmitter`-based fake child to exercise EPIPE/spawn-
 * failure/close-ordering combinations deterministically, without relying on
 * real OS pipe-buffer timing and without globally monkey-patching
 * `child_process.spawn`. */
export interface SpawnWithStdinDeps {
  spawn: typeof spawn;
}

const defaultSpawnWithStdinDeps: SpawnWithStdinDeps = { spawn };

function buildDockerCommandError(
  message: string,
  hostDescription: string,
  dockerArgs: string[],
  fields: { stderr: string; exitCode: number | null; code?: NodeJS.ErrnoException["code"]; cause?: unknown },
): DockerCommandError {
  const wrapped = (
    fields.cause !== undefined ? new Error(message, { cause: fields.cause }) : new Error(message)
  ) as DockerCommandError;
  wrapped.dockerArgs = dockerArgs;
  wrapped.hostDescription = hostDescription;
  wrapped.stderr = fields.stderr;
  wrapped.exitCode = fields.exitCode;
  wrapped.code = fields.code;
  return wrapped;
}

/**
 * Shared `spawn`-with-stdin execution, used by both backends'
 * `execDockerWithStdin` (installing `publicKey` into the container's
 * authorized_keys via `docker exec -i ... tee -a`, piping the key over
 * stdin rather than as a command-line argument — see this module's "do not
 * pass secrets through command-line arguments when avoidable" rule; a
 * public key isn't secret, but this also keeps arbitrarily-shaped key
 * comments out of argv/process listings for free, and avoids ever needing
 * to shell-escape it). `cmd`/`cmdArgs` are the literal process to spawn
 * (`docker ...` on Linux, `wsl.exe -d <distro> -- docker ...` on Windows);
 * `dockerArgs` is the logical docker-only argument list recorded on the
 * resulting error, matching what `wrapDockerError` records for the
 * non-stdin path. Never a shell, never `sudo`.
 *
 * Settles from the child's `"close"` event, never `"exit"` (Stage
 * 3F.5.8A-R2): `"exit"` fires once the process has ended but its stdio
 * streams may still be open or have buffered data in flight (e.g. a
 * grandchild inheriting this child's stderr descriptor can keep writing
 * after this child itself has exited); `"close"` fires only once every
 * stdio stream has actually closed, so it is the only point at which
 * accumulated stderr is guaranteed complete.
 *
 * Settles exactly once via a `settled` guard plus `once()` on every
 * terminal-adjacent event. `"error"` (spawn failure) and the child's own
 * `stdin` `"error"` (e.g. `EPIPE` from writing after the child has already
 * exited) are captured as state, never rejected from directly — only
 * `"close"` decides the outcome, applying this precedence: a spawn failure
 * is always primary (the process never ran, so nothing else about it is
 * meaningful); otherwise a non-zero exit is primary (a stdin `EPIPE` is a
 * near-inevitable side effect of a `docker exec` that exits early/fails
 * and stops reading stdin — it must never mask the real failure) and any
 * captured stdin error is folded in only as secondary context; otherwise,
 * if the process exited 0 but writing stdin still failed, that stdin
 * failure is itself the (only) reason to reject; otherwise resolve.
 * Registering the `stdin` `"error"` listener unconditionally also means an
 * `EPIPE` never becomes an unhandled `"error"` event on that stream.
 *
 * Always rejects with a `DockerCommandError` (dockerArgs/hostDescription/
 * stderr/exitCode, plus `code` when the executable itself failed to spawn
 * or, for the stdin-only-failure case, when writing stdin failed) rather
 * than a bare `Error`, so `isDockerCommandError` and
 * `isNodeErrorWithCode`-based classification behave identically for
 * stdin-based execution as they do for `execFileP`-based execution.
 * `code` and `exitCode` are always kept disjoint — see `splitNodeErrorCode`
 * — never a number in `code`, never an errno string in `exitCode`.
 *
 * Exported narrowly (Stage 3F.5.8A-R1/R2), same rationale as `execFileP`:
 * lets unit tests exercise this exact production spawn/error-wrapping path
 * (a real child process, real stdin/stderr/close-ordering) with a
 * deterministic local executable, plus (via the injectable `deps.spawn`)
 * deterministic coverage of EPIPE/spawn-failure/close-ordering combinations
 * that real OS pipe timing cannot reliably reproduce in a test.
 */
export function spawnWithStdin(
  cmd: string,
  cmdArgs: string[],
  stdinData: string,
  hostDescription: string,
  dockerArgs: string[],
  deps: SpawnWithStdinDeps = defaultSpawnWithStdinDeps,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn(cmd, cmdArgs, { stdio: ["pipe", "ignore", "pipe"] });
    const stderrCollector = new BoundedStderrCollector();
    let settled = false;
    let spawnError: NodeJS.ErrnoException | null = null;
    let stdinError: NodeJS.ErrnoException | null = null;

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrCollector.append(chunk);
    });

    child.once("error", (error) => {
      spawnError = error as NodeJS.ErrnoException;
    });

    child.stdin?.once("error", (error) => {
      stdinError = error as NodeJS.ErrnoException;
    });

    child.once("close", (rawCode) => {
      if (settled) return;
      settled = true;
      const stderr = stderrCollector.read();

      if (spawnError) {
        const { code } = splitNodeErrorCode(spawnError.code);
        reject(
          buildDockerCommandError(
            `[container-git-remote] docker ${dockerArgs.join(" ")} failed via ${hostDescription}: ${spawnError.message}`,
            hostDescription,
            dockerArgs,
            { stderr, exitCode: null, code, cause: spawnError },
          ),
        );
        return;
      }

      if (rawCode !== 0) {
        const stdinNote = stdinError ? ` (writing stdin also failed: ${stdinError.message})` : "";
        reject(
          buildDockerCommandError(
            `[container-git-remote] docker ${dockerArgs.join(" ")} exited with code ${rawCode} via ${hostDescription}: ${stderr.trim()}${stdinNote}`,
            hostDescription,
            dockerArgs,
            { stderr, exitCode: rawCode, cause: stdinError ?? undefined },
          ),
        );
        return;
      }

      if (stdinError) {
        const { code } = splitNodeErrorCode(stdinError.code);
        reject(
          buildDockerCommandError(
            `[container-git-remote] docker ${dockerArgs.join(" ")} exited successfully via ${hostDescription}, but writing stdin failed: ${stdinError.message}`,
            hostDescription,
            dockerArgs,
            { stderr, exitCode: 0, code, cause: stdinError },
          ),
        );
        return;
      }

      resolve();
    });

    child.stdin?.end(stdinData);
  });
}

function execDockerWithStdinViaWsl(distro: string, args: string[], stdinData: string): Promise<void> {
  return spawnWithStdin("wsl.exe", ["-d", distro, "--", "docker", ...args], stdinData, `WSL2 distribution "${distro}"`, args);
}

/**
 * The Windows backend. Every method's behavior is exactly what the
 * pre-3F.5.8A module-level functions did — this stage reshapes the call
 * shape (an object instead of free functions threading a `distro: string`
 * parameter), it does not change what actually runs on Windows. `preflight`
 * resolves and privately caches the distro; every other method assumes it
 * already ran (asserted defensively — a programming error, not a runtime
 * condition a real caller can hit, since `startContainerRemote` always
 * calls `preflight()` before anything else).
 */
function createWindowsWsl2Backend(): ContainerHostBackend {
  let resolvedDistro: string | null = null;
  let keepAlive: ChildProcess | null = null;

  function requireDistro(): string {
    if (resolvedDistro === null) {
      throw new Error("[container-git-remote] internal error: Windows backend used before preflight() succeeded.");
    }
    return resolvedDistro;
  }

  return {
    kind: "windows-wsl2",
    platform: "win32",
    describe: () => (resolvedDistro ? `WSL2 distribution "${resolvedDistro}"` : "WSL2 (distribution not yet resolved)"),
    preflight: async () => {
      const distro = await resolveDistribution();
      resolvedDistro = distro;
      log(`selected WSL2 distribution: ${distro}`);
      return { ok: true, detail: `WSL2 distribution "${distro}"` };
    },
    execDocker: async (args) => execDockerViaWsl(requireDistro(), args),
    execDockerWithStdin: async (args, stdinData) => execDockerWithStdinViaWsl(requireDistro(), args, stdinData),
    resolveBuildContext: async (hostPath) => windowsPathToWslMountPath(hostPath),
    resolveBindSource: async (hostPath) => windowsPathToWslMountPath(hostPath),
    startKeepAlive: () => {
      if (keepAlive) return;
      keepAlive = startKeepAliveSessionViaWsl(requireDistro());
    },
    stopKeepAlive: () => {
      if (!keepAlive) return;
      stopKeepAliveSessionViaWsl(keepAlive);
      keepAlive = null;
    },
    buildFailureHint: () =>
      "If Windows drives are not auto-mounted under /mnt in this distribution (automount disabled or " +
      "remapped), set RIS_E2E_WSL_DISTRO to one where they are.",
  };
}

// ── Linux native backend (Stage 3F.5.8A) ─────────────────────────────────────
//
// No distro concept, no wsl.exe, no path translation — `docker` is invoked
// directly, and host paths are used exactly as given (after validating they
// are absolute — see assertLinuxAbsolutePath). Keep-alive is a no-op: the
// WSL2-VM-idle-shutdown problem this module's keep-alive session exists to
// work around has no Linux equivalent (there is no lightweight utility VM
// between this process and the Docker daemon).

async function execDockerNative(args: string[]): Promise<ExecResult> {
  try {
    return await execFileP("docker", args);
  } catch (error) {
    throw wrapDockerError("native Linux Docker", args, error);
  }
}

function execDockerWithStdinNative(args: string[], stdinData: string): Promise<void> {
  return spawnWithStdin("docker", args, stdinData, "native Linux Docker", args);
}

/**
 * The Linux backend (Stage 3F.5.8A). `preflight()` proves Docker is
 * reachable without sudo (`docker info` — fails clearly for a missing
 * executable, a down daemon, or a permission-denied socket, classified via
 * `classifyLinuxExecError`) rather than assuming; every subsequent
 * `execDocker` call is a direct `execFile("docker", args)`, never a shell,
 * never through `sudo`. No distro is ever resolved, cached, or referenced —
 * there is nothing here for `describe()`/error messages to name beyond
 * "native Linux Docker".
 */
function createLinuxNativeBackend(): ContainerHostBackend {
  let preflighted = false;

  return {
    kind: "linux-native",
    platform: "linux",
    describe: () => "native Linux Docker",
    preflight: async () => {
      try {
        await execFileP("docker", ["info"]);
      } catch (error) {
        throw new Error(
          withNativeFallbackHint(
            `[container-git-remote] Docker is not usable on this Linux host: ${classifyLinuxExecError(error)}.`,
          ),
          { cause: error },
        );
      }
      preflighted = true;
      log("native Linux Docker preflight OK (docker info succeeded)");
      return { ok: true, detail: "native Linux Docker" };
    },
    execDocker: async (args) => {
      if (!preflighted) {
        throw new Error("[container-git-remote] internal error: Linux backend used before preflight() succeeded.");
      }
      return execDockerNative(args);
    },
    execDockerWithStdin: async (args, stdinData) => {
      if (!preflighted) {
        throw new Error("[container-git-remote] internal error: Linux backend used before preflight() succeeded.");
      }
      return execDockerWithStdinNative(args, stdinData);
    },
    resolveBuildContext: async (hostPath) => assertLinuxAbsolutePath(hostPath),
    resolveBindSource: async (hostPath) => assertLinuxAbsolutePath(hostPath),
    startKeepAlive: () => {
      // No WSL2-style VM idle-shutdown on native Linux — nothing to keep alive.
    },
    stopKeepAlive: () => {
      // Mirrors startKeepAlive: intentionally a no-op.
    },
    buildFailureHint: () =>
      "Confirm the Docker daemon is running and the current user has permission to use it " +
      "(a member of the docker group, or an equivalent rootless-Docker setup) — this fixture never runs Docker through sudo.",
  };
}

/**
 * Deterministic platform -> backend-kind selection (Stage 3F.5.8A Stage F).
 * Never infers from an environment variable, and never probes for
 * `wsl.exe`/`docker` first and guesses — `platform` alone decides. `darwin`
 * and any other platform throw immediately, before this function (or its
 * caller) has invoked WSL or Docker in any way.
 */
export function resolveContainerHostKind(platform: NodeJS.Platform = process.platform): ContainerHostKind {
  if (platform === "win32") return "windows-wsl2";
  if (platform === "linux") return "linux-native";
  throw new Error(
    `[container-git-remote] the container Git-remote provider has no backend for platform "${platform}" ` +
      '(supported: "win32" via WSL2, "linux" natively). Set RIS_E2E_GIT_REMOTE_PROVIDER=native to use the ' +
      "local-sshd fixture instead.",
  );
}

/**
 * Backend factory — the only place `resolveContainerHostKind`'s result is
 * turned into a real backend instance. Kept separate from
 * `resolveContainerHostKind` so backend-selection *policy* (Stage N's "win32
 * selects windows-wsl2 / linux selects linux-native / darwin fails clearly"
 * requirement) stays unit-testable independently of actually constructing
 * (and therefore closing over mutable keep-alive/distro state for) a real
 * backend object.
 */
export function createContainerHostBackend(platform: NodeJS.Platform = process.platform): ContainerHostBackend {
  const kind = resolveContainerHostKind(platform);
  return kind === "windows-wsl2" ? createWindowsWsl2Backend() : createLinuxNativeBackend();
}

// ── Provider selection (RIS_E2E_GIT_REMOTE_PROVIDER) ─────────────────────────

export type GitRemoteProvider = "native" | "container";

/**
 * Resolves which Git-remote fixture provider a spec should use.
 *
 * Stage 3F.5.7: defaults to "container" on Windows (this module's
 * containerized Git-over-SSH fixture) — the container provider passed its
 * full proof-of-concept and stability validation (Stage 3F.5.4-3F.5.6) and
 * native's Win32 OpenSSH `cmd.exe`/Git-Bash ForceCommand chain remains a
 * real, ongoing hang source (see this module's own doc comment). `native`
 * (git-remote.ts's local-sshd fixture) stays fully supported as an explicit,
 * genuinely usable fallback via `RIS_E2E_GIT_REMOTE_PROVIDER=native` — it is
 * not being removed, only demoted from default on Windows.
 *
 * Stage 3F.5.7-R1: the unset/empty default is platform-aware, not global.
 * At that stage the container backend was still Windows-specific top to
 * bottom, so the unset/empty default was "container" only on `win32`.
 *
 * Stage 3F.5.8A: a Linux-native host backend now exists (see "Host backend
 * abstraction" above) and its lifecycle was exercised manually against a
 * real local Docker daemon — but the *default* is deliberately unchanged by
 * this stage: unset/empty still resolves to "native" on Linux. Full
 * application → Git → SSH → container acceptance (the three WDIO Git-remote
 * specs actually passing against this backend on a normal Linux host)
 * remains unvalidated as of Stage 3F.5.8A-R1 — real-host WDIO runs in the
 * sandbox this stage was implemented in were blocked by that sandbox's own
 * Docker-in-Docker networking and WebDriver-session limitations, not by a
 * defect found in this backend. Switching the Linux default is Stage
 * 3F.5.8B's decision, and may only be made after that acceptance run passes
 * on a normal Linux host — see this stage's own NSP, "Non-objectives", and
 * the "Deferred real-host acceptance checklist" in docs/E2E_WDIO_PLAN.md.
 * Platform is taken as an injected parameter (defaulting
 * to the real `process.platform`) rather than read internally, so this
 * decision stays unit-testable for every platform without mutating global
 * Node state.
 *
 * There is deliberately no automatic fallback from container to native: a
 * container startup failure (missing WSL2/Docker prerequisite, daemon down,
 * ...) fails the run rather than silently retrying under a different
 * provider — see the diagnostics this module's backend `preflight()`
 * implementations throw, each naming the container-is-default-on-Windows
 * policy and the native override.
 *
 * Throws on any value other than "native"/"container"/unset, rather than
 * silently falling back, so a typo'd env var fails loudly instead of
 * quietly running the wrong fixture. This part of the contract is
 * platform-independent: an invalid value is invalid on every platform.
 */
export function resolveGitRemoteProvider(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): GitRemoteProvider {
  const value = env["RIS_E2E_GIT_REMOTE_PROVIDER"];
  if (value === undefined || value === "") return platform === "win32" ? "container" : "native";
  if (value === "native" || value === "container") return value;
  throw new Error(
    `[container-git-remote] invalid RIS_E2E_GIT_REMOTE_PROVIDER="${value}" — expected "native" or "container".`,
  );
}

// ── Docker argument construction ─────────────────────────────────────────────

export interface DockerRunOptions {
  containerName: string;
  imageTag: string;
  runId: string;
}

/**
 * Builds the `docker run` argument array for a fresh fixture container.
 * Deliberately omits `--rm`: a crashed/unhealthy container's logs are the
 * primary failure diagnostic (see collectDiagnostics) and `--rm` would
 * destroy them the instant the container exits — cleanup removes the
 * container explicitly instead, after any diagnostics have already been
 * collected.
 *
 * `-p 127.0.0.1::22` is Docker's own syntax for "publish to a random host
 * port, bound only to 127.0.0.1" (empty host-port segment) — never a fixed
 * port, per this module's own security requirements. Identical on both
 * backends — Docker's own port-publish syntax has nothing WSL/Windows- or
 * Linux-specific about it.
 */
export function buildDockerRunArgs(options: DockerRunOptions): string[] {
  const containerName = assertSafeIdentifier(options.containerName, "container name");
  const runId = assertSafeIdentifier(options.runId, "run id");
  return [
    "run",
    "-d",
    "--name",
    containerName,
    "--label",
    FIXTURE_LABEL,
    "--label",
    `${RUN_LABEL_PREFIX}${runId}`,
    "--security-opt",
    "no-new-privileges",
    "-p",
    "127.0.0.1::22",
    options.imageTag,
  ];
}

/** Builds the `docker ps -aq` filter arguments for the safe, label-scoped
 * cleanup contract — every container this returns carries FIXTURE_LABEL, so
 * a caller can never accidentally sweep up an unrelated container. */
export function buildCleanupArgs(runId?: string): string[] {
  const args = ["ps", "-aq", "--filter", `label=${FIXTURE_LABEL}`];
  if (runId) {
    args.push("--filter", `label=${RUN_LABEL_PREFIX}${assertSafeIdentifier(runId, "run id")}`);
  }
  return args;
}

/** Parses `docker port <container>` output (`22/tcp -> 127.0.0.1:PORT`) into
 * the published host port, or null if no 127.0.0.1 mapping is present.
 * Pure string parsing — unit-testable without a real container. Identical
 * on both backends: Docker's own `port` output format does not depend on
 * how the daemon was reached. Must never accept `0.0.0.0` or `::` — see
 * this module's security requirements; only a literal `127.0.0.1:<port>`
 * match is recognized at all. */
export function parsePublishedPort(dockerPortOutput: string): number | null {
  const match = /127\.0\.0\.1:(\d+)/.exec(dockerPortOutput);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/** The SCP-like SSH remote URL the app's "Add remote" form accepts — same
 * shape as git-remote.ts's buildSshRemoteUrl, but the container fixture's
 * username is always the fixed `git` (see the Dockerfile), never the host
 * OS user, and `bareRepoPath` is a path inside the *container's* filesystem
 * (e.g. `/home/git/repos/scenario1-abc123.git`), not the host's own. */
export function buildContainerSshRemoteUrl(bareRepoPath: string): string {
  return `${CONTAINER_USERNAME}@127.0.0.1:${bareRepoPath}`;
}

// ── Container presence (tri-state — Stage 3F.5.4-R2) ─────────────────────────
//
// Stage 3F.5.4-R1's `checkContainerExists` collapsed every `docker inspect`
// failure to "absent" — indistinguishable from a genuine "no such
// container" result. That's wrong: a Docker daemon outage, a WSL2 VM
// hiccup, a permission error, or the backend's own execution path itself
// failing all throw too, and none of them prove the container is gone.
// Teardown built on that boolean could report success while a real
// container (and its published port) was still sitting there — the exact
// defect Stage 3F.5.4-R2 exists to close. `ContainerPresence` makes the
// third case explicit so no caller can accidentally treat "I couldn't
// check" as "it's gone".

export type ContainerPresence = { status: "present" } | { status: "absent" } | { status: "unknown"; error: string };

/**
 * Recognizes only Docker's own "the exact named object does not exist"
 * result — never a generic "not found" (missing binary, missing file
 * inside a container, an unrelated ENOENT). Confirmed against this
 * project's real Docker Engine (validated on both WSL2-hosted and native
 * Linux Docker): `docker inspect` on a missing name prints `error: no such
 * object: <name>` (lowercase, no daemon-response prefix); `docker
 * rm`/`docker port` print `Error response from daemon: No such container:
 * <name>`. Both are covered by the same case-insensitive "no such
 * object|container:" match; neither "command not found" nor "permission
 * denied" nor a connection failure matches it, so those correctly fall
 * through to "unknown" in `inspectContainerPresence` rather than being
 * misread as absence.
 */
const DOCKER_NOT_FOUND_RE = /no such (?:object|container):/i;

export function isDockerNotFoundError(stderr: string): boolean {
  return DOCKER_NOT_FOUND_RE.test(stderr);
}

/** Injectable seam for `inspectContainerPresence` — so the tri-state
 * classification below is unit-testable with a fake `dockerInspect` that
 * throws fabricated `DockerCommandError`-shaped stderr, with no real
 * WSL/Docker access. */
export type DockerInspectFn = (backend: ContainerHostBackend, containerName: string) => Promise<ExecResult>;

const defaultDockerInspect: DockerInspectFn = (backend, containerName) => backend.execDocker(["inspect", containerName]);

/**
 * The single source of truth for "does this exact container currently
 * exist" — always an exact-identity `docker inspect <containerName>` (never
 * a substring/name-filter match), and always tri-state: `docker inspect`
 * succeeding is `"present"`; failing with Docker's own not-found message
 * (`isDockerNotFoundError`, checked against the preserved `DockerCommandError.
 * stderr`, not the flattened `error.message`) is `"absent"`; any other
 * failure — daemon down, WSL unavailable, permission denied, the backend's
 * own execution path erroring, a malformed/unexpected stderr shape — is
 * `"unknown"`, carrying the underlying diagnostic. Only `"absent"` may ever
 * set `containerVerifiedAbsent = true` downstream (see `CleanupResult` and
 * `rollbackPartialContainerFixture`).
 */
export async function inspectContainerPresence(
  backend: ContainerHostBackend,
  containerName: string,
  dockerInspect: DockerInspectFn = defaultDockerInspect,
): Promise<ContainerPresence> {
  try {
    await dockerInspect(backend, containerName);
    return { status: "present" };
  } catch (error) {
    const stderr = isDockerCommandError(error) ? error.stderr : "";
    if (isDockerNotFoundError(stderr)) {
      return { status: "absent" };
    }
    return { status: "unknown", error: errMsg(error) };
  }
}

/** Injectable seam for `removeContainerViaDocker`, mirroring `DockerInspectFn` —
 * lets the not-found-during-removal classification below be unit-tested
 * with a fake `dockerRemove` and no real WSL/Docker access. */
export type DockerRemoveFn = (backend: ContainerHostBackend, containerName: string) => Promise<ExecResult>;

const defaultDockerRemove: DockerRemoveFn = (backend, containerName) => backend.execDocker(["rm", "-f", containerName]);

/**
 * `docker rm -f <name>` against an already-absent container was observed to
 * exit 0 on this project's validated hosts (Docker Engine, both WSL2-hosted
 * and native Linux) — but that specific behavior is a Docker Engine version
 * detail, not a documented cross-version guarantee (Stage 3F.5.4-R3). On a
 * Docker Engine that instead exits non-zero for that case, this function
 * still treats it as idempotent success: it reuses `isDockerNotFoundError`
 * (never a broadened or duplicated pattern) against the thrown
 * `DockerCommandError`'s preserved stderr, exactly like
 * `inspectContainerPresence` does. Any other failure — daemon down, WSL
 * unavailable, permission denied, a generic unrelated "not found" — is
 * rethrown, never classified as absence.
 */
export async function removeContainerViaDocker(
  backend: ContainerHostBackend,
  containerName: string,
  dockerRemove: DockerRemoveFn = defaultDockerRemove,
): Promise<ContainerRemovalResult> {
  try {
    await dockerRemove(backend, containerName);
    return "removed";
  } catch (error) {
    const stderr = isDockerCommandError(error) ? error.stderr : "";
    if (isDockerNotFoundError(stderr)) {
      return "already-absent";
    }
    throw error;
  }
}

// ── Readiness ─────────────────────────────────────────────────────────────────

async function waitForContainerHealthy(backend: ContainerHostBackend, containerName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    try {
      const { stdout } = await backend.execDocker([
        "inspect",
        "--format",
        "{{.State.Health.Status}}",
        containerName,
      ]);
      lastStatus = stdout.trim();
      if (lastStatus === "healthy") return;
    } catch {
      // container may not exist yet from Docker's perspective for a brief
      // moment right after `docker run` returns — keep polling.
    }
    await sleep(500);
  }
  throw new Error(
    `[container-git-remote] container "${containerName}" did not become healthy within ${timeoutMs}ms ` +
      `(last status: "${lastStatus || "unknown"}").`,
  );
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

/**
 * Collects the failure diagnostics this module's transactional-startup
 * design requires: container inspect, recent logs, and port mapping. Never
 * touches key material — the only secret-shaped thing in this module (the
 * ephemeral private key) is referenced only by filesystem path everywhere
 * else, never read into a diagnostic string.
 */
export async function collectDiagnostics(backend: ContainerHostBackend, containerName: string): Promise<string> {
  const sections: string[] = [`host backend: ${backend.describe()}`, `container: ${containerName}`];
  const tryRun = async (label: string, args: string[]): Promise<void> => {
    try {
      const { stdout } = await backend.execDocker(args);
      sections.push(`--- ${label} ---\n${stdout.trim()}`);
    } catch (error) {
      sections.push(`--- ${label} (failed) ---\n${errMsg(error)}`);
    }
  };
  await tryRun("docker inspect", ["inspect", containerName]);
  await tryRun("docker logs (tail 200)", ["logs", "--tail", "200", containerName]);
  await tryRun("docker port", ["port", containerName]);
  return sections.join("\n\n");
}

// ── Image lifecycle (content-addressed — Stage 3F.5.4-R1) ───────────────────

interface EnsureImageBuiltDeps {
  imageExists: (backend: ContainerHostBackend, tag: string) => Promise<boolean>;
  buildImage: (backend: ContainerHostBackend, tag: string, buildContext: string, hash: string) => Promise<void>;
  /** Separated from `buildImage` so the hash/cache-reuse decision logic
   * this function exists to test is unit-testable without depending on
   * FIXTURE_DIR actually being a real host path — true only incidentally,
   * because this whole module happens to run on a real host in production,
   * not something the cache-invalidation logic itself should ever need to
   * know about. */
  resolveBuildContext: (backend: ContainerHostBackend) => Promise<string>;
}

const defaultEnsureImageBuiltDeps: EnsureImageBuiltDeps = {
  imageExists: (backend, tag) =>
    backend
      .execDocker(["image", "inspect", tag])
      .then(() => true)
      .catch(() => false),
  buildImage: async (backend, tag, buildContext, hash) => {
    await backend.execDocker([
      "build",
      "--label",
      FIXTURE_LABEL,
      "--label",
      `${FIXTURE_HASH_LABEL_PREFIX}${hash}`,
      "-t",
      tag,
      buildContext,
    ]);
  },
  resolveBuildContext: (backend) => backend.resolveBuildContext(FIXTURE_DIR),
};

/**
 * Builds (or reuses) the fixture image, keyed by a content-addressed tag
 * (`ris-e2e-git-ssh-server:<12-char-hash>` — see computeFixtureContentHash)
 * derived from the Dockerfile/entrypoint.sh/sshd_config actually on disk
 * right now, not a fixed `:dev` tag. Identical on both backends — the same
 * Dockerfile, the same hash, the same tag policy; only how the build
 * context path is resolved (`backend.resolveBuildContext`) and how `docker
 * build` is actually invoked (`backend.execDocker`) differ (Stage 3F.5.8A
 * Stage I's "one Dockerfile, one content hash" requirement).
 *
 * Stage 3F.5.4-R1 hardening: the original `:dev`-tag design reused
 * whatever image happened to already carry that tag, with no check that it
 * still matched the checked-out fixture source — editing the Dockerfile and
 * re-running a spec would silently keep testing against the *old* image.
 * Content-addressing makes that structurally impossible: a source edit
 * changes the hash, which changes the tag, which this function's own
 * `imageExists` check will then correctly report as absent, triggering a
 * rebuild — with no explicit cache-invalidation logic required.
 *
 * `forceRebuild` (RIS_E2E_CONTAINER_REBUILD=1) always rebuilds the exact
 * same content-addressed tag, even if it already exists — useful for
 * diagnostics (e.g. suspecting a corrupted local image) without needing to
 * touch the fixture source just to change its hash. Works identically on
 * both backends.
 *
 * The returned tag is the source of truth `startContainerRemote` runs —
 * never call `buildImageTag("dev")` (or any other tag) independently after
 * this returns.
 */
export async function ensureImageBuilt(
  backend: ContainerHostBackend,
  forceRebuild = false,
  sourceFiles: FixtureSourceFile[] = readFixtureSourceFiles(),
  deps: EnsureImageBuiltDeps = defaultEnsureImageBuiltDeps,
): Promise<string> {
  const hash = computeFixtureContentHash(sourceFiles);
  const tag = buildImageTag(hash);

  if (!forceRebuild) {
    const exists = await deps.imageExists(backend, tag);
    if (exists) {
      log(`reusing existing content-addressed image ${tag} (fixture source unchanged; set RIS_E2E_CONTAINER_REBUILD=1 to force a rebuild)`);
      return tag;
    }
  }

  const buildContext = await deps.resolveBuildContext(backend);
  log(`building fixture image ${tag} from ${buildContext}${forceRebuild ? " (forced rebuild)" : ""}`);
  try {
    await deps.buildImage(backend, tag, buildContext, hash);
  } catch (error) {
    throw new Error(
      withNativeFallbackHint(
        `[container-git-remote] failed to build ${tag} from ${buildContext} via ${backend.describe()}. ` +
          `${backend.buildFailureHint()} Underlying error: ${errMsg(error)}`,
      ),
      { cause: error },
    );
  }
  return tag;
}

export function shouldForceRebuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["RIS_E2E_CONTAINER_REBUILD"] === "1";
}

// ── Container SSH remote server ───────────────────────────────────────────────

export interface ContainerSshRemoteServer {
  backend: ContainerHostBackend;
  containerName: string;
  runId: string;
  port: number;
  username: string;
  /** Absolute host path to the ephemeral client private key (no passphrase). */
  identityPath: string;
  /** Host-side directory holding this run's key material — removed by cleanup. */
  workDir: string;
}

function resolveRunRoot(): string {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) {
    throw new Error(
      "[container-git-remote] RIS_E2E_RUN_ROOT is not set. Run via WDIO with the test-environment " +
        "initialized in wdio.conf.ts.",
    );
  }
  return runRoot;
}

// ── Injectable lifecycle operations ──────────────────────────────────────────
//
// Every side-effecting step startContainerRemote/cleanupContainerRemote/
// cleanupOrphanedContainers performs is exposed here as a narrow, injectable
// function — production code always uses defaultContainerOpsDeps (real
// backend/fs calls); tests inject fakes (including a fake `createBackend`
// returning a fully-stubbed `ContainerHostBackend`) for deterministic
// fault-injection coverage with no real WSL/Docker required (Stage
// 3F.5.4-R1's "lifecycle fault-injection tests" requirement, extended in
// Stage 3F.5.8A to cover backend selection too).

/**
 * Distinguishes "there was nothing to remove" from "removal was refused" —
 * both previously reported as the same silent no-op (Stage 3F.5.4-R2's
 * work-directory accuracy fix). `removeContainerWorkDir`'s existing
 * path-safety guard (`RIS_E2E_RUN_ROOT` unset, or `workDir` outside it —
 * see `isStrictChildPath`, never weakened here) now surfaces as `"refused"`
 * rather than quietly doing nothing and letting the caller assume success.
 */
export type WorkDirRemovalResult = "removed" | "already-absent" | "refused";

/**
 * Stage 3F.5.4-R3: `docker rm -f <already-absent-name>` was observed to
 * exit 0 on this project's validated hosts — but that specific idempotent-
 * exit-code behavior is a Docker Engine version detail, not a documented
 * cross-version guarantee. On a Docker Engine that instead exits non-zero
 * for `rm -f` against a missing container (Docker's own not-found stderr,
 * e.g. `Error response from daemon: No such container: <name>`), the
 * removal call must still be treated as idempotent success rather than a
 * genuine failure — see `defaultContainerOpsDeps.removeContainer`, which
 * classifies that exact stderr via `isDockerNotFoundError` (never a
 * broadened/duplicated pattern) instead of relying solely on the exit code.
 */
export type ContainerRemovalResult = "removed" | "already-absent";

/**
 * Stage 3F.5.4-R3: distinguishes "the config file was actually removed",
 * "there was nothing to remove", and "cleanup could not even determine
 * where to look" — the last of which was previously indistinguishable from
 * success (a silent `return` on a missing `RIS_E2E_RUN_ROOT` reported
 * `sshConfigCleared = true` purely because nothing threw). Mirrors
 * `WorkDirRemovalResult`'s own rationale: an inability to safely locate or
 * act on the target is a refusal, not a success.
 */
export type SshConfigRemovalResult = "removed" | "already-absent" | "refused";

export interface ContainerOpsDeps {
  /** Constructs (but does not preflight) a backend for the current
   * platform. Production always uses `createContainerHostBackend` with no
   * argument (real `process.platform`); tests inject a factory returning a
   * fully-stubbed `ContainerHostBackend`. */
  createBackend: () => ContainerHostBackend;
  ensureImageBuilt: (backend: ContainerHostBackend, forceRebuild: boolean) => Promise<string>;
  dockerRun: (backend: ContainerHostBackend, args: string[]) => Promise<void>;
  dockerPort: (backend: ContainerHostBackend, containerName: string) => Promise<string>;
  waitForHealthy: (backend: ContainerHostBackend, containerName: string, timeoutMs: number) => Promise<void>;
  collectDiagnostics: (backend: ContainerHostBackend, containerName: string) => Promise<string>;
  /** Idempotent by contract (Stage 3F.5.4-R3): resolves `"already-absent"`
   * rather than throwing when the container was already gone, on any
   * Docker Engine version's exact not-found result — never merely on a
   * non-throwing `rm -f` exit. Only a non-not-found failure ever throws. */
  removeContainer: (backend: ContainerHostBackend, containerName: string) => Promise<ContainerRemovalResult>;
  /** Exact-identity, tri-state presence check (never a substring/name-filter
   * match, and never collapses "couldn't tell" into "absent" — see
   * `ContainerPresence`/`inspectContainerPresence`, Stage 3F.5.4-R2). */
  inspectContainerPresence: (backend: ContainerHostBackend, containerName: string) => Promise<ContainerPresence>;
  listFixtureContainers: (backend: ContainerHostBackend, runId?: string) => Promise<string[]>;
  removeContainersByIds: (backend: ContainerHostBackend, ids: string[]) => Promise<void>;
  generateKeypair: (identityPath: string) => Promise<void>;
  securePrivateKeyFile: (identityPath: string) => void;
  readPublicKey: (identityPath: string) => string;
  installPublicKey: (backend: ContainerHostBackend, containerName: string, publicKey: string) => Promise<void>;
  removeWorkDir: (workDir: string) => Promise<WorkDirRemovalResult>;
  clearSshConfig: () => SshConfigRemovalResult;
}

/**
 * Narrow, structured-error-code check — deliberately never inspects
 * `error.message` (a "not found" substring match would risk conflating an
 * unrelated error that merely mentions "not found" in its text with a
 * genuine `ENOENT`, exactly the kind of ambiguity `isDockerNotFoundError`
 * already avoids for Docker errors by checking a specific field rather
 * than free text — see this module's own "do not classify errors by
 * message text" rule).
 */
export function isNodeErrorWithCode(error: unknown, code: NodeJS.ErrnoException["code"]): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

/** Injectable filesystem seam for `clearContainerSshConfig` (Stage
 * 3F.5.4-R4) — both operations throw on failure, exactly like their real
 * `node:fs` counterparts, so the classification logic below is unit-tested
 * with fabricated `NodeJS.ErrnoException`-shaped throws and no real
 * filesystem access (or NTFS ACL manipulation) required. */
export interface SshConfigFsDeps {
  lstat: (path: string) => void;
  remove: (path: string) => void;
}

const defaultSshConfigFsDeps: SshConfigFsDeps = {
  lstat: (path) => {
    lstatSync(path);
  },
  remove: (path) => {
    rmSync(path);
  },
};

/**
 * Stage 3F.5.4-R4: `existsSync()` only ever returns a boolean — it cannot
 * distinguish "the file genuinely does not exist" from "the filesystem
 * could not be inspected" (access denied, an inaccessible parent
 * directory, an I/O error, ...), so a real inspection failure was
 * previously misclassified as confirmed absence. `lstatSync` (not
 * `statSync` — this never needs to follow a symlink) is used instead: its
 * thrown error carries a structured `.code`, and only `ENOENT` may produce
 * `"already-absent"`. Every other thrown error (`EACCES`, `EPERM`,
 * `EBUSY`, `EIO`, `ENOTDIR`, an error with no recognized code at all) is
 * rethrown unchanged — never downgraded to `"refused"` (which stays
 * reserved for this function's own deliberate refusal to act, e.g. a
 * missing `RIS_E2E_RUN_ROOT`) and never silently treated as success.
 *
 * Exported (Stage 3F.5.4-R3) so its tri-state result can be exercised
 * directly against injected filesystem operations, without needing to go
 * through `cleanupContainerRemote`/`ContainerOpsDeps` — pure logic, same
 * testing rationale as `isStrictChildPath` itself. This logic has always
 * been platform-neutral — it operates on whatever `RIS_E2E_RUN_ROOT` and
 * `configPath` actually are on the host running it (a Windows path on
 * Windows, a Linux path on Linux); see Stage 3F.5.8A Stage N's Linux-path
 * test additions alongside the pre-existing Windows-path ones, neither
 * weakened by the other.
 *
 * Stage 3F.5.4-R5: the removal step is now also wrapped — a valid
 * time-of-check/time-of-use race exists between the `lstat` above
 * confirming presence and this `remove` call (another concurrent cleanup,
 * a forcibly-killed sibling process, ...). If `remove` itself throws
 * `ENOENT`, the resource is, by definition, now gone — exactly the outcome
 * `"already-absent"` already describes — so that specific race is
 * idempotent success, not a cleanup failure. Every other removal error
 * still propagates unchanged.
 */
export function clearContainerSshConfig(deps: SshConfigFsDeps = defaultSshConfigFsDeps): SshConfigRemovalResult {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) return "refused";
  const configPath = join(runRoot, "git", "ssh-remote-command.env");
  try {
    deps.lstat(configPath);
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return "already-absent";
    }
    throw error;
  }
  try {
    deps.remove(configPath);
    return "removed";
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return "already-absent";
    }
    throw error;
  }
}

/** Injectable filesystem seam for `removeContainerWorkDir` (Stage
 * 3F.5.4-R5) — async, mirroring `SshConfigFsDeps`'s synchronous shape but
 * for the promise-based `node:fs/promises` operations the work-directory
 * removal path already used. Both operations throw on failure, exactly
 * like their real counterparts, so the classification logic is
 * unit-tested with fabricated `NodeJS.ErrnoException`-shaped rejections
 * and no real filesystem access required. */
export interface WorkDirFsDeps {
  lstat: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

const defaultWorkDirFsDeps: WorkDirFsDeps = {
  lstat: async (path) => {
    await lstat(path);
  },
  remove: async (path) => {
    await rm(path, { recursive: true, maxRetries: 10, retryDelay: 100 });
  },
};

/**
 * Stage 3F.5.4-R5: replaces the same `existsSync()`-as-authority pattern
 * `clearContainerSshConfig` had (Stage 3F.5.4-R4) — this was the exact
 * follow-up gap that stage's own report flagged and deliberately left
 * unfixed. `existsSync()` returning `false` was read as `"already-absent"`
 * with no way to distinguish that from "the directory could not be
 * inspected" (access denied, an inaccessible parent, an I/O error) —
 * meaning a real inspection failure could report `workDirRemoved = true`
 * and let authoritative teardown pass with the directory (and the
 * ephemeral SSH keys inside it) still on disk. Now uses `lstat` (never
 * `statSync`-equivalent — this never needs to follow a symlink) with the
 * same `isNodeErrorWithCode`-based tri-state classification
 * `clearContainerSshConfig` uses: only `ENOENT` (on inspection *or* on
 * removal — see this function's own TOCTOU handling) produces
 * `"already-absent"`; `EACCES`, `EPERM`, `EBUSY`, `EIO`, `ENOTDIR`, and an
 * error with no recognized code at all are all rethrown unchanged. Path
 * safety (`RIS_E2E_RUN_ROOT` required, `isStrictChildPath`) and the
 * existing recursive-removal retry behavior are both preserved exactly.
 * Platform-neutral, same note as `clearContainerSshConfig` above.
 *
 * Exported directly (not a separately-named wrapper) for the same reason
 * `clearContainerSshConfig` is: the test must exercise the real production
 * classification logic against injected filesystem operations, not a
 * reimplemented copy.
 */
export async function removeContainerWorkDir(
  workDir: string,
  deps: WorkDirFsDeps = defaultWorkDirFsDeps,
): Promise<WorkDirRemovalResult> {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot || !isStrictChildPath(runRoot, workDir)) {
    return "refused";
  }
  try {
    await deps.lstat(workDir);
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return "already-absent";
    }
    throw error;
  }
  try {
    await deps.remove(workDir);
    return "removed";
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return "already-absent";
    }
    throw error;
  }
}

export const defaultContainerOpsDeps: ContainerOpsDeps = {
  createBackend: () => createContainerHostBackend(),
  ensureImageBuilt: (backend, forceRebuild) => ensureImageBuilt(backend, forceRebuild),
  dockerRun: async (backend, args) => {
    await backend.execDocker(args);
  },
  dockerPort: async (backend, containerName) => (await backend.execDocker(["port", containerName])).stdout,
  waitForHealthy: waitForContainerHealthy,
  collectDiagnostics,
  removeContainer: removeContainerViaDocker,
  inspectContainerPresence,
  listFixtureContainers: async (backend, runId) => {
    const { stdout } = await backend.execDocker(buildCleanupArgs(runId));
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  },
  removeContainersByIds: async (backend, ids) => {
    if (ids.length === 0) return;
    await backend.execDocker(["rm", "-f", ...ids]);
  },
  generateKeypair: async (identityPath) => {
    await execFileP("ssh-keygen", ["-t", "ed25519", "-f", identityPath, "-N", "", "-q"]);
  },
  securePrivateKeyFile: (identityPath) => securePrivateKeyFileImpl(identityPath),
  readPublicKey: (identityPath) => readFileSync(`${identityPath}.pub`, "utf8"),
  installPublicKey: (backend, containerName, publicKey) =>
    backend.execDockerWithStdin(["exec", "-i", containerName, "tee", "-a", CONTAINER_AUTHORIZED_KEYS], publicKey),
  removeWorkDir: removeContainerWorkDir,
  clearSshConfig: clearContainerSshConfig,
};

// ── Transactional startup + rollback (Stage 3F.5.4-R1) ──────────────────────

/** Whatever startContainerRemote has actually acquired so far at the point
 * of failure — every field is optional because failure can happen before
 * any given resource was ever created. */
export interface PartialContainerFixtureState {
  backend?: ContainerHostBackend;
  keepAliveStarted?: boolean;
  containerName?: string;
  workDir?: string;
  /** True only once configureContainerSsh (a layer above startContainerRemote
   * — see createContainerRemoteFixture) has successfully written the
   * wrapper's env file for this run. Always false for a state built purely
   * from startContainerRemote's own internals, which never writes it. */
  sshConfigCreated?: boolean;
}

type RollbackDeps = Pick<
  ContainerOpsDeps,
  "collectDiagnostics" | "removeContainer" | "inspectContainerPresence" | "removeWorkDir" | "clearSshConfig"
>;

/**
 * Rolls back the one container `backend`/`containerName` names, tri-state
 * aware (Stage 3F.5.4-R2's defect-1 fix applied to rollback, not just
 * `cleanupContainerRemote`): inspects presence first — confirmed absent
 * needs no removal attempt at all; confirmed present or unknown (a failed
 * inspection proves nothing, so it still gets a safe removal attempt — the
 * name is unique to this run, per this module's "track the name before
 * `docker run`" fix, so an idempotent `docker rm -f` is always safe to try)
 * both trigger `removeContainer`. A final presence check (skipped only when
 * the initial check already proved absence) is what actually sets
 * `containerVerifiedAbsent` — a failed final check stays `false` rather
 * than being assumed away.
 */
async function rollbackContainerByName(
  backend: ContainerHostBackend,
  containerName: string,
  deps: RollbackDeps,
): Promise<{ diagnostics: string[]; containerVerifiedAbsent: boolean }> {
  const diagnostics: string[] = [];

  try {
    const diag = await deps.collectDiagnostics(backend, containerName);
    diagnostics.push(`diagnostics for ${containerName} before rollback:\n${diag}`);
  } catch (error) {
    diagnostics.push(`collecting diagnostics for ${containerName} failed: ${errMsg(error)}`);
  }

  const initialPresence = await deps.inspectContainerPresence(backend, containerName);
  if (initialPresence.status === "unknown") {
    diagnostics.push(`presence of "${containerName}" could not be determined before rollback: ${initialPresence.error}`);
  }

  if (initialPresence.status !== "absent") {
    try {
      // "already-absent" is not recorded as a diagnostic — removeContainer
      // is idempotent by contract (Stage 3F.5.4-R3), so an already-gone
      // container is a successful outcome here, not a failure to remove
      // something that was never there.
      await deps.removeContainer(backend, containerName);
    } catch (error) {
      diagnostics.push(`removing container "${containerName}" failed: ${errMsg(error)}`);
    }
  }

  const finalPresence =
    initialPresence.status === "absent" ? initialPresence : await deps.inspectContainerPresence(backend, containerName);
  if (finalPresence.status === "unknown") {
    diagnostics.push(`presence of "${containerName}" could not be verified after rollback: ${finalPresence.error}`);
  } else if (finalPresence.status === "present") {
    diagnostics.push(`container "${containerName}" still present after rollback removal attempt`);
  }

  return { diagnostics, containerVerifiedAbsent: finalPresence.status === "absent" };
}

/**
 * Rolls back whatever subset of a container fixture's resources partial
 * `state` describes, in the order this module's transactional-startup
 * design specifies: diagnostics + tri-state presence-aware container
 * removal (`rollbackContainerByName`, Stage 3F.5.4-R2) → remove work
 * directory → clear SSH wrapper config → stop keep-alive last (so it stays
 * available for the Docker commands the earlier steps still need — a no-op
 * on the Linux backend, harmless to call unconditionally). Every step is
 * independently guarded — a missing field is skipped entirely (safe with no
 * container, no work directory, etc.), and a failure in one step never
 * prevents the next from being attempted. Returns the list of diagnostic
 * strings produced (collected container diagnostics plus any step
 * failures) — never throws itself, so a caller's own error handling is
 * never masked by a rollback failure.
 */
export async function rollbackPartialContainerFixture(
  state: PartialContainerFixtureState,
  deps: RollbackDeps = defaultContainerOpsDeps,
): Promise<string[]> {
  const diagnostics: string[] = [];

  if (state.backend && state.containerName) {
    const containerResult = await rollbackContainerByName(state.backend, state.containerName, deps);
    diagnostics.push(...containerResult.diagnostics);
  }

  if (state.workDir) {
    try {
      const result = await deps.removeWorkDir(state.workDir);
      if (result === "refused") {
        diagnostics.push(`removing work directory "${state.workDir}" was refused (outside RIS_E2E_RUN_ROOT or run root unset)`);
      }
    } catch (error) {
      diagnostics.push(`removing work directory "${state.workDir}" failed: ${errMsg(error)}`);
    }
  }

  if (state.sshConfigCreated) {
    try {
      const result = deps.clearSshConfig();
      if (result === "refused") {
        diagnostics.push(
          "clearing ssh config was refused (RIS_E2E_RUN_ROOT unavailable or the config path could not be safely determined)",
        );
      }
    } catch (error) {
      diagnostics.push(`clearing ssh config failed: ${errMsg(error)}`);
    }
  }

  if (state.keepAliveStarted && state.backend) {
    try {
      state.backend.stopKeepAlive();
    } catch (error) {
      diagnostics.push(`stopping keep-alive failed: ${errMsg(error)}`);
    }
  }

  return diagnostics;
}

/**
 * Starts the containerized Git-over-SSH fixture: resolves a working host
 * backend (Windows: a WSL2 distribution with Docker; Linux: confirms native
 * Docker is reachable — see `ContainerHostBackend.preflight`), keeps a
 * keep-alive session attached for the fixture's lifetime (a no-op on
 * Linux), ensures the fixture image is built, starts a uniquely-named/
 * labeled container publishing SSH on a random 127.0.0.1 port, waits for
 * its healthcheck, generates an ephemeral client keypair, and installs the
 * public half into the container.
 *
 * Transactional (Stage 3F.5.4-R1): every resource acquired along the way is
 * tracked in a `PartialContainerFixtureState`. On *any* failure — including
 * ones after the container already exists (port parsing, healthcheck,
 * ssh-keygen, key permissions, installPublicKey, …) — that partial state is
 * rolled back via `rollbackPartialContainerFixture` before the error is
 * rethrown. The rethrown error is the *same* error instance the failing
 * step produced (so `error instanceof Error && error === originalError`
 * holds for callers) with any rollback failures attached as a
 * non-replacing `rollbackDiagnostics` array property — the original failure
 * is never masked by a cleanup problem.
 *
 * Mirrors git-remote.ts's startRemote() in shape (both return a server
 * object with `port`/`username`/`identityPath` that configureSsh-equivalents
 * turn into the same ssh-wrapper.sh env file), but every implementation
 * detail from there down is container-specific.
 */
export async function startContainerRemote(
  options: { forceRebuild?: boolean } = {},
  deps: ContainerOpsDeps = defaultContainerOpsDeps,
): Promise<ContainerSshRemoteServer> {
  const runRoot = resolveRunRoot();
  const state: PartialContainerFixtureState = {};

  try {
    const backend = deps.createBackend();
    state.backend = backend;
    await backend.preflight();
    log(`using container host backend: ${backend.describe()}`);

    backend.startKeepAlive();
    state.keepAliveStarted = true;

    const imageTag = await deps.ensureImageBuilt(backend, options.forceRebuild ?? shouldForceRebuild());

    const runId = generateRunId();
    const containerName = buildContainerName(runId);
    // Recorded before `docker run` is even attempted (Stage 3F.5.4-R2's
    // defect-4 fix): the name is unique and generated by this run, so it's
    // always safe to target for rollback — even if `docker run` itself
    // throws after Docker has already created the container engine-side
    // (partial success, a lost response, an interrupted call). Without
    // this, such a failure left an orphaned container no rollback path
    // ever knew the name of.
    state.containerName = containerName;

    log(`starting container ${containerName} from ${imageTag}`);
    await deps.dockerRun(backend, buildDockerRunArgs({ containerName, imageTag, runId }));

    const portOutput = await deps.dockerPort(backend, containerName);
    const parsedPort = parsePublishedPort(portOutput);
    if (parsedPort === null) {
      // Stage 3F.5.7-R1: deliberately no withNativeFallbackHint() here. Docker
      // already reported the container running by this point (docker run
      // succeeded) — an unparseable `docker port` output is an internal
      // fixture invariant failure (a defect in this module or an
      // unanticipated Docker output format), not a missing prerequisite.
      // Suggesting the native fallback here would read as "here's how to
      // work around this bug" rather than surface it.
      throw new Error(
        `[container-git-remote] could not parse a 127.0.0.1 published port for "${containerName}" from: "${portOutput.trim()}"`,
      );
    }
    await deps.waitForHealthy(backend, containerName, 20_000);
    log(`container healthy: 127.0.0.1:${parsedPort}`);

    const gitDir = join(runRoot, "git");
    mkdirSync(gitDir, { recursive: true });
    const workDir = join(gitDir, `container-ssh-${runId}`);
    mkdirSync(workDir, { recursive: true });
    state.workDir = workDir;
    const identityPath = join(workDir, "id_ed25519");

    log("generating ephemeral client ed25519 keypair (no passphrase)");
    await deps.generateKeypair(identityPath);
    deps.securePrivateKeyFile(identityPath);

    const publicKey = deps.readPublicKey(identityPath);
    await deps.installPublicKey(backend, containerName, publicKey);
    log("public key installed in container");

    return {
      backend,
      containerName,
      runId,
      port: parsedPort,
      username: CONTAINER_USERNAME,
      identityPath,
      workDir,
    };
  } catch (error) {
    const rollbackDiagnostics = await rollbackPartialContainerFixture(state, deps).catch((rollbackError) => [
      `rollback itself threw: ${errMsg(rollbackError)}`,
    ]);
    if (rollbackDiagnostics.length > 0 && error instanceof Error) {
      (error as Error & { rollbackDiagnostics?: string[] }).rollbackDiagnostics = rollbackDiagnostics;
    }
    throw error;
  }
}

/**
 * Writes the exact same env file support/ssh-wrapper.sh reads
 * (RIS_SSH_REMOTE_PORT/RIS_SSH_REMOTE_IDENTITY) that git-remote.ts's own
 * configureSsh writes — so wdio.conf.ts's unconditional GIT_SSH_COMMAND
 * registration (pointing at the static ssh-wrapper.sh) serves either
 * provider with zero changes. Duplicated here rather than imported: it's a
 * few lines of generic env-file writing, not sshd-specific behavior, and
 * this module's own design asks it not to reach into git-remote.ts's
 * private implementation details.
 */
export function configureContainerSsh(server: ContainerSshRemoteServer): void {
  const runRoot = resolveRunRoot();
  const gitDir = join(runRoot, "git");
  mkdirSync(gitDir, { recursive: true });
  const configPath = join(gitDir, "ssh-remote-command.env");
  writeFileSync(
    configPath,
    `RIS_SSH_REMOTE_PORT=${shQuote(String(server.port))}\nRIS_SSH_REMOTE_IDENTITY=${shQuote(server.identityPath)}\n`,
  );
  log(`wrote ssh-wrapper config -> ${configPath} (port=${server.port})`);
}

// ── Cleanup (successful-run teardown — Stage 3F.5.4-R2 authoritative) ───────

export interface CleanupResult {
  sshConfigCleared: boolean;
  /** True once a removal call was made — not itself a success signal (the
   * call is idempotent and doesn't throw for an already-absent container,
   * see `isDockerNotFoundError`'s exit-0-on-`rm -f` finding); the
   * authoritative signal is `containerVerifiedAbsent`, always set from a
   * post-removal `inspectContainerPresence` call, never inferred from this
   * flag or from the removal call simply not throwing. */
  containerRemovalAttempted: boolean;
  containerRemoved: boolean;
  /** Only ever `true` when a tri-state presence check (`ContainerPresence`)
   * conclusively reported `"absent"` — a `"present"` or `"unknown"` result
   * (inspection itself failed: daemon down, WSL unavailable, permission
   * denied, …) both leave this `false`. This is the field
   * `isCleanupSuccessful` treats as authoritative for the container; a
   * generic inspection failure can never masquerade as removal success
   * (Stage 3F.5.4-R2's defect-1 fix). */
  containerVerifiedAbsent: boolean;
  /** Derived from `WorkDirRemovalResult`: `true` for `"removed"` or
   * `"already-absent"` (both are success — see idempotency requirements),
   * `false` for `"refused"` (the path-safety guard declined to act, which
   * must never be reported as if the directory were gone). */
  workDirRemoved: boolean;
  keepAliveStopRequested: boolean;
  keepAliveStopped: boolean;
  /** Non-fatal problems encountered during cleanup — cleanup never throws;
   * a failed step is recorded here instead (see this module's "do not
   * silently treat a failed container removal as success" requirement). */
  errors: string[];
}

/**
 * Idempotent, non-throwing cleanup for a fully-started container fixture.
 * Order matters (Stage 3F.5.4-R1, unchanged by R2): clear SSH wrapper
 * config → remove container → verify removal (exact-identity, tri-state
 * presence check — see `ContainerPresence`/`inspectContainerPresence`,
 * Stage 3F.5.4-R2) → remove host work directory → stop the keep-alive
 * **last, in a `finally`** (a no-op on Linux, harmless to call
 * unconditionally), so it stays available for every Docker command the
 * earlier steps still need, even if one of them fails. A failed container
 * removal is recorded in `errors`/logged as a warning, never silently
 * treated as success. Safe to call twice on the same server — each step
 * tolerates its target already being gone, and an already-absent target is
 * reported as success, not as a failure to remove something that was never
 * there (Stage 3F.5.4-R2's idempotency requirement).
 */
export async function cleanupContainerRemote(
  server: ContainerSshRemoteServer,
  deps: ContainerOpsDeps = defaultContainerOpsDeps,
): Promise<CleanupResult> {
  const errors: string[] = [];
  let sshConfigCleared = false;
  let containerRemovalAttempted = false;
  let containerRemoved = false;
  let containerVerifiedAbsent = false;
  let workDirRemoved = false;
  let keepAliveStopRequested = false;
  let keepAliveStopped = false;

  try {
    try {
      const sshConfigResult = deps.clearSshConfig();
      // "removed" and "already-absent" both count as cleared — the
      // distinguishing case is "refused" (RIS_E2E_RUN_ROOT unavailable or
      // the config path could not be safely determined), which must never
      // be reported as if the config were conclusively cleared (Stage
      // 3F.5.4-R3's defect-2 fix).
      sshConfigCleared = sshConfigResult !== "refused";
      if (sshConfigResult === "refused") {
        errors.push(
          "clearing ssh config was refused (RIS_E2E_RUN_ROOT unavailable or the config path could not be safely determined)",
        );
      }
    } catch (error) {
      errors.push(`clearing ssh config failed: ${errMsg(error)}`);
    }

    try {
      containerRemovalAttempted = true;
      // "already-absent" is idempotent success, not a failure to remove
      // something that was never there (Stage 3F.5.4-R3's defect-1 fix) —
      // only a genuine removal failure ever reaches the catch below.
      const removalResult = await deps.removeContainer(server.backend, server.containerName);
      containerRemoved = removalResult === "removed";
    } catch (error) {
      errors.push(`removing container "${server.containerName}" failed: ${errMsg(error)}`);
    }

    // Guarded so an unexpectedly throwing injected inspectContainerPresence
    // (a custom test/ops dependency that violates its own never-throws
    // contract) degrades to "unknown" rather than aborting cleanup before
    // work-directory removal and keep-alive shutdown ever run.
    let presence: ContainerPresence;
    try {
      presence = await deps.inspectContainerPresence(server.backend, server.containerName);
    } catch (error) {
      presence = { status: "unknown", error: errMsg(error) };
    }
    containerVerifiedAbsent = presence.status === "absent";
    if (presence.status === "present") {
      const warning = `container "${server.containerName}" still present after removal attempt — may require manual cleanup`;
      errors.push(warning);
      log(`WARNING: ${warning}`);
    } else if (presence.status === "unknown") {
      const warning = `presence of container "${server.containerName}" could not be verified after removal: ${presence.error}`;
      errors.push(warning);
      log(`WARNING: ${warning}`);
    }

    try {
      const workDirResult = await deps.removeWorkDir(server.workDir);
      workDirRemoved = workDirResult !== "refused";
      if (workDirResult === "refused") {
        errors.push(
          `removing work directory "${server.workDir}" was refused (outside RIS_E2E_RUN_ROOT or run root unset)`,
        );
      }
    } catch (error) {
      errors.push(`removing work directory "${server.workDir}" failed: ${errMsg(error)}`);
    }
  } finally {
    keepAliveStopRequested = true;
    try {
      server.backend.stopKeepAlive();
      keepAliveStopped = true;
    } catch (error) {
      errors.push(`stopping keep-alive failed: ${errMsg(error)}`);
    }
  }

  if (errors.length > 0) {
    log(`cleanup for ${server.containerName} completed with ${errors.length} error(s): ${errors.join(" | ")}`);
  } else {
    log(`cleaned up container ${server.containerName} and ${server.workDir}`);
  }

  return {
    sshConfigCleared,
    containerRemovalAttempted,
    containerRemoved,
    containerVerifiedAbsent,
    workDirRemoved,
    keepAliveStopRequested,
    keepAliveStopped,
    errors,
  };
}

/**
 * The fields `isCleanupSuccessful` treats as authoritative — anything not
 * true here is a reason teardown must fail the spec (Stage 3F.5.4-R2's
 * defect-2 fix), listed alongside every `CleanupResult.errors` entry.
 * `containerRemoved`/`containerRemovalAttempted` are deliberately *not*
 * part of the predicate: an idempotent removal call that ran against an
 * already-absent container is still a successful cleanup (see
 * `CleanupResult.containerVerifiedAbsent`'s own doc comment).
 */
function collectCleanupIssues(result: CleanupResult): string[] {
  const issues: string[] = [];
  if (!result.sshConfigCleared) issues.push("sshConfigCleared=false");
  if (!result.containerVerifiedAbsent) {
    issues.push("containerVerifiedAbsent=false (container presence was not conclusively confirmed absent)");
  }
  if (!result.workDirRemoved) issues.push("workDirRemoved=false");
  if (!result.keepAliveStopped) issues.push("keepAliveStopped=false");
  issues.push(...result.errors);
  return issues;
}

/**
 * The clear success predicate this module's teardown design requires: a
 * container cleanup is only successful when SSH config was cleared, the
 * container is *conclusively* verified absent (never merely "removal
 * didn't throw" — see `CleanupResult.containerVerifiedAbsent`), the work
 * directory was removed or was already absent, the keep-alive was
 * confirmed stopped, and no other error was recorded.
 */
export function isCleanupSuccessful(result: CleanupResult): boolean {
  return collectCleanupIssues(result).length === 0;
}

/** Human-readable teardown-failure diagnostic — container name plus every
 * unmet success-predicate field and recorded error, for use in the WDIO
 * after-hook's thrown error (see `assertCleanupSucceeded`). */
export function formatCleanupFailure(result: CleanupResult, containerName?: string): string {
  const label = containerName ? ` for container "${containerName}"` : "";
  const issues = collectCleanupIssues(result);
  return [`[container-git-remote] cleanup${label} was not conclusively successful:`, ...issues.map((issue) => `  - ${issue}`)].join(
    "\n",
  );
}

/**
 * Throws a descriptive error (via `formatCleanupFailure`) when `result` was
 * not conclusively successful. Intended for a WDIO `after()` hook — makes
 * cleanup success part of the test result instead of a result the spec
 * silently discards (Stage 3F.5.4-R2's defect-2 fix: "a WDIO spec cannot
 * pass when its fixture teardown reports unremoved or unverified
 * resources").
 */
export function assertCleanupSucceeded(result: CleanupResult, containerName?: string): void {
  if (!isCleanupSuccessful(result)) {
    throw new Error(formatCleanupFailure(result, containerName));
  }
}

// ── Provider-neutral cleanup contract (Stage 3F.5.4-R2) ─────────────────────
//
// The native (support/git-remote.ts) and container fixtures previously
// exposed `cleanup(): Promise<unknown>` at the RemoteFixture boundary the
// spec uses — a shape so weak the spec had no way to act on a cleanup
// failure even if it wanted to. FixtureCleanupResult is the shared,
// providerneutral result both adapters map onto; the spec's single after()
// hook can then assert against it without forking on provider.

export interface FixtureCleanupResult {
  ok: boolean;
  provider: "native" | "container";
  errors: string[];
}

/** Maps a container-specific `CleanupResult` onto the shared
 * provider-neutral shape — the container adapter's side of the contract
 * (see this section's own doc comment). */
export function toFixtureCleanupResult(result: CleanupResult): FixtureCleanupResult {
  const issues = collectCleanupIssues(result);
  return { ok: issues.length === 0, provider: "container", errors: issues };
}

export function formatFixtureCleanupFailure(result: FixtureCleanupResult): string {
  return [
    `[e2e] ${result.provider} fixture cleanup did not conclusively succeed:`,
    ...result.errors.map((issue) => `  - ${issue}`),
  ].join("\n");
}

/** Provider-neutral counterpart to `assertCleanupSucceeded` — the one call
 * a WDIO `after()` hook needs regardless of which provider `fixture.cleanup()`
 * came from. Also rejects an internally inconsistent result (`ok: true`
 * with a non-empty `errors` array — Stage 3F.5.4-R3's defensive hardening):
 * such a result cannot come from `toFixtureCleanupResult` itself, but a
 * hand-built or third-party-adapter result could carry it, and silently
 * trusting `ok` while discarding recorded errors would be exactly the kind
 * of self-reported-without-verification success this stage's teardown
 * work exists to close off. */
export function assertFixtureCleanupSucceeded(result: FixtureCleanupResult): void {
  if (result.ok && result.errors.length > 0) {
    throw new Error(
      `[e2e] ${result.provider} fixture cleanup reported ok:true but recorded ${result.errors.length} error(s) — treating as failed:\n` +
        result.errors.map((issue) => `  - ${issue}`).join("\n"),
    );
  }
  if (!result.ok) {
    throw new Error(formatFixtureCleanupFailure(result));
  }
}

/**
 * Safe, label-scoped sweep for containers left behind by a forcibly-killed
 * test process (see this module's cleanup contract). Only ever removes the
 * exact container IDs `listFixtureContainers` returns — which is itself
 * always filtered to FIXTURE_LABEL (optionally further scoped to one run
 * id) — never anything else on the host; this function has no path that
 * falls back to "remove everything" if the filtered list comes back empty
 * or malformed.
 */
export async function cleanupOrphanedContainers(
  backend: ContainerHostBackend,
  runId?: string,
  deps: Pick<ContainerOpsDeps, "listFixtureContainers" | "removeContainersByIds"> = defaultContainerOpsDeps,
): Promise<string[]> {
  const ids = await deps.listFixtureContainers(backend, runId);
  if (ids.length === 0) return [];
  await deps.removeContainersByIds(backend, ids);
  return ids;
}

// ── Atomic fixture initialization (Stage 3F.5.4-R1) ──────────────────────────

export interface ContainerRemoteFixtureHandle {
  createBareRemote(label: string): Promise<string>;
  buildRemoteUrl(bareRepoPath: string): string;
  /** Stage 3F.5.5 — the container counterpart to git-remote.ts's
   * `seedBareRemoteFromLocalRepo`, needed by specs (e.g. git-clone-workflows)
   * that require remote content to exist *before* the application acts on
   * it. See `seedContainerBareRemoteFromLocalRepo`'s own doc comment. */
  seedBareRemote(localRepoPath: string, bareRepoPath: string, branch: string): Promise<void>;
  getRemoteHeadCommit(bareRepoPath: string, ref?: string): Promise<string>;
  getRemoteCommitCount(bareRepoPath: string, ref?: string): Promise<number>;
  pushSimulatedRemoteCommit(bareRepoPath: string, branch: string, fileName: string, message: string): Promise<string>;
  /** Provider-neutral (Stage 3F.5.4-R2) — see `FixtureCleanupResult`. Never
   * `Promise<unknown>`: a caller (the spec's after() hook) must be able to
   * act on whether cleanup actually succeeded. */
  cleanup(): Promise<FixtureCleanupResult>;
}

/** An `Error` decorated with cleanup diagnostics collected while handling
 * that same error (Stage 3F.5.4-R2's defect-3 fix) — the original error is
 * never replaced, only annotated. */
export interface ErrorWithCleanupDiagnostics extends Error {
  cleanupDiagnostics?: string[];
}

export interface CreateContainerRemoteFixtureDeps {
  startContainerRemote: (options?: { forceRebuild?: boolean }) => Promise<ContainerSshRemoteServer>;
  configureContainerSsh: (server: ContainerSshRemoteServer) => void;
  cleanupContainerRemote: (server: ContainerSshRemoteServer) => Promise<CleanupResult>;
}

const defaultCreateContainerRemoteFixtureDeps: CreateContainerRemoteFixtureDeps = {
  startContainerRemote: (options) => startContainerRemote(options),
  configureContainerSsh,
  cleanupContainerRemote: (server) => cleanupContainerRemote(server),
};

/**
 * Atomic initialization boundary for the container provider (Stage
 * 3F.5.4-R1's defect 2 fix): calls `startContainerRemote()` then
 * `configureContainerSsh()`, and only returns the ready provider
 * abstraction once *both* succeed. Callers (the spec) should use this
 * factory instead of calling `startContainerRemote()`/
 * `configureContainerSsh()` separately and building the fixture object
 * themselves — doing that left a window where `startContainerRemote()`
 * had already succeeded (container running, keys installed) but a
 * `configureContainerSsh()` failure meant the caller's own fixture
 * variable was never assigned, so nothing ever called cleanup.
 *
 * Here, by the time `configureContainerSsh()` runs, a complete
 * `ContainerSshRemoteServer` already exists — so its failure path calls
 * `cleanupContainerRemote()` directly (not `rollbackPartialContainerFixture`,
 * which exists specifically for the *incomplete*-server case inside
 * `startContainerRemote()` itself) before rethrowing the original error.
 *
 * Stage 3F.5.4-R2's defect-3 fix: that rethrow used to discard whatever
 * `cleanupContainerRemote()` found — a caller diagnosing "why did the
 * fixture fail to start" had no idea whether the container it left behind
 * was actually cleaned up. The *original* configuration error is always
 * what's thrown (the same instance when it already was an `Error`; a
 * non-`Error` thrown value is wrapped in one with the original value as
 * `cause` — see `ErrorWithCleanupDiagnostics`); cleanup's outcome — a
 * failed/unverified `CleanupResult`, or the cleanup call itself throwing —
 * is attached as a non-replacing `cleanupDiagnostics` array property, and
 * omitted entirely when cleanup fully succeeds.
 */
export async function createContainerRemoteFixture(
  options: { forceRebuild?: boolean } = {},
  deps: CreateContainerRemoteFixtureDeps = defaultCreateContainerRemoteFixtureDeps,
): Promise<ContainerRemoteFixtureHandle> {
  const server = await deps.startContainerRemote(options);
  try {
    deps.configureContainerSsh(server);
  } catch (rawError) {
    const originalError: ErrorWithCleanupDiagnostics =
      rawError instanceof Error ? rawError : new Error(String(rawError), { cause: rawError });

    let cleanupDiagnostics: string[] | undefined;
    try {
      const cleanupResult = await deps.cleanupContainerRemote(server);
      if (!isCleanupSuccessful(cleanupResult)) {
        cleanupDiagnostics = collectCleanupIssues(cleanupResult);
      }
    } catch (cleanupError) {
      cleanupDiagnostics = [`cleanup itself threw: ${errMsg(cleanupError)}`];
    }
    if (cleanupDiagnostics && cleanupDiagnostics.length > 0) {
      originalError.cleanupDiagnostics = cleanupDiagnostics;
    }
    throw originalError;
  }
  return {
    createBareRemote: (label) => createContainerBareRemote(server, label),
    buildRemoteUrl: (bareRepoPath) => buildContainerSshRemoteUrl(bareRepoPath),
    seedBareRemote: (localRepoPath, bareRepoPath, branch) =>
      seedContainerBareRemoteFromLocalRepo(server, localRepoPath, bareRepoPath, branch),
    getRemoteHeadCommit: (bareRepoPath, ref) => getContainerRemoteHeadCommit(server, bareRepoPath, ref),
    getRemoteCommitCount: (bareRepoPath, ref) => getContainerRemoteCommitCount(server, bareRepoPath, ref),
    pushSimulatedRemoteCommit: (bareRepoPath, branch, fileName, message) =>
      pushSimulatedContainerRemoteCommit(server, bareRepoPath, branch, fileName, message),
    cleanup: async () => toFixtureCleanupResult(await deps.cleanupContainerRemote(server)),
  };
}

// ── Bare remote repositories (administered via `docker exec`, as root) ──────
//
// Per this module's own security design: "Repository administration may use
// docker exec. Application Git operations must use SSH from the host."
// Every function below runs inside the container as root over `docker
// exec`, via `server.backend.execDocker(...)`; the application under test
// never talks to the container any way other than the SSH port these
// functions never touch.

export async function createContainerBareRemote(
  server: ContainerSshRemoteServer,
  label = "remote",
): Promise<string> {
  assertSafeIdentifier(label, "repo label");
  const suffix = generateRunId();
  const bareDir = `${CONTAINER_REPOS_DIR}/${label}-${suffix}.git`;
  const bareDirQ = shQuote(bareDir);
  const script = `mkdir -p ${bareDirQ} && git init --bare -q ${bareDirQ} && chown -R git:git ${bareDirQ}`;
  await server.backend.execDocker(["exec", server.containerName, "sh", "-c", script]);
  return bareDir;
}

/**
 * Seeds an otherwise-empty container-hosted bare remote with `localRepoPath`'s
 * current branch — the container counterpart to git-remote.ts's
 * `seedBareRemoteFromLocalRepo` (Stage 3F.5.5). That function pushes
 * directly to the bare repo's filesystem path because the native fixture's
 * remote is local to the host; this container's bare remote is only
 * reachable over SSH, so seeding here uses the exact same real SSH
 * transport the application itself uses (`GIT_SSH_COMMAND` -> `ssh-wrapper.sh`
 * -> this run's ephemeral identity/port, already wired up by
 * `configureContainerSsh` by the time a spec calls this) — test-side only,
 * a real `git push`, never a call into the application.
 *
 * Mirrors `seedBareRemoteFromLocalRepo`'s own HEAD-fix rationale exactly:
 * `git init --bare` (`createContainerBareRemote`) sets the bare repo's
 * symbolic HEAD to whatever `init.defaultBranch` resolves to inside the
 * container image, independent of `branch` — left to chance, a mismatched
 * HEAD produces a `git clone` that exits 0 but checks out nothing (see that
 * function's own doc comment for the full failure mode). Fixed explicitly
 * here via `docker exec`, administrative per this module's own "Repository
 * administration may use docker exec" contract.
 */
export async function seedContainerBareRemoteFromLocalRepo(
  server: ContainerSshRemoteServer,
  localRepoPath: string,
  bareRepoPath: string,
  branch: string,
): Promise<void> {
  const remoteUrl = buildContainerSshRemoteUrl(bareRepoPath);
  // Explicit full refspec (Stage 3F.5.5-R1) — removes any ambiguity in
  // short-ref resolution and makes the source/destination namespaces
  // unambiguous, rather than relying on git's own short-name inference.
  await runGit(localRepoPath, ["push", "-q", remoteUrl, `refs/heads/${branch}:refs/heads/${branch}`]);
  await server.backend.execDocker([
    "exec",
    server.containerName,
    "git",
    "-C",
    bareRepoPath,
    "symbolic-ref",
    "HEAD",
    `refs/heads/${branch}`,
  ]);
}

export async function getContainerRemoteHeadCommit(
  server: ContainerSshRemoteServer,
  bareRepoPath: string,
  ref = "HEAD",
): Promise<string> {
  const { stdout } = await server.backend.execDocker([
    "exec",
    server.containerName,
    "git",
    "-C",
    bareRepoPath,
    "rev-parse",
    ref,
  ]);
  return stdout.trim();
}

export async function getContainerRemoteCommitCount(
  server: ContainerSshRemoteServer,
  bareRepoPath: string,
  ref = "HEAD",
): Promise<number> {
  const { stdout } = await server.backend.execDocker([
    "exec",
    server.containerName,
    "git",
    "-C",
    bareRepoPath,
    "rev-list",
    "--count",
    ref,
  ]);
  return Number.parseInt(stdout.trim(), 10);
}

/**
 * Simulates a teammate's commit landing on the remote — mirrors
 * git-remote.ts's pushSimulatedRemoteCommit, but since the bare repo lives
 * inside the container's filesystem (not reachable from the test runner
 * directly), the whole clone/commit/push/cleanup sequence runs inside the
 * container over a single `docker exec ... sh -c` script, with every
 * interpolated value centrally quoted through shQuote.
 */
export async function pushSimulatedContainerRemoteCommit(
  server: ContainerSshRemoteServer,
  bareRepoPath: string,
  branch: string,
  fileName: string,
  message: string,
): Promise<string> {
  assertSafeIdentifier(fileName, "file name");
  const scratchDir = `/tmp/ris-e2e-remote-sim-${generateRunId()}`;
  const scratchQ = shQuote(scratchDir);
  const filePathQ = shQuote(`${scratchDir}/${fileName}`);
  const script = [
    `git clone -q ${shQuote(bareRepoPath)} ${scratchQ}`,
    `git -C ${scratchQ} config user.name ${shQuote("RIS WDIO Remote Simulator")}`,
    `git -C ${scratchQ} config user.email ${shQuote("wdio-remote-sim@localhost.invalid")}`,
    `printf '%s\\n' ${shQuote(message)} > ${filePathQ}`,
    `git -C ${scratchQ} add -A`,
    `git -C ${scratchQ} commit -q -m ${shQuote(message)}`,
    `git -C ${scratchQ} push -q origin HEAD:${shQuote(branch)}`,
    `git -C ${scratchQ} rev-parse HEAD`,
    `rm -rf ${scratchQ}`,
  ].join(" && ");
  const { stdout } = await server.backend.execDocker(["exec", server.containerName, "sh", "-c", script]);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sha = lines[lines.length - 1];
  if (!sha) {
    throw new Error(`[container-git-remote] pushSimulatedContainerRemoteCommit produced no commit SHA: "${stdout}"`);
  }
  return sha;
}
