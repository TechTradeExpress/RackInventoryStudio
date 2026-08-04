/**
 * Containerized Git-over-SSH fixture infrastructure (Stage 3F.5.4 proof of
 * concept).
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
 * separately approved.
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
 * `cleanupContainerRemote` is responsible for killing it.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { shQuote, securePrivateKeyFile } from "./git-remote";
import { isStrictChildPath } from "./test-environment";

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[container-git-remote ${ts}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Constants ─────────────────────────────────────────────────────────────

const IMAGE_REPOSITORY = "ris-e2e-git-ssh-server";
const CONTAINER_NAME_PREFIX = "ris-e2e-git-ssh-";
/** Attached to every container this module creates — the basis of the safe,
 * label-scoped cleanup contract (see buildCleanupArgs / cleanupOrphanedContainers).
 * Never remove a container that doesn't carry this label. */
export const FIXTURE_LABEL = "ris.e2e.fixture=git-ssh";
const RUN_LABEL_PREFIX = "ris.e2e.run=";
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
 * a future content-hash-based cache key (see computeFixtureContentHash) can't
 * accidentally smuggle shell/argument metacharacters into a docker CLI arg. */
export function buildImageTag(tag: string): string {
  return `${IMAGE_REPOSITORY}:${assertSafeIdentifier(tag, "image tag")}`;
}

/** Deterministic image cache key from already-read fixture source file
 * contents (Dockerfile, entrypoint.sh, sshd_config) — pure, no filesystem
 * access, so callers control exactly what's hashed and this stays unit
 * testable. Truncated to 12 hex chars: plenty of collision resistance for a
 * dev-machine build cache key, short enough to stay a comfortable image tag. */
export function computeFixtureContentHash(fileContents: string[]): string {
  const hash = createHash("sha256");
  for (const content of fileContents) hash.update(content);
  return hash.digest("hex").slice(0, 12);
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
 * audit: naively decoding the captured bytes as UTF-8 renders every
 * character separated by a stray space (each ASCII byte's paired null byte
 * surfaces as U+0000, which most terminals/loggers render as blank). Output
 * from a program run *inside* a distro (`wsl -d <distro> -- <cmd>`) is that
 * program's own native UTF-8 and is unaffected — decodeWslMetaOutput is
 * only ever applied to `wsl.exe`'s own list/status output, never to
 * anything docker/git prints from inside the container.
 */
export function decodeWslMetaOutput(buffer: Buffer): string {
  return buffer.toString("utf16le").replace(/^\uFEFF/, "");
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
      `[container-git-remote] docker ${dockerArgs.join(" ")} failed in WSL distribution "${distro}": ${
        error instanceof Error ? error.message : String(error)
      }`,
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
    const stderr = error instanceof Error ? error.message : String(error);
    return { available: false, diagnostic: classifyDockerError(stderr) };
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
 * destroy them the instant the container exits — cleanupContainerRemote
 * removes the container explicitly instead, after any diagnostics have
 * already been collected.
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
      sections.push(`--- ${label} (failed) ---\n${error instanceof Error ? error.message : String(error)}`);
    }
  };
  await tryRun("docker inspect", ["inspect", containerName]);
  await tryRun("docker logs (tail 200)", ["logs", "--tail", "200", containerName]);
  await tryRun("docker port", ["port", containerName]);
  return sections.join("\n\n");
}

// ── Image lifecycle ───────────────────────────────────────────────────────────

/**
 * Builds (or reuses) the fixture image. By default, reuses an existing
 * `ris-e2e-git-ssh-server:dev` image if one is already present in the
 * selected distro — the build context rarely changes between spec runs, so
 * rebuilding on every `startContainerRemote` call would add several seconds
 * of pure overhead per run for no benefit. Set RIS_E2E_CONTAINER_REBUILD=1
 * to force a rebuild (diagnostics / after editing the fixture's Dockerfile).
 */
