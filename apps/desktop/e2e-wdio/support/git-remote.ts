/**
 * Remote Git over SSH fixture infrastructure (Stage 3F.2).
 *
 * Provides a deterministic, CI-friendly stand-in for a real SSH-reachable
 * Git remote: a local, unprivileged `sshd` instance (own ephemeral host key,
 * random 127.0.0.1 port, a single ephemeral passphrase-less client keypair
 * authorized to log in as the *current* OS user — no setuid/privilege drop
 * needed since the login target is the same user sshd itself runs as) plus
 * one or more local bare repositories it serves over that connection.
 *
 * See docs/E2E_WDIO_PLAN.md's Stage 3F.2 section for the architecture
 * comparison (this local-sshd approach vs. a containerized git server vs.
 * other alternatives) and the rationale for choosing this one.
 *
 * ── How the app's git subprocess finds this fixture ─────────────────────────
 *
 * `git push`/`git pull` inside the application shell out to the real `git`
 * binary, which — for an SSH remote — shells out again to `ssh` via
 * `$GIT_SSH_COMMAND` (highest precedence, and explicitly never stripped by
 * the app's askpass hardening — see crates/ris-git/src/lib.rs's
 * `ASKPASS_ENV_REMOVALS` doc comment). `GIT_SSH_COMMAND` has to be a single
 * static value fixed at app-launch time (the app inherits process.env once,
 * at spawn — see wdio.conf.ts), but the actual port/identity file for this
 * fixture are only known once `startRemote()` runs, which is necessarily
 * *after* the app is already running (WDIO specs can't hook earlier than
 * their own `before()`). wdio.conf.ts resolves this by pointing
 * `GIT_SSH_COMMAND` at the static `support/ssh-wrapper.sh`, which re-reads
 * connection details from a small env file at *invocation* time —
 * `configureSsh()` below is what writes that file.
 *
 * ── Product-side note ────────────────────────────────────────────────────────
 *
 * The remote URL added through the app's UI uses SCP-like syntax
 * (`user@127.0.0.1:/abs/path/remote.git`, no port field — the port is
 * supplied by the wrapper script instead), which
 * `ris_git::validate_remote_url` already accepts (see
 * `add_remote_accepts_scp_like_ssh` in crates/ris-git/tests/git_remote_tests.rs).
 * `ris_git::is_ssh_url` classifies it as SSH, so the app's askpass session
 * still starts — inert here since the key has no passphrase, matching this
 * stage's explicit exclusion of the SSH-passphrase workflow.
 */
