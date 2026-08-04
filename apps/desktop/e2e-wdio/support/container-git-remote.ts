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
 * running plain OpenSSH + git, reached from Windows over a Docker-published
 * 127.0.0.1 port. The container is managed through `wsl.exe` invoking Docker
 * Engine inside a WSL2 distribution — no Docker Desktop, no elevated
 * privileges, no host filesystem mounts into the container.
 *
 * What still runs natively on Windows, unchanged: the application itself,
 * Git for Windows' `git.exe`, its `ssh.exe`, askpass, and every WDIO
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
 * `RIS_E2E_GIT_REMOTE_PROVIDER=container` (default: `native`, i.e. unchanged
 * behavior — see resolveGitRemoteProvider). Only git-remote-workflows.e2e.ts
 * wires this up for this proof-of-concept stage; git-clone-workflows and
 * git-diverged-pull stay on the native fixture until a full migration is
 * separately approved. Use createContainerRemoteFixture() — not
 * startContainerRemote()/configureContainerSsh() called separately — for the
 * atomic-initialization guarantee described below.
 *
 * ── The WSL2 VM idle-shutdown finding (critical to this module's design) ───
 *
 * Empirically confirmed during this stage's Phase 1/2 environment audit: on
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
 * The fix (validated empirically, see this stage's report) needs no global
 * WSL configuration change: holding one extra `wsl.exe -d <distro> --
 * sleep <n>` child process open for the fixture's entire lifetime keeps the
 * distro "attached" and prevents the teardown. `startContainerRemote` starts
 * this keep-alive session before doing anything else and
 * `cleanupContainerRemote` is responsible for killing it — last, in a
 * `finally`, so it stays available for every Docker command cleanup itself
 * still needs to run (see cleanupContainerRemote's own doc comment).
 *
 * ── Transactional startup (Stage 3F.5.4-R1) ─────────────────────────────────
 *
 * `startContainerRemote()` never returns a partially-built server object,
 * and never leaves resources it acquired dangling on failure: every
 * resource it acquires (keep-alive session, container, Windows work
 * directory) is tracked in a `PartialContainerFixtureState` as it goes, and
 * any failure — at any step, including ones after the container already
 * exists — triggers `rollbackPartialContainerFixture()` before the original
 * error is rethrown. `cleanupContainerRemote()` is deliberately *not* reused
 * for this: it expects a complete `ContainerSshRemoteServer`, which may not
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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { shQuote, securePrivateKeyFile as securePrivateKeyFileImpl } from "./git-remote";
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
 * path (`C:\foo\bar` -> `/mnt/c/foo/bar`). This is the one Windows-only
 * assumption in this module's Docker build step — WSL2's default automount
 * convention, not something the fixture image/entrypoint/sshd_config
 * themselves depend on (see this module's own doc comment). If a host has
 * automount disabled or remapped, `ensureImageBuilt`'s docker build call
 * fails with a clear "path not found inside WSL" error rather than a
 * confusing Docker context error — see its own doc comment.
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

// ── wsl.exe invocation ────────────────────────────────────────────────────────
//
// Every Docker call goes through argument arrays (execFile/spawn), never a
// concatenated shell string — see this stage's "Command execution contract".
// The one place a shell runs at all is *inside* the container for a handful
// of chained repository-administration commands (createContainerBareRemote,
// pushSimulatedContainerRemoteCommit), and even there every interpolated
// value is centrally quoted through shQuote (imported from git-remote.ts,
// already exercised by its own round-trip tests through a real `bash
// source`).

interface ExecResult {
  stdout: string;
  stderr: string;
}

function execFileP(cmd: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }, (error, stdoutBuf, stderrBuf) => {
      const stdout = stdoutBuf.toString("utf8");
      const stderr = stderrBuf.toString("utf8");
      if (error) {
        reject(Object.assign(new Error(`${error.message}\n${stderr}`.trim()), { stdout, stderr, cause: error }));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * wsl.exe's own meta-commands (`--status`, `--list`) emit UTF-16LE whenever
 * stdout is not a real console — which is always true when invoked via
 * child_process — confirmed empirically in this stage's Phase 1 environment
 * audit. Detection is content-based rather than assumed unconditionally
 * (Stage 3F.5.4-R1 hardening): a UTF-16LE BOM, if present, is authoritative;
 * otherwise NUL-byte density is used as a heuristic (UTF-16LE encoding of
 * ASCII/Latin-1-range text puts a 0x00 byte in every other position, ~50%
 * density, vs. ~0% for ordinary UTF-8 text) — anything not clearly UTF-16LE
 * by either signal is decoded as UTF-8. Output from a program run *inside*
 * a distro (`wsl -d <distro> -- <cmd>`) is that program's own native UTF-8
 * and is unaffected — decodeWslMetaOutput is only ever applied to
 * `wsl.exe`'s own list/status output, never to anything docker/git prints
 * from inside the container.
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
        reject(new Error(`[container-git-remote] wsl.exe ${args.join(" ")} failed: ${error.message}`, { cause: error }));
        return;
      }
      resolve(decodeWslMetaOutput(stdoutBuf));
    });
  });
}