export async function ensureImageBuilt(distro: string, forceRebuild = false): Promise<string> {
  const tag = buildImageTag("dev");
  if (!forceRebuild) {
    const exists = await execDocker(distro, ["image", "inspect", tag])
      .then(() => true)
      .catch(() => false);
    if (exists) {
      log(`reusing existing image ${tag} (set RIS_E2E_CONTAINER_REBUILD=1 to force a rebuild)`);
      return tag;
    }
  }
  const mountPath = windowsPathToWslMountPath(FIXTURE_DIR);
  log(`building fixture image ${tag} from ${mountPath}`);
  try {
    await execDocker(distro, ["build", "-t", tag, mountPath]);
  } catch (error) {
    throw new Error(
      `[container-git-remote] failed to build ${tag} from ${mountPath} inside WSL distribution "${distro}". ` +
        "If Windows drives are not auto-mounted under /mnt in this distribution (automount disabled or " +
        "remapped), set RIS_E2E_WSL_DISTRO to one where they are. " +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
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
// cleanupContainerRemote, never left to time out on its own.

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

/**
 * Starts the containerized Git-over-SSH fixture: resolves a working WSL2
 * distribution, keeps a session attached to it for the fixture's lifetime,
 * ensures the fixture image is built, starts a uniquely-named/labeled
 * container publishing SSH on a random 127.0.0.1 port, waits for its
 * healthcheck, generates an ephemeral client keypair, and installs the
 * public half into the container.
 *
 * Mirrors git-remote.ts's startRemote() in shape (both return a server
 * object with `port`/`username`/`identityPath` that configureSsh-equivalents
 * turn into the same ssh-wrapper.sh env file), but every implementation
 * detail from there down is container-specific.
 */
export async function startContainerRemote(
  options: { forceRebuild?: boolean } = {},
): Promise<ContainerSshRemoteServer> {
  const runRoot = resolveRunRoot();
  const distro = await resolveDistribution();
  log(`selected WSL2 distribution: ${distro}`);

  const keepAlive = startKeepAliveSession(distro);
  try {
    await ensureImageBuilt(distro, options.forceRebuild ?? shouldForceRebuild());

    const runId = generateRunId();
    const containerName = buildContainerName(runId);
    const imageTag = buildImageTag("dev");

    log(`starting container ${containerName} from ${imageTag}`);
    await execDocker(distro, buildDockerRunArgs({ containerName, imageTag, runId }));

    let port: number;
    try {
      const { stdout: portOutput } = await execDocker(distro, ["port", containerName]);
      const parsedPort = parsePublishedPort(portOutput);
      if (parsedPort === null) {
        throw new Error(`could not parse a 127.0.0.1 published port from: "${portOutput.trim()}"`);
      }
      port = parsedPort;
      await waitForContainerHealthy(distro, containerName, 20_000);
    } catch (error) {
      const diagnostics = await collectDiagnostics(distro, containerName).catch((diagError) => String(diagError));
      await execDocker(distro, ["rm", "-f", containerName]).catch(() => {});
      throw new Error(
        `[container-git-remote] container "${containerName}" failed to become ready: ` +
          `${error instanceof Error ? error.message : String(error)}\n\n${diagnostics}`,
        { cause: error },
      );
    }
    log(`container healthy: 127.0.0.1:${port}`);

    const gitDir = join(runRoot, "git");
    mkdirSync(gitDir, { recursive: true });
    const workDir = join(gitDir, `container-ssh-${runId}`);
    mkdirSync(workDir, { recursive: true });
    const identityPath = join(workDir, "id_ed25519");

    log("generating ephemeral client ed25519 keypair (no passphrase)");
    await execFileP("ssh-keygen", ["-t", "ed25519", "-f", identityPath, "-N", "", "-q"]);
    securePrivateKeyFile(identityPath);

    const publicKey = readFileSync(`${identityPath}.pub`, "utf8");
    await installPublicKey(distro, containerName, publicKey);
    log("public key installed in container");

    return {
      distro,
      containerName,
      runId,
      port,
      username: CONTAINER_USERNAME,
      identityPath,
      workDir,
      keepAlive,
    };
  } catch (error) {
    stopKeepAliveSession(keepAlive);
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

function clearContainerSshConfig(): void {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) return;
  const configPath = join(runRoot, "git", "ssh-remote-command.env");
  if (existsSync(configPath)) rmSync(configPath, { force: true });
}

/**
 * Idempotent cleanup: stops the keep-alive session, clears the ssh-wrapper
 * config, force-removes the container, and removes the Windows-side key
 * directory. Verifies the container is actually gone afterward rather than
 * trusting `docker rm -f`'s exit code alone, per this stage's cleanup
 * contract ("verify container removed").
 */
export async function cleanupContainerRemote(server: ContainerSshRemoteServer): Promise<void> {
  stopKeepAliveSession(server.keepAlive);
  clearContainerSshConfig();

  await execDocker(server.distro, ["rm", "-f", server.containerName]).catch(() => {});

  const stillPresent = await execDocker(server.distro, ["ps", "-aq", "--filter", `name=${server.containerName}`])
    .then((result) => result.stdout.trim().length > 0)
    .catch(() => false);
  if (stillPresent) {
    log(`WARNING: container ${server.containerName} still present after "docker rm -f" — may require manual cleanup`);
  }

  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (runRoot && isStrictChildPath(runRoot, server.workDir) && existsSync(server.workDir)) {
    await rm(server.workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  log(`cleaned up container ${server.containerName} and ${server.workDir}`);
}

/**
 * Safe, label-scoped sweep for containers left behind by a forcibly-killed
 * test process (see this stage's cleanup contract). Only ever touches
 * containers carrying FIXTURE_LABEL — optionally further scoped to one
 * run id — never anything else on the host.
 */
export async function cleanupOrphanedContainers(distro: string, runId?: string): Promise<string[]> {
  const { stdout } = await execDocker(distro, buildCleanupArgs(runId));
  const ids = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (ids.length === 0) return [];
  await execDocker(distro, ["rm", "-f", ...ids]);
  return ids;
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