import { spawn, execFile, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { userInfo } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runGit } from "./local-git";
import { isStrictChildPath } from "./test-environment";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-remote ${ts}] ${msg}`);
}

// ── sshd binary resolution ───────────────────────────────────────────────────

const SSHD_CANDIDATES = ["/usr/sbin/sshd", "/sbin/sshd", "/usr/local/sbin/sshd"];

function execFileP(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

/**
 * Splits raw discovery-command stdout (from `which`/`where.exe`, possibly
 * multiple newline-separated matches) into trimmed, non-blank candidate
 * paths, in the order the command reported them. Pure — no filesystem or
 * platform access — so it's unit-testable without a real sshd installation.
 */
export function parseCandidateLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Converts an MSYS/Git-Bash-style absolute path (`/c/Windows/...`, as
 * reported by Git for Windows' `which`) to the native Windows form
 * (`C:\Windows\...`) that Node's `spawn()` can execute directly on Windows.
 * Only the drive letter is case-normalized (uppercased); the rest of the
 * path's casing is preserved verbatim.
 *
 * Returns null for anything that isn't a single-drive-letter MSYS path —
 * in particular, ordinary POSIX paths like `/usr/sbin/sshd` never match
 * (their first segment is more than one character), so this never
 * misinterprets a real POSIX path as a Windows drive path.
 */
export function convertMsysPathToNative(candidatePath: string): string | null {
  const match = /^\/([A-Za-z])\/(.*)$/.exec(candidatePath);
  if (!match) return null;
  const [, drive, rest] = match;
  return `${drive.toUpperCase()}:\\${rest.replace(/\//g, "\\")}`;
}

/**
 * Returns the first candidate for which `exists` reports true, or null if
 * none do. `exists` is dependency-injected (defaults to the real
 * `existsSync`) so candidate prioritization stays unit-testable without
 * touching the real filesystem.
 */
export function selectFirstUsableCandidate(
  candidates: string[],
  exists: (candidatePath: string) => boolean = existsSync,
): string | null {
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Builds the ordered list of Windows sshd candidates to check for existence,
 * in priority order, from already-fetched raw inputs. Pure — no filesystem
 * or process access — so the full prioritization logic (not just individual
 * parsing steps) is unit-testable in isolation:
 *   1. The well-known native OpenSSH Server location under %WINDIR%/%SystemRoot%
 *      (never a hardcoded "C:") — installed there by the Windows "OpenSSH Server"
 *      optional feature.
 *   2. Native PATH lookup results from `where.exe`, which (unlike Git Bash's
 *      `which`) always reports native Windows paths — spawnable as-is.
 *   3. Git Bash's `which` output, last resort, with its MSYS-style lines
 *      (`/c/Windows/...`) normalized to native paths before use.
 */
export function buildWindowsSshdCandidates(
  systemRoot: string | null,
  whereOutput: string,
  whichOutput: string,
): string[] {
  const candidates: string[] = [];
  if (systemRoot) {
    candidates.push(join(systemRoot, "System32", "OpenSSH", "sshd.exe"));
  }
  candidates.push(...parseCandidateLines(whereOutput));
  candidates.push(...parseCandidateLines(whichOutput).map((line) => convertMsysPathToNative(line) ?? line));
  return candidates;
}

/**
 * Windows sshd discovery: fetches the raw inputs (env var, `where.exe`,
 * Git Bash's `which` — each tolerant of failing/being unavailable) and
 * delegates prioritization to `buildWindowsSshdCandidates`, then returns the
 * first candidate that actually exists on disk.
 */
async function findSshdWindows(): Promise<string | null> {
  const systemRoot = process.env["WINDIR"] ?? process.env["SystemRoot"] ?? null;

  let whereOutput = "";
  try {
    whereOutput = (await execFileP("where.exe", ["sshd"])).stdout;
  } catch {
    // where.exe found nothing (or isn't available) — fall through
  }

  let whichOutput = "";
  try {
    whichOutput = (await execFileP("which", ["sshd"])).stdout;
  } catch {
    // Git Bash's `which` found nothing (or isn't available) — fall through
  }

  return selectFirstUsableCandidate(buildWindowsSshdCandidates(systemRoot, whereOutput, whichOutput));
}

/** POSIX (Linux/macOS) sshd discovery — unchanged from the original, host-native behavior. */
async function findSshdPosix(): Promise<string | null> {
  try {
    const { stdout } = await execFileP("which", ["sshd"]);
    const path = stdout.trim();
    if (path) return path;
  } catch {
    // fall through to candidate paths
  }
  for (const candidate of SSHD_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Locates the `sshd` binary, returning a path directly usable by Node's
 * `spawn()` on the current platform. Checked lazily (not at module load) so
 * that importing this module never fails on a machine without sshd — only
 * `startRemote()` (and thus any spec that actually needs SSH) does. Returns
 * null when sshd cannot be found anywhere — callers must treat that as a
 * hard failure, not a skip (see startRemote()'s doc comment).
 */
export async function findSshd(): Promise<string | null> {
  return process.platform === "win32" ? findSshdWindows() : findSshdPosix();
}

// ── Port + readiness ──────────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    // Used only to ask the OS for an unused port; the socket is closed
    // immediately (before sshd binds it) so this is a hint, not a
    // reservation — sshd itself is the eventual real bind and its own
    // readiness poll (waitForPortOpen) is the source of truth.
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("[git-remote] could not determine an ephemeral port"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function waitForPortOpen(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`[git-remote] sshd never became reachable on 127.0.0.1:${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

/**
 * Races a readiness promise (normally `waitForPortOpen`) against the child
 * process's own `error` event, so a spawn failure — e.g. a discovered path
 * that stopped existing or isn't executable between discovery and spawn —
 * surfaces immediately with its original error preserved as `cause`, instead
 * of silently waiting out the full readiness timeout and reporting a generic
 * "never became reachable" message that would mask the real cause. Exported
 * so this behavior is unit-testable with a deliberately-unspawnable path,
 * without depending on a real sshd installation or waiting out a real
 * timeout.
 */
export function raceSpawnAgainstReadiness(
  child: ChildProcess,
  spawnedPath: string,
  readinessPromise: Promise<void>,
): Promise<void> {
  const spawnErrorPromise = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) => {
      reject(new Error(`[git-remote] failed to spawn sshd at "${spawnedPath}": ${error.message}`, { cause: error }));
    });
  });
  return Promise.race([readinessPromise, spawnErrorPromise]);
}

// ── SSH remote server ─────────────────────────────────────────────────────────

export interface SshRemoteServer {
  port: number;
  username: string;
  /** Absolute path to the ephemeral client private key (no passphrase). */
  identityPath: string;
  /** Directory holding keys, sshd_config, and the pidfile — removed by cleanup(). */
  workDir: string;
  /** Directory remote bare repositories should be created under
   * (createBareRemote's default parent) — same run root, kept separate from
   * sshd's own key/config material for readability. */
  remotesParent: string;
  process: ChildProcess;
}

function resolveRunRoot(): string {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) {
    throw new Error(
      "[git-remote] RIS_E2E_RUN_ROOT is not set. Run via WDIO with the test-environment " +
        "initialized in wdio.conf.ts.",
    );
  }
  return runRoot;
}

/**
 * Starts a local, unprivileged sshd instance bound to 127.0.0.1 on a random
 * port, with a single ephemeral ed25519 client key (no passphrase)
 * authorized to log in as the current OS user.
 *
 * Throws if sshd cannot be found. Callers in specs should resolve
 * `findSshd()` first, in their own `before()` hook, and throw a clearer
 * spec-specific error when it returns null rather than relying on this
 * generic one — every current caller (git-remote-workflows,
 * git-clone-workflows, git-diverged-pull) treats a missing `sshd` as a
 * hard failure, not a skip: each of those specs' entire purpose is SSH
 * remote coverage, so a quiet skip would let a run report green while
 * exercising none of it. See any of their module doc comments for the
 * full reasoning.
 */
export async function startRemote(): Promise<SshRemoteServer> {
  const sshdPath = await findSshd();
  if (!sshdPath) {
    const checked =
      process.platform === "win32"
        ? "checked %WINDIR%\\System32\\OpenSSH\\sshd.exe, `where.exe sshd`, and `which sshd`"
        : "checked PATH and /usr/sbin, /sbin, /usr/local/sbin";
    throw new Error(
      `[git-remote] sshd was not found (${checked}). ` + "Install OpenSSH server to run the SSH-remote WDIO specs.",
    );
  }

  const runRoot = resolveRunRoot();
  const gitDir = join(runRoot, "git");
  mkdirSync(gitDir, { recursive: true });

  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const workDir = join(gitDir, `sshd-${suffix}`);
  const remotesParent = join(gitDir, `remotes-${suffix}`);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(remotesParent, { recursive: true });

  const hostKeyPath = join(workDir, "hostkey");
  const clientKeyPath = join(workDir, "id_ed25519");
  const authorizedKeysPath = join(workDir, "authorized_keys");
  const sshdConfigPath = join(workDir, "sshd_config");
  const pidFilePath = join(workDir, "sshd.pid");

  log("generating ephemeral host + client ed25519 keypairs (no passphrase)");
  await execFileP("ssh-keygen", ["-t", "ed25519", "-f", hostKeyPath, "-N", "", "-q"]);
  await execFileP("ssh-keygen", ["-t", "ed25519", "-f", clientKeyPath, "-N", "", "-q"]);
  chmodSync(clientKeyPath, 0o600);
  chmodSync(hostKeyPath, 0o600);

  const publicKey = readFileSync(`${clientKeyPath}.pub`, "utf8");
  writeFileSync(authorizedKeysPath, publicKey, { mode: 0o600 });

  const port = await findFreePort();
  const username = userInfo().username;

  // StrictModes off: this fixture's run-root directories are created with
  // whatever permissive default mkdirSync/mkdtempSync produce, which
  // StrictModes' home/authorized_keys ownership-and-permission checks can
  // reject depending on the host's umask — irrelevant here since this sshd
  // only ever accepts connections from the one ephemeral key generated
  // above. UsePAM off avoids depending on the host's PAM stack for a
  // same-user, key-only, localhost-only login.
  const sshdConfig = [
    `Port ${port}`,
    "ListenAddress 127.0.0.1",
    `HostKey ${hostKeyPath}`,
    `AuthorizedKeysFile ${authorizedKeysPath}`,
    "PubkeyAuthentication yes",
    "PasswordAuthentication no",
    "KbdInteractiveAuthentication no",
    "UsePAM no",
    "StrictModes no",
    `PidFile ${pidFilePath}`,
    "AllowTcpForwarding no",
    "X11Forwarding no",
    "LogLevel ERROR",
    "",
  ].join("\n");
  writeFileSync(sshdConfigPath, sshdConfig);

  log(`starting sshd on 127.0.0.1:${port} (workDir=${workDir})`);
  const child = spawn(sshdPath, ["-f", sshdConfigPath, "-D", "-e"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) log(`sshd: ${text}`);
  });
  child.on("exit", (code, signal) => {
    log(`sshd exited (code=${code}, signal=${signal})`);
  });

  await raceSpawnAgainstReadiness(child, sshdPath, waitForPortOpen(port, 10_000));
  log(`sshd ready on 127.0.0.1:${port}`);

  return {
    port,
    username,
    identityPath: clientKeyPath,
    workDir,
    remotesParent,
    process: child,
  };
}

/**
 * Writes the env file `support/ssh-wrapper.sh` reads at every ssh invocation
 * so the already-running app's git subprocesses can reach this fixture's
 * sshd — see this module's own doc comment for the full chain. Idempotent:
 * safe to call again if a spec re-targets a new server.
 */
export function configureSsh(server: SshRemoteServer): void {
  const runRoot = resolveRunRoot();
  const gitDir = join(runRoot, "git");
  mkdirSync(gitDir, { recursive: true });
  const configPath = join(gitDir, "ssh-remote-command.env");
  writeFileSync(
    configPath,
    `RIS_SSH_REMOTE_PORT=${server.port}\nRIS_SSH_REMOTE_IDENTITY=${server.identityPath}\n`,
  );
  log(`wrote ssh-wrapper config -> ${configPath} (port=${server.port})`);
}

/** Removes the ssh-wrapper config file so subsequent ssh invocations (if
 * any, from a differently-scoped spec run later in the same process) fail
 * closed rather than silently reusing a stopped server's stale port. */
function clearSshConfig(): void {
  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (!runRoot) return;
  const configPath = join(runRoot, "git", "ssh-remote-command.env");
  if (existsSync(configPath)) rmSync(configPath, { force: true });
}

/** Stops sshd and removes its ephemeral key/config directory plus every
 * bare remote created under `remotesParent` (createBareRemote's default
 * parent). Safe to call even if the process already exited — leaves no
 * remote state behind, per this stage's own "unlike 3F.1's fully local
 * operations" cleanup concern. */
export async function cleanup(server: SshRemoteServer): Promise<void> {
  clearSshConfig();

  if (!server.process.killed && server.process.exitCode === null) {
    server.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.process.kill("SIGKILL");
        resolve();
      }, 3_000);
      server.process.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  const runRoot = process.env["RIS_E2E_RUN_ROOT"];
  if (runRoot && isStrictChildPath(runRoot, server.workDir) && existsSync(server.workDir)) {
    await rm(server.workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  if (runRoot && isStrictChildPath(runRoot, server.remotesParent) && existsSync(server.remotesParent)) {
    await rm(server.remotesParent, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  log(`stopped sshd and removed ${server.workDir} and ${server.remotesParent}`);
}

// ── Bare remote repositories ──────────────────────────────────────────────────

/**
 * Creates a bare repository under `parent` (defaults to the server's
 * `remotesParent`) and returns its absolute path — the path half of the
 * `user@127.0.0.1:<path>` SCP-like URL the app's "Add remote" form expects.
 */
export async function createBareRemote(parent: string, label = "remote"): Promise<string> {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const bareDir = join(parent, `${label}-${suffix}.git`);
  mkdirSync(bareDir, { recursive: true });
  await runGit(bareDir, ["init", "--bare", "-q"]);
  return bareDir;
}

/** Builds the SCP-like SSH remote URL the app's "Add remote" form accepts
 * (see this module's doc comment — the port lives in the wrapper's config
 * file, not in the URL). */
export function buildSshRemoteUrl(server: SshRemoteServer, bareRepoPath: string): string {
  return `${server.username}@127.0.0.1:${bareRepoPath}`;
}

/**
 * Seeds an otherwise-empty bare remote with `localRepoPath`'s current
 * branch, by pushing directly to the bare repo's filesystem path — test-side
 * only, no SSH (same rationale as `pushSimulatedRemoteCommit`: the fixture
 * and the test runner share a machine, whereas the *application under test*
 * always goes through the real SSH transport). Added for Stage 3F.3
 * (git-clone-workflows.e2e.ts), which needs remote content to already exist
 * before the app clones it — unlike Stage 3F.2's push/pull scenarios, which
 * always started from an empty remote and populated it *through* the app.
 *
 * A `git push` creates `refs/heads/<branch>` but does **not** touch the
 * bare repo's symbolic HEAD — `git init --bare` sets that once, up front,
 * to whatever `init.defaultBranch` resolves to on the host running the
 * test, independent of `branch`. Relying on those two happening to match
 * is an environmental assumption, not deterministic fixture behaviour:
 * confirmed with a standalone repro (mismatched local branch name pushed
 * to a fresh bare repo, HEAD left unset) that `git clone` of such a repo
 * exits 0 — no fatal error — but prints "warning: remote HEAD refers to
 * nonexistent ref, unable to checkout" and leaves the destination
 * directory completely empty (an unborn-HEAD working tree, zero files).
 * Downstream, `clone_repository_cmd` would then fail
 * `open_repository(dest_path)` on that empty directory with a confusing
 * "not a valid RIS repository" error — exactly the environment-dependent
 * failure this seeding helper must not risk. So HEAD is set explicitly
 * here, after the push, rather than left to chance.
 */
export async function seedBareRemoteFromLocalRepo(
  localRepoPath: string,
  bareRepoPath: string,
  branch: string,
): Promise<void> {
  await runGit(localRepoPath, ["push", "-q", bareRepoPath, `${branch}:${branch}`]);
  await runGit(bareRepoPath, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
}

// ── Bare-remote inspection helpers ────────────────────────────────────────────
//
// These operate on the bare repository directly via the local filesystem
// (no SSH round trip) — legitimate for test-side verification/simulation:
// the fixture and the test runner share the same machine, whereas the
// *application under test* always goes through the real SSH transport
// (enforced by validate_remote_url rejecting local-path remotes — see
// crates/ris-git/src/lib.rs). Mirrors local-git.ts's inspection helpers.

export async function getRemoteHeadCommit(bareRepoPath: string, ref = "HEAD"): Promise<string> {
  const result = await runGit(bareRepoPath, ["rev-parse", ref]);
  return result.stdout.trim();
}

export async function getRemoteCommitCount(bareRepoPath: string, ref = "HEAD"): Promise<number> {
  const result = await runGit(bareRepoPath, ["rev-list", "--count", ref]);
  return Number.parseInt(result.stdout.trim(), 10);
}

/**
 * Simulates a commit landing on the remote from elsewhere (e.g. a
 * teammate's push) — clones `bareRepoPath` into a scratch directory via a
 * plain local-path clone (test-side only, see the section doc comment
 * above), writes `fileName`, commits, and pushes back. Returns the new
 * commit SHA.
 */
export async function pushSimulatedRemoteCommit(
  bareRepoPath: string,
  scratchParent: string,
  branch: string,
  fileName: string,
  message: string,
): Promise<string> {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const scratchDir = join(scratchParent, `remote-sim-${suffix}`);
  mkdirSync(scratchDir, { recursive: true });

  await runGit(scratchParent, ["clone", "-q", bareRepoPath, scratchDir]);
  await runGit(scratchDir, ["config", "user.name", "RIS WDIO Remote Simulator"]);
  await runGit(scratchDir, ["config", "user.email", "wdio-remote-sim@localhost.invalid"]);
  writeFileSync(join(scratchDir, fileName), `${message}\n`);
  await runGit(scratchDir, ["add", "-A"]);
  await runGit(scratchDir, ["commit", "-q", "-m", message]);
  await runGit(scratchDir, ["push", "-q", "origin", `HEAD:${branch}`]);
  const head = await runGit(scratchDir, ["rev-parse", "HEAD"]);

  await rm(scratchDir, { recursive: true, force: true });
  return head.stdout.trim();
}