/** Runs `docker <dockerArgs>` inside `distro` via `wsl.exe -d <distro> --
 * docker ...` — always an argument array, never a shell string (see this
 * module's own "wsl.exe invocation" section doc comment). */
async function execDocker(distro: string, dockerArgs: string[]): Promise<ExecResult> {
  assertSafeIdentifier(distro, "WSL distribution name");
  try {
    return await execFileP("wsl.exe", ["-d", distro, "--", "docker", ...dockerArgs]);
  } catch (error) {
    throw new Error(
      `[container-git-remote] docker ${dockerArgs.join(" ")} failed in WSL distribution "${distro}": ${errMsg(error)}`,
      { cause: error },
    );
  }
}

// ── WSL distribution discovery ───────────────────────────────────────────────

export interface WslDistribution {
  name: string;
  state: string;
  version: number;
  isDefault: boolean;
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

/** Classifies a docker CLI/daemon error's stderr into a short, precise
 * diagnostic string for the "no WSL2 distribution has a working Docker
 * Engine" error message — see selectDistribution. Pure — takes already-
 * captured stderr text, no process access. */
export function classifyDockerError(stderr: string): string {
  if (/cannot connect to the docker daemon/i.test(stderr)) return "Docker daemon is not running";
  if (/permission denied/i.test(stderr)) return "current user lacks Docker permissions (not in the docker group)";
  if (/command not found|not recognized as an internal|no such file or directory/i.test(stderr)) {
    return "Docker CLI is not installed";
  }
  return "unknown Docker error";
}

interface DockerAvailability {
  available: boolean;
  diagnostic?: string;
}

async function checkDockerAvailability(distro: string): Promise<DockerAvailability> {
  try {
    await execDocker(distro, ["info"]);
    return { available: true };
  } catch (error) {
    return { available: false, diagnostic: classifyDockerError(errMsg(error)) };
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
 * is unit-testable with a fake checker and zero real WSL/Docker access; see
 * this stage's own "mock process execution" unit-test requirement).
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
        `[container-git-remote] RIS_E2E_WSL_DISTRO="${override}" is not an installed WSL distribution ` +
          `(found: ${distros.map((d) => d.name).join(", ") || "none"}).`,
      );
    }
    if (match.version !== 2) {
      throw new Error(
        `[container-git-remote] RIS_E2E_WSL_DISTRO="${override}" is WSL${match.version}, not WSL2 — ` +
          `the container fixture requires WSL2. Run: wsl --set-version ${override} 2`,
      );
    }
    const check = await checkDocker(override);
    if (!check.available) {
      throw new Error(
        `[container-git-remote] Docker is not available in WSL distribution "${override}": ${check.diagnostic}.`,
      );
    }
    return { distro: override, diagnostics: [{ distro: override, ...check }] };
  }

  if (distros.length === 0) {
    throw new Error(
      "[container-git-remote] no WSL distributions are installed. Install a WSL2 distribution " +
        "(e.g. `wsl --install -d Ubuntu`) with Docker Engine before running the container fixture.",
    );
  }

  const wsl2 = distros.filter((d) => d.version === 2);
  if (wsl2.length === 0) {
    throw new Error(
      `[container-git-remote] only WSL1 distribution(s) found (${distros.map((d) => d.name).join(", ")}) — ` +
        "the container fixture requires WSL2. Run: wsl --set-version <distro> 2",
    );
  }

  const diagnostics: DistroDockerCheck[] = [];
  for (const d of wsl2) {
    const check = await checkDocker(d.name);
    diagnostics.push({ distro: d.name, ...check });
    if (check.available) return { distro: d.name, diagnostics };
  }
  throw new Error(
    "[container-git-remote] no WSL2 distribution has a working Docker Engine. Checked: " +
      diagnostics.map((d) => `${d.distro} (${d.diagnostic ?? "unavailable"})`).join(", "),
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
  const { distro } = await selectDistribution(distros, checkDockerAvailability, override);
  return distro;
}

// ── Provider selection (RIS_E2E_GIT_REMOTE_PROVIDER) ─────────────────────────

export type GitRemoteProvider = "native" | "container";

/**
 * Resolves which Git-remote fixture provider a spec should use. Defaults to
 * "native" (git-remote.ts's existing local-sshd fixture) so this stage's
 * proof of concept is strictly opt-in — see this module's own doc comment.
 * Throws on any value other than "native"/"container"/unset, rather than
 * silently falling back, so a typo'd env var fails loudly instead of
 * quietly running the wrong fixture.
 */
export function resolveGitRemoteProvider(env: NodeJS.ProcessEnv = process.env): GitRemoteProvider {
  const value = env["RIS_E2E_GIT_REMOTE_PROVIDER"];
  if (value === undefined || value === "") return "native";
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
 * port, per this stage's own security requirements.
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
 * Pure string parsing — unit-testable without a real container. */
export function parsePublishedPort(dockerPortOutput: string): number | null {
  const match = /127\.0\.0\.1:(\d+)/.exec(dockerPortOutput);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/** The SCP-like SSH remote URL the app's "Add remote" form accepts — same
 * shape as git-remote.ts's buildSshRemoteUrl, but the container fixture's
 * username is always the fixed `git` (see the Dockerfile), never the host
 * OS user, and `bareRepoPath` is a path inside the *container's* filesystem
 * (e.g. `/home/git/repos/scenario1-abc123.git`), not the Windows host's. */
export function buildContainerSshRemoteUrl(bareRepoPath: string): string {
  return `${CONTAINER_USERNAME}@127.0.0.1:${bareRepoPath}`;
}

// ── Readiness ─────────────────────────────────────────────────────────────────

async function waitForContainerHealthy(distro: string, containerName: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execDocker(distro, [
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
 * Collects the failure diagnostics this stage's NSP requires: container
 * inspect, recent logs, and port mapping. Never touches key material — the
 * only secret-shaped thing in this module (the ephemeral private key) is
 * referenced only by filesystem path everywhere else, never read into a
 * diagnostic string.
 */
export async function collectDiagnostics(distro: string, containerName: string): Promise<string> {
  const sections: string[] = [`distro: ${distro}`, `container: ${containerName}`];
  const tryRun = async (label: string, args: string[]): Promise<void> => {
    try {
      const { stdout } = await execDocker(distro, args);
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
  imageExists: (distro: string, tag: string) => Promise<boolean>;
  buildImage: (distro: string, tag: string, mountPath: string, hash: string) => Promise<void>;
  /** Separated from `buildImage` so the hash/cache-reuse decision logic
   * this function exists to test is unit-testable without depending on
   * FIXTURE_DIR actually being a Windows path — true only incidentally,
   * because this whole module happens to run on a Windows host in
   * production, not something the cache-invalidation logic itself should
   * ever need to know about. */
  resolveMountPath: () => string;
}

const defaultEnsureImageBuiltDeps: EnsureImageBuiltDeps = {
  imageExists: (distro, tag) =>
    execDocker(distro, ["image", "inspect", tag])
      .then(() => true)
      .catch(() => false),
  buildImage: async (distro, tag, mountPath, hash) => {
    await execDocker(distro, [
      "build",
      "--label",
      FIXTURE_LABEL,
      "--label",
      `${FIXTURE_HASH_LABEL_PREFIX}${hash}`,
      "-t",
      tag,
      mountPath,
    ]);
  },
  resolveMountPath: () => windowsPathToWslMountPath(FIXTURE_DIR),
};

/**
 * Builds (or reuses) the fixture image, keyed by a content-addressed tag
 * (`ris-e2e-git-ssh-server:<12-char-hash>` — see computeFixtureContentHash)
 * derived from the Dockerfile/entrypoint.sh/sshd_config actually on disk
 * right now, not a fixed `:dev` tag.
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
 * touch the fixture source just to change its hash.
 *
 * The returned tag is the source of truth `startContainerRemote` runs —
 * never call `buildImageTag("dev")` (or any other tag) independently after
 * this returns.
 */
export async function ensureImageBuilt(
  distro: string,
  forceRebuild = false,
  sourceFiles: FixtureSourceFile[] = readFixtureSourceFiles(),
  deps: EnsureImageBuiltDeps = defaultEnsureImageBuiltDeps,
): Promise<string> {
  const hash = computeFixtureContentHash(sourceFiles);
  const tag = buildImageTag(hash);

  if (!forceRebuild) {
    const exists = await deps.imageExists(distro, tag);
    if (exists) {
      log(`reusing existing content-addressed image ${tag} (fixture source unchanged; set RIS_E2E_CONTAINER_REBUILD=1 to force a rebuild)`);
      return tag;
    }
  }

  const mountPath = deps.resolveMountPath();
  log(`building fixture image ${tag} from ${mountPath}${forceRebuild ? " (forced rebuild)" : ""}`);
  try {
    await deps.buildImage(distro, tag, mountPath, hash);
  } catch (error) {
    throw new Error(
      `[container-git-remote] failed to build ${tag} from ${mountPath} inside WSL distribution "${distro}". ` +
        "If Windows drives are not auto-mounted under /mnt in this distribution (automount disabled or " +
        `remapped), set RIS_E2E_WSL_DISTRO to one where they are. Underlying error: ${errMsg(error)}`,
      { cause: error },
    );
  }
  return tag;
}

export function shouldForceRebuild(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["RIS_E2E_CONTAINER_REBUILD"] === "1";
}

// ── Keep-alive session (WSL2 VM idle-shutdown workaround) ────────────────────
//
// See this module's own doc comment for the empirical finding this exists
// to work around. 86400s (24h) is just "far longer than any single WDIO
// spec run could take" — the process is always explicitly killed by
// cleanup, never left to time out on its own.

function startKeepAliveSession(distro: string): ChildProcess {
  const child = spawn("wsl.exe", ["-d", distro, "--", "sleep", "86400"], { stdio: "ignore" });
  child.unref();
  return child;
}

function stopKeepAliveSession(child: ChildProcess): void {
  if (!child.killed && child.exitCode === null) {
    child.kill();
  }
}

// ── Public key installation ──────────────────────────────────────────────────

/**
 * Installs `publicKey` into the container's authorized_keys via
 * `docker exec -i ... tee -a`, piping the key over stdin rather than as a
 * command-line argument (see this stage's "do not pass secrets through
 * command-line arguments when avoidable" rule — a public key isn't secret,
 * but this also keeps arbitrarily-shaped key comments out of argv/process
 * listings for free, and avoids ever needing to shell-escape it).
 */
function installPublicKey(distro: string, containerName: string, publicKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "wsl.exe",
      ["-d", distro, "--", "docker", "exec", "-i", containerName, "tee", "-a", CONTAINER_AUTHORIZED_KEYS],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(new Error(`[container-git-remote] failed to install public key: ${error.message}`, { cause: error })));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[container-git-remote] installing public key exited with code ${code}: ${stderr.trim()}`));
    });
    child.stdin?.end(publicKey);
  });
}

// ── Container SSH remote server ───────────────────────────────────────────────

export interface ContainerSshRemoteServer {
  distro: string;
  containerName: string;
  runId: string;
  port: number;
  username: string;
  /** Absolute Windows path to the ephemeral client private key (no passphrase). */
  identityPath: string;
  /** Windows-side directory holding this run's key material — removed by cleanup. */
  workDir: string;
  keepAlive: ChildProcess;
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
// wsl.exe/docker/fs calls); tests inject fakes for deterministic
// fault-injection coverage with no real WSL/Docker required (Stage
// 3F.5.4-R1's "lifecycle fault-injection tests" requirement). Mirrors the
// dependency-injection style selectDistribution/securePrivateKeyFile/
// buildSshdConfig already use elsewhere in this program.

export interface ContainerOpsDeps {
  resolveDistribution: () => Promise<string>;
  startKeepAlive: (distro: string) => ChildProcess;
  stopKeepAlive: (child: ChildProcess) => void;
  ensureImageBuilt: (distro: string, forceRebuild: boolean) => Promise<string>;
  dockerRun: (distro: string, args: string[]) => Promise<void>;
  dockerPort: (distro: string, containerName: string) => Promise<string>;
  waitForHealthy: (distro: string, containerName: string, timeoutMs: number) => Promise<void>;
  collectDiagnostics: (distro: string, containerName: string) => Promise<string>;
  removeContainer: (distro: string, containerName: string) => Promise<void>;
  /** Exact-identity check (never a substring/name-filter match — see this
   * stage's "Container verification" requirement). Returns true iff a
   * container with exactly this name currently exists. */
  checkContainerExists: (distro: string, containerName: string) => Promise<boolean>;
  listFixtureContainers: (distro: string, runId?: string) => Promise<string[]>;
  removeContainersByIds: (distro: string, ids: string[]) => Promise<void>;
  generateKeypair: (identityPath: string) => Promise<void>;
  securePrivateKeyFile: (identityPath: string) => void;
  readPublicKey: (identityPath: string) => string;
  installPublicKey: (distro: string, containerName: string, publicKey: string) => Promise<void>;
  removeWorkDir: (workDir: string) => Promise<void>;
  clearSshConfig: () => void;
}

function clearContainerSshConfig(): void {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) return;
  const configPath = join(runRoot, "git", "ssh-remote-command.env");
  if (existsSync(configPath)) rmSync(configPath, { force: true });
}

async function removeWorkDirImpl(workDir: string): Promise<void> {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (runRoot && isStrictChildPath(runRoot, workDir) && existsSync(workDir)) {
    await rm(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

export const defaultContainerOpsDeps: ContainerOpsDeps = {
  resolveDistribution,
  startKeepAlive: startKeepAliveSession,
  stopKeepAlive: stopKeepAliveSession,
  ensureImageBuilt: (distro, forceRebuild) => ensureImageBuilt(distro, forceRebuild),
  dockerRun: async (distro, args) => {
    await execDocker(distro, args);
  },
  dockerPort: async (distro, containerName) => (await execDocker(distro, ["port", containerName])).stdout,
  waitForHealthy: waitForContainerHealthy,
  collectDiagnostics,
  removeContainer: async (distro, containerName) => {
    await execDocker(distro, ["rm", "-f", containerName]);
  },
  checkContainerExists: (distro, containerName) =>
    execDocker(distro, ["inspect", containerName])
      .then(() => true)
      .catch(() => false),
  listFixtureContainers: async (distro, runId) => {
    const { stdout } = await execDocker(distro, buildCleanupArgs(runId));
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  },
  removeContainersByIds: async (distro, ids) => {
    if (ids.length === 0) return;
    await execDocker(distro, ["rm", "-f", ...ids]);
  },
  generateKeypair: async (identityPath) => {
    await execFileP("ssh-keygen", ["-t", "ed25519", "-f", identityPath, "-N", "", "-q"]);
  },
  securePrivateKeyFile: (identityPath) => securePrivateKeyFileImpl(identityPath),
  readPublicKey: (identityPath) => readFileSync(`${identityPath}.pub`, "utf8"),
  installPublicKey,
  removeWorkDir: removeWorkDirImpl,
  clearSshConfig: clearContainerSshConfig,
};

// ── Transactional startup + rollback (Stage 3F.5.4-R1) ──────────────────────

/** Whatever startContainerRemote has actually acquired so far at the point
 * of failure — every field is optional because failure can happen before
 * any given resource was ever created. */
export interface PartialContainerFixtureState {
  distro?: string;
  containerName?: string;
  workDir?: string;
  keepAlive?: ChildProcess;
  /** True only once configureContainerSsh (a layer above startContainerRemote
   * — see createContainerRemoteFixture) has successfully written the
   * wrapper's env file for this run. Always false for a state built purely
   * from startContainerRemote's own internals, which never writes it. */
  sshConfigCreated?: boolean;
}

type RollbackDeps = Pick<
  ContainerOpsDeps,
  "collectDiagnostics" | "removeContainer" | "removeWorkDir" | "clearSshConfig" | "stopKeepAlive"
>;

/**
 * Rolls back whatever subset of a container fixture's resources partial
 * `state` describes, in the order this stage's NSP specifies: diagnostics
 * (while the container still exists) → remove container → remove work
 * directory → clear SSH wrapper config → stop keep-alive last (so it stays
 * available for the Docker commands the earlier steps still need). Every
 * step is independently guarded — a missing field is skipped entirely
 * (safe with no container, no work directory, etc.), and a failure in one
 * step never prevents the next from being attempted. Returns the list of
 * diagnostic strings produced (collected container diagnostics plus any
 * step failures) — never throws itself, so a caller's own error handling
 * is never masked by a rollback failure.
 */
export async function rollbackPartialContainerFixture(
  state: PartialContainerFixtureState,
  deps: RollbackDeps = defaultContainerOpsDeps,
): Promise<string[]> {
  const diagnostics: string[] = [];

  if (state.distro && state.containerName) {
    try {
      const diag = await deps.collectDiagnostics(state.distro, state.containerName);
      diagnostics.push(`diagnostics for ${state.containerName} before rollback:\n${diag}`);
    } catch (error) {
      diagnostics.push(`collecting diagnostics for ${state.containerName} failed: ${errMsg(error)}`);
    }
    try {
      await deps.removeContainer(state.distro, state.containerName);
    } catch (error) {
      diagnostics.push(`removing container "${state.containerName}" failed: ${errMsg(error)}`);
    }
  }

  if (state.workDir) {
    try {
      await deps.removeWorkDir(state.workDir);
    } catch (error) {
      diagnostics.push(`removing work directory "${state.workDir}" failed: ${errMsg(error)}`);
    }
  }

  if (state.sshConfigCreated) {
    try {
      deps.clearSshConfig();
    } catch (error) {
      diagnostics.push(`clearing ssh config failed: ${errMsg(error)}`);
    }
  }

  if (state.keepAlive) {
    try {
      deps.stopKeepAlive(state.keepAlive);
    } catch (error) {
      diagnostics.push(`stopping keep-alive failed: ${errMsg(error)}`);
    }
  }

  return diagnostics;
}

/**
 * Starts the containerized Git-over-SSH fixture: resolves a working WSL2
 * distribution, keeps a session attached to it for the fixture's lifetime,
 * ensures the fixture image is built, starts a uniquely-named/labeled
 * container publishing SSH on a random 127.0.0.1 port, waits for its
 * healthcheck, generates an ephemeral client keypair, and installs the
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
    const distro = await deps.resolveDistribution();
    state.distro = distro;
    log(`selected WSL2 distribution: ${distro}`);

    const keepAlive = deps.startKeepAlive(distro);
    state.keepAlive = keepAlive;

    const imageTag = await deps.ensureImageBuilt(distro, options.forceRebuild ?? shouldForceRebuild());

    const runId = generateRunId();
    const containerName = buildContainerName(runId);

    log(`starting container ${containerName} from ${imageTag}`);
    await deps.dockerRun(distro, buildDockerRunArgs({ containerName, imageTag, runId }));
    state.containerName = containerName;

    const portOutput = await deps.dockerPort(distro, containerName);
    const parsedPort = parsePublishedPort(portOutput);
    if (parsedPort === null) {
      throw new Error(
        `[container-git-remote] could not parse a 127.0.0.1 published port for "${containerName}" from: "${portOutput.trim()}"`,
      );
    }
    await deps.waitForHealthy(distro, containerName, 20_000);
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
    await deps.installPublicKey(distro, containerName, publicKey);
    log("public key installed in container");

    return {
      distro,
      containerName,
      runId,
      port: parsedPort,
      username: CONTAINER_USERNAME,
      identityPath,
      workDir,
      keepAlive,
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
 * this stage's NSP asks this module not to reach into git-remote.ts's
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

// ── Cleanup (successful-run teardown — Stage 3F.5.4-R1 ordering) ────────────

export interface CleanupResult {
  sshConfigCleared: boolean;
  containerRemoved: boolean;
  containerVerifiedAbsent: boolean;
  workDirRemoved: boolean;
  keepAliveStopped: boolean;
  /** Non-fatal problems encountered during cleanup — cleanup never throws;
   * a failed step is recorded here instead (see this stage's "do not
   * silently treat a failed container removal as success" requirement). */
  errors: string[];
}

/**
 * Idempotent, non-throwing cleanup for a fully-started container fixture.
 * Order matters (Stage 3F.5.4-R1): clear SSH wrapper config → remove
 * container → verify removal (exact-identity check, never a substring
 * match — see `ContainerOpsDeps.checkContainerExists`) → remove Windows
 * work directory → stop the WSL keep-alive **last, in a `finally`**, so it
 * stays available for every Docker command the earlier steps still need,
 * even if one of them fails. A failed container removal is recorded in
 * `errors`/logged as a warning, never silently treated as success. Safe to
 * call twice on the same server (each step tolerates its target already
 * being gone).
 */
export async function cleanupContainerRemote(
  server: ContainerSshRemoteServer,
  deps: ContainerOpsDeps = defaultContainerOpsDeps,
): Promise<CleanupResult> {
  const errors: string[] = [];
  let sshConfigCleared = false;
  let containerRemoved = false;
  let containerVerifiedAbsent = false;
  let workDirRemoved = false;
  let keepAliveStopped = false;

  try {
    try {
      deps.clearSshConfig();
      sshConfigCleared = true;
    } catch (error) {
      errors.push(`clearing ssh config failed: ${errMsg(error)}`);
    }

    try {
      await deps.removeContainer(server.distro, server.containerName);
      containerRemoved = true;
    } catch (error) {
      errors.push(`removing container "${server.containerName}" failed: ${errMsg(error)}`);
    }

    try {
      const stillPresent = await deps.checkContainerExists(server.distro, server.containerName);
      containerVerifiedAbsent = !stillPresent;
      if (stillPresent) {
        const warning = `container "${server.containerName}" still present after removal attempt — may require manual cleanup`;
        errors.push(warning);
        log(`WARNING: ${warning}`);
      }
    } catch (error) {
      errors.push(`verifying container removal for "${server.containerName}" failed: ${errMsg(error)}`);
    }

    try {
      await deps.removeWorkDir(server.workDir);
      workDirRemoved = true;
    } catch (error) {
      errors.push(`removing work directory "${server.workDir}" failed: ${errMsg(error)}`);
    }
  } finally {
    try {
      deps.stopKeepAlive(server.keepAlive);
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

  return { sshConfigCleared, containerRemoved, containerVerifiedAbsent, workDirRemoved, keepAliveStopped, errors };
}

/**
 * Safe, label-scoped sweep for containers left behind by a forcibly-killed
 * test process (see this stage's cleanup contract). Only ever removes the
 * exact container IDs `listFixtureContainers` returns — which is itself
 * always filtered to FIXTURE_LABEL (optionally further scoped to one run
 * id) — never anything else on the host; this function has no path that
 * falls back to "remove everything" if the filtered list comes back empty
 * or malformed.
 */
export async function cleanupOrphanedContainers(
  distro: string,
  runId?: string,
  deps: Pick<ContainerOpsDeps, "listFixtureContainers" | "removeContainersByIds"> = defaultContainerOpsDeps,
): Promise<string[]> {
  const ids = await deps.listFixtureContainers(distro, runId);
  if (ids.length === 0) return [];
  await deps.removeContainersByIds(distro, ids);
  return ids;
}

// ── Atomic fixture initialization (Stage 3F.5.4-R1) ──────────────────────────

export interface ContainerRemoteFixtureHandle {
  createBareRemote(label: string): Promise<string>;
  buildRemoteUrl(bareRepoPath: string): string;
  getRemoteHeadCommit(bareRepoPath: string, ref?: string): Promise<string>;
  getRemoteCommitCount(bareRepoPath: string, ref?: string): Promise<number>;
  pushSimulatedRemoteCommit(bareRepoPath: string, branch: string, fileName: string, message: string): Promise<string>;
  cleanup(): Promise<CleanupResult>;
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
 */
export async function createContainerRemoteFixture(
  options: { forceRebuild?: boolean } = {},
  deps: CreateContainerRemoteFixtureDeps = defaultCreateContainerRemoteFixtureDeps,
): Promise<ContainerRemoteFixtureHandle> {
  const server = await deps.startContainerRemote(options);
  try {
    deps.configureContainerSsh(server);
  } catch (error) {
    await deps.cleanupContainerRemote(server).catch(() => {});
    throw error;
  }
  return {
    createBareRemote: (label) => createContainerBareRemote(server, label),
    buildRemoteUrl: (bareRepoPath) => buildContainerSshRemoteUrl(bareRepoPath),
    getRemoteHeadCommit: (bareRepoPath, ref) => getContainerRemoteHeadCommit(server, bareRepoPath, ref),
    getRemoteCommitCount: (bareRepoPath, ref) => getContainerRemoteCommitCount(server, bareRepoPath, ref),
    pushSimulatedRemoteCommit: (bareRepoPath, branch, fileName, message) =>
      pushSimulatedContainerRemoteCommit(server, bareRepoPath, branch, fileName, message),
    cleanup: () => deps.cleanupContainerRemote(server),
  };
}

// ── Bare remote repositories (administered via `docker exec`, as root) ──────
//
// Per this stage's NSP: "Repository administration may use docker exec.
// Application Git operations must use SSH from Windows." Every function
// below runs inside the container as root over `docker exec`; the
// application under test never talks to the container any way other than
// the SSH port these functions never touch.

export async function createContainerBareRemote(
  server: ContainerSshRemoteServer,
  label = "remote",
): Promise<string> {
  assertSafeIdentifier(label, "repo label");
  const suffix = generateRunId();
  const bareDir = `${CONTAINER_REPOS_DIR}/${label}-${suffix}.git`;
  const bareDirQ = shQuote(bareDir);
  const script = `mkdir -p ${bareDirQ} && git init --bare -q ${bareDirQ} && chown -R git:git ${bareDirQ}`;
  await execDocker(server.distro, ["exec", server.containerName, "sh", "-c", script]);
  return bareDir;
}

export async function getContainerRemoteHeadCommit(
  server: ContainerSshRemoteServer,
  bareRepoPath: string,
  ref = "HEAD",
): Promise<string> {
  const { stdout } = await execDocker(server.distro, [
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
  const { stdout } = await execDocker(server.distro, [
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
 * inside the container's filesystem (not reachable from the Windows test
 * runner directly), the whole clone/commit/push/cleanup sequence runs
 * inside the container over a single `docker exec ... sh -c` script, with
 * every interpolated value centrally quoted through shQuote.
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
  const { stdout } = await execDocker(server.distro, ["exec", server.containerName, "sh", "-c", script]);
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sha = lines[lines.length - 1];
  if (!sha) {
    throw new Error(`[container-git-remote] pushSimulatedContainerRemoteCommit produced no commit SHA: "${stdout}"`);
  }
  return sha;
}
