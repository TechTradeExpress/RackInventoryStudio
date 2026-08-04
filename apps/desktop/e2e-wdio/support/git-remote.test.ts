// @vitest-environment node
/**
 * Unit tests for git-remote.ts — the local-sshd remote-Git fixture
 * infrastructure prepared in Stage 3F.2 for the git-remote-workflows spec.
 *
 * Exercises the fixture itself end-to-end with plain git (no WDIO session,
 * no Tauri app) — the same "prove the fixture works standalone before a
 * spec builds on it" approach local-git.test.ts uses for the local-only
 * fixtures. Skips (rather than failing) when sshd is unavailable, mirroring
 * crates/ris-git/tests' `if !git_available() { return; }` pattern for an
 * optional local dependency.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSshRemoteUrl,
  buildSshdConfig,
  buildWindowsAclArgs,
  buildWindowsSshdCandidates,
  cleanup,
  configureSsh,
  convertMsysPathToNative,
  createBareRemote,
  findSshd,
  getRemoteCommitCount,
  getRemoteHeadCommit,
  parseCandidateLines,
  pushSimulatedRemoteCommit,
  raceSpawnAgainstReadiness,
  securePrivateKeyFile,
  seedBareRemoteFromLocalRepo,
  selectFirstUsableCandidate,
  shQuote,
  startRemote,
} from "./git-remote";
import { runGit } from "./local-git";

const execFileAsync = promisify(execFile);

const ENV_KEYS = ["RIS_E2E_RUN_ROOT"];

// ── sshd discovery: pure helpers ─────────────────────────────────────────────
//
// These never touch the real filesystem/PATH and never depend on sshd being
// installed on the machine running the suite — they exercise the discovery
// and path-normalization logic entirely through injected inputs, so they run
// unconditionally (no sshdAvailable guard) on every platform/CI runner.

describe("parseCandidateLines", () => {
  it("splits on both LF and CRLF", () => {
    expect(parseCandidateLines("a\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("trims surrounding whitespace on each line", () => {
    expect(parseCandidateLines("  a  \n\tb\t\n")).toEqual(["a", "b"]);
  });

  it("ignores blank lines", () => {
    expect(parseCandidateLines("a\n\n\nb\n\n")).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseCandidateLines("")).toEqual([]);
  });

  it("returns an empty array for output that is only whitespace/newlines", () => {
    expect(parseCandidateLines("\n\n  \n")).toEqual([]);
  });
});

describe("convertMsysPathToNative", () => {
  it("converts a lowercase-drive MSYS path to a native path with an uppercase drive", () => {
    expect(convertMsysPathToNative("/c/WINDOWS/System32/OpenSSH/sshd")).toBe(
      "C:\\WINDOWS\\System32\\OpenSSH\\sshd",
    );
  });

  it("preserves an already-uppercase drive letter and the rest of the path's casing", () => {
    expect(convertMsysPathToNative("/C/Windows/System32/OpenSSH/sshd.exe")).toBe(
      "C:\\Windows\\System32\\OpenSSH\\sshd.exe",
    );
  });

  it("handles a non-C system drive", () => {
    expect(convertMsysPathToNative("/d/tools/openssh/sshd")).toBe("D:\\tools\\openssh\\sshd");
  });

  it("preserves spaces in path segments", () => {
    expect(convertMsysPathToNative("/c/Program Files/OpenSSH/sshd.exe")).toBe(
      "C:\\Program Files\\OpenSSH\\sshd.exe",
    );
  });

  it("returns null for an ordinary POSIX path, never misreading it as a drive path", () => {
    expect(convertMsysPathToNative("/usr/sbin/sshd")).toBeNull();
  });

  it("returns null for a relative or otherwise non-MSYS path", () => {
    expect(convertMsysPathToNative("sshd")).toBeNull();
    expect(convertMsysPathToNative("")).toBeNull();
  });
});

describe("selectFirstUsableCandidate", () => {
  it("returns the first candidate the injected exists() reports true for", () => {
    const exists = (p: string) => p === "B";
    expect(selectFirstUsableCandidate(["A", "B", "C"], exists)).toBe("B");
  });

  it("ignores earlier candidates that do not exist", () => {
    const exists = (p: string) => p === "C";
    expect(selectFirstUsableCandidate(["A", "B", "C"], exists)).toBe("C");
  });

  it("returns null when no candidate exists", () => {
    expect(selectFirstUsableCandidate(["A", "B"], () => false)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(selectFirstUsableCandidate([], () => true)).toBeNull();
  });
});

describe("buildWindowsSshdCandidates", () => {
  it("puts the known %WINDIR%/System32/OpenSSH/sshd.exe location first when systemRoot is given", () => {
    const candidates = buildWindowsSshdCandidates("C:\\WINDOWS", "", "");
    expect(candidates[0]).toBe("C:\\WINDOWS\\System32\\OpenSSH\\sshd.exe");
  });

  it("omits the known location when systemRoot is null", () => {
    const candidates = buildWindowsSshdCandidates(null, "", "");
    expect(candidates).toEqual([]);
  });

  it("includes native where.exe output candidates as-is, in reported order", () => {
    const whereOutput = "C:\\Windows\\System32\\OpenSSH\\sshd.exe\r\nC:\\ProgramData\\chocolatey\\bin\\sshd.exe\r\n";
    const candidates = buildWindowsSshdCandidates(null, whereOutput, "");
    expect(candidates).toEqual([
      "C:\\Windows\\System32\\OpenSSH\\sshd.exe",
      "C:\\ProgramData\\chocolatey\\bin\\sshd.exe",
    ]);
  });

  it("normalizes MSYS-style which output to native paths", () => {
    const candidates = buildWindowsSshdCandidates(null, "", "/c/WINDOWS/System32/OpenSSH/sshd\n");
    expect(candidates).toEqual(["C:\\WINDOWS\\System32\\OpenSSH\\sshd"]);
  });

  it("orders candidates: known location, then where.exe, then normalized which, and ignores blank lines", () => {
    const candidates = buildWindowsSshdCandidates(
      "C:\\WINDOWS",
      "\nC:\\Tools\\sshd.exe\n\n",
      "/d/tools/openssh/sshd\n",
    );
    expect(candidates).toEqual([
      "C:\\WINDOWS\\System32\\OpenSSH\\sshd.exe",
      "C:\\Tools\\sshd.exe",
      "D:\\tools\\openssh\\sshd",
    ]);
  });

  it("passes through a which line that isn't MSYS-style unchanged (e.g. already-native)", () => {
    const candidates = buildWindowsSshdCandidates(null, "", "C:\\already\\native\\sshd.exe\n");
    expect(candidates).toEqual(["C:\\already\\native\\sshd.exe"]);
  });
});

describe("raceSpawnAgainstReadiness", () => {
  it("rejects immediately with the original spawn error preserved as `cause`, not a generic timeout", async () => {
    const bogusPath = join(tmpdir(), "definitely-does-not-exist-sshd-binary-xyz");
    const child = spawn(bogusPath, []);
    // Deliberately never resolves — if raceSpawnAgainstReadiness didn't
    // actually race the spawn-error event, this test would hang until the
    // suite's own test timeout instead of failing fast and clearly.
    const neverResolves = new Promise<void>(() => {});

    await expect(raceSpawnAgainstReadiness(child, bogusPath, neverResolves)).rejects.toMatchObject({
      message: expect.stringContaining(`failed to spawn sshd at "${bogusPath}"`),
      cause: expect.objectContaining({ code: "ENOENT" }),
    });
  });

  it("resolves normally when the readiness promise wins and the child never errors", async () => {
    // A real, always-spawnable command so no 'error' event ever fires.
    const child = spawn(process.execPath, ["--version"]);
    await expect(raceSpawnAgainstReadiness(child, process.execPath, Promise.resolve())).resolves.toBeUndefined();
  });
});

describe("buildWindowsAclArgs", () => {
  it("strips inherited ACEs and grants Full Control to exactly the given user", () => {
    expect(buildWindowsAclArgs("C:\\work\\hostkey", "alice")).toEqual([
      "C:\\work\\hostkey",
      "/inheritance:r",
      "/grant:r",
      "alice:F",
    ]);
  });

  it("preserves a path containing spaces verbatim", () => {
    expect(buildWindowsAclArgs("C:\\work dir\\hostkey", "bob")).toEqual([
      "C:\\work dir\\hostkey",
      "/inheritance:r",
      "/grant:r",
      "bob:F",
    ]);
  });
});

describe("securePrivateKeyFile", () => {
  it("on win32, runs icacls with the args built by buildWindowsAclArgs and never calls chmod", () => {
    const icaclsCalls: string[][] = [];
    const chmodCalls: Array<[string, number]> = [];
    securePrivateKeyFile("C:\\work\\hostkey", {
      platform: "win32",
      username: "alice",
      runIcacls: (args) => icaclsCalls.push(args),
      chmod: (p, m) => chmodCalls.push([p, m]),
    });
    expect(icaclsCalls).toEqual([["C:\\work\\hostkey", "/inheritance:r", "/grant:r", "alice:F"]]);
    expect(chmodCalls).toEqual([]);
  });

  it("on linux, chmods to 0o600 and never calls icacls", () => {
    const icaclsCalls: string[][] = [];
    const chmodCalls: Array<[string, number]> = [];
    securePrivateKeyFile("/tmp/hostkey", {
      platform: "linux",
      runIcacls: (args) => icaclsCalls.push(args),
      chmod: (p, m) => chmodCalls.push([p, m]),
    });
    expect(chmodCalls).toEqual([["/tmp/hostkey", 0o600]]);
    expect(icaclsCalls).toEqual([]);
  });

  it("on darwin, also chmods to 0o600 (same as linux)", () => {
    const chmodCalls: Array<[string, number]> = [];
    securePrivateKeyFile("/tmp/hostkey", { platform: "darwin", chmod: (p, m) => chmodCalls.push([p, m]) });
    expect(chmodCalls).toEqual([["/tmp/hostkey", 0o600]]);
  });

  it("defaults to process.platform when no platform is given", () => {
    const chmodCalls: Array<[string, number]> = [];
    const icaclsCalls: string[][] = [];
    securePrivateKeyFile("key", { chmod: (p, m) => chmodCalls.push([p, m]), runIcacls: (a) => icaclsCalls.push(a) });
    if (process.platform === "win32") {
      expect(icaclsCalls.length).toBe(1);
      expect(chmodCalls).toEqual([]);
    } else {
      expect(chmodCalls).toEqual([["key", 0o600]]);
      expect(icaclsCalls).toEqual([]);
    }
  });
});

describe("buildSshdConfig", () => {
  const baseOptions = {
    port: 54321,
    hostKeyPath: "/work/hostkey",
    authorizedKeysPath: "/work/authorized_keys",
    pidFilePath: "/work/sshd.pid",
  };

  it("includes UsePAM no on linux", () => {
    const config = buildSshdConfig({ ...baseOptions, platform: "linux" });
    expect(config).toContain("UsePAM no");
  });

  it("includes UsePAM no on darwin (POSIX, same as linux)", () => {
    const config = buildSshdConfig({ ...baseOptions, platform: "darwin" });
    expect(config).toContain("UsePAM no");
  });

  it("omits UsePAM entirely on win32 (unsupported directive, not merely a no-op)", () => {
    const config = buildSshdConfig({ ...baseOptions, platform: "win32" });
    expect(config).not.toContain("UsePAM");
  });

  it("keeps every other directive identical between win32 and linux", () => {
    const linux = buildSshdConfig({ ...baseOptions, platform: "linux" })
      .split("\n")
      .filter((line) => !line.startsWith("UsePAM"));
    const windows = buildSshdConfig({ ...baseOptions, platform: "win32" }).split("\n");
    expect(windows).toEqual(linux);
  });

  it("includes the port, host key path, and authorized_keys path", () => {
    const config = buildSshdConfig({ ...baseOptions, platform: "linux" });
    expect(config).toContain("Port 54321");
    expect(config).toContain("HostKey /work/hostkey");
    expect(config).toContain("AuthorizedKeysFile /work/authorized_keys");
    expect(config).toContain("PidFile /work/sshd.pid");
  });

  it("defaults to process.platform when no platform is given", () => {
    const config = buildSshdConfig(baseOptions);
    expect(config.includes("UsePAM")).toBe(process.platform !== "win32");
  });
});

// ── shQuote: pure serialization ──────────────────────────────────────────────
//
// No filesystem/process access — exercises the escaping logic in isolation,
// unconditionally, on every platform/CI runner.

describe("shQuote", () => {
  it("wraps a plain value in single quotes", () => {
    expect(shQuote("hello")).toBe("'hello'");
  });

  it("preserves a Windows path with backslashes", () => {
    expect(shQuote("C:\\Users\\Test\\id_ed25519")).toBe("'C:\\Users\\Test\\id_ed25519'");
  });

  it("preserves a Windows path with spaces", () => {
    expect(shQuote("C:\\Users\\Test User\\ssh keys\\id_ed25519")).toBe(
      "'C:\\Users\\Test User\\ssh keys\\id_ed25519'",
    );
  });

  it("preserves a POSIX path unchanged", () => {
    expect(shQuote("/home/test/.ssh/id_ed25519")).toBe("'/home/test/.ssh/id_ed25519'");
  });

  it("leaves a dollar sign inert (no expansion inside single quotes)", () => {
    expect(shQuote("$HOME/test")).toBe("'$HOME/test'");
  });

  it("leaves backticks inert (no command substitution inside single quotes)", () => {
    expect(shQuote("`test`")).toBe("'`test`'");
  });

  it("leaves double quotes untouched", () => {
    expect(shQuote('"quoted"')).toBe("'\"quoted\"'");
  });

  it("escapes an embedded single quote with the close/escape/reopen idiom", () => {
    expect(shQuote("'value'")).toBe("''\\''value'\\'''");
  });

  it("preserves a trailing backslash", () => {
    expect(shQuote("C:\\Users\\Test\\")).toBe("'C:\\Users\\Test\\'");
  });

  it("preserves embedded spaces", () => {
    expect(shQuote("a b c")).toBe("'a b c'");
  });
});

// ── shQuote: round-trip through a real Bash `source` ─────────────────────────
//
// Proves the contract end-to-end the way ssh-wrapper.sh actually consumes
// it: write `NAME=<shQuote(value)>` to a file, source that file in a real
// Bash process, echo the variable back, and compare byte-for-byte. Requires
// only `bash` on PATH (present wherever ssh-wrapper.sh itself can run,
// including Git-for-Windows CI) — no sshd, so this is deterministic and
// doesn't depend on the sshd-gated tests below.

const bashAvailable = await (async () => {
  try {
    await execFileAsync("bash", ["-c", "true"]);
    return true;
  } catch {
    return false;
  }
})();
if (!bashAvailable) {
  // eslint-disable-next-line no-console
  console.warn("[git-remote.test] bash not found — skipping shQuote round-trip tests");
}

describe.skipIf(!bashAvailable)("shQuote round-trip through a real Bash source", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shquote-roundtrip-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Writes `NAME=<shQuote(value)>` to a fresh env file and sources it in a
   * real bash subprocess, returning exactly what that bash resolved `NAME`
   * to. `envPath` is passed as bash's positional `$1` (via the `_` $0
   * placeholder) rather than interpolated into the `-c` script string, so
   * this harness's own quoting can't mask a bug in `shQuote` itself. */
  async function roundTrip(name: string, value: string): Promise<string> {
    const envPath = join(dir, "env");
    writeFileSync(envPath, `${name}=${shQuote(value)}\n`);
    const { stdout } = await execFileAsync("bash", [
      "-c",
      `source "$1" && printf '%s' "\${${name}}"`,
      "_",
      envPath,
    ]);
    return stdout;
  }

  it.each([
    ["Windows path", "C:\\Users\\Test\\id_ed25519"],
    ["Windows path with spaces", "C:\\Users\\Test User\\ssh keys\\id_ed25519"],
    ["POSIX path", "/home/test/.ssh/id_ed25519"],
    ["dollar sign", "$HOME/test"],
    ["backticks", "`test`"],
    ["double quotes", '"quoted"'],
    ["single quotes", "'value'"],
    ["trailing backslash", "C:\\Users\\Test\\"],
    ["embedded spaces", "a b c"],
  ])("preserves %s byte-for-byte", async (_label, value) => {
    expect(await roundTrip("RIS_TEST_VAR", value)).toBe(value);
  });

  it("preserves multiple exported variables independently", async () => {
    const envPath = join(dir, "env");
    const a = "C:\\Users\\Test\\id_ed25519";
    const b = "$literal `not a command` \"quoted\" 'and single'";
    writeFileSync(envPath, `RIS_TEST_A=${shQuote(a)}\nRIS_TEST_B=${shQuote(b)}\n`);
    const { stdout } = await execFileAsync("bash", [
      "-c",
      'source "$1" && printf \'%s\\x1f%s\' "$RIS_TEST_A" "$RIS_TEST_B"',
      "_",
      envPath,
    ]);
    const [gotA, gotB] = stdout.split("\x1f");
    expect(gotA).toBe(a);
    expect(gotB).toBe(b);
  });
});

// Top-level await: resolved once, before any test/skipIf is registered —
// skipIf only accepts a boolean (a function is truthy and would always
// "skip"), so this has to be a real value by the time describe() runs.
const sshdAvailable = (await findSshd()) !== null;
if (!sshdAvailable) {
  // eslint-disable-next-line no-console
  console.warn("[git-remote.test] sshd not found — skipping git-remote unit tests");
}

describe.sequential("git-remote", () => {
  let runRoot: string;
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    runRoot = mkdtempSync(join(tmpdir(), "git-remote-test-"));
    mkdirSync(join(runRoot, "git"), { recursive: true });
    process.env["RIS_E2E_RUN_ROOT"] = runRoot;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(runRoot)) rmSync(runRoot, { recursive: true, force: true });
  });

  it.skipIf(!sshdAvailable)(
    "starts sshd, accepts the ephemeral key, and stops cleanly",
    async () => {
      const server = await startRemote();
      try {
        expect(server.port).toBeGreaterThan(0);
        expect(existsSync(server.identityPath)).toBe(true);

        const result = await runGit(server.workDir, ["--version"]).catch(() => null);
        // Sanity: git itself is available in this environment (used by the assertions below).
        expect(result).not.toBeNull();
      } finally {
        await cleanup(server);
      }
      expect(existsSync(server.workDir)).toBe(false);
    },
  );

  it.skipIf(!sshdAvailable)(
    "createBareRemote creates an empty bare repository",
    async () => {
      const server = await startRemote();
      try {
        const bareDir = await createBareRemote(server.remotesParent, "test-remote");
        expect(existsSync(bareDir)).toBe(true);
        const result = await runGit(bareDir, ["rev-parse", "--is-bare-repository"]);
        expect(result.stdout.trim()).toBe("true");
      } finally {
        await cleanup(server);
      }
    },
  );

  it.skipIf(!sshdAvailable)(
    "seedBareRemoteFromLocalRepo pushes an existing local repo's branch directly into an empty bare remote " +
      "and makes the bare repo's symbolic HEAD deterministic regardless of host git config",
    async () => {
      const server = await startRemote();
      try {
        const bareDir = await createBareRemote(server.remotesParent, "seed-test");

        // Deliberately not "master" or "main" — whatever this host's own
        // init.defaultBranch resolves to for `git init --bare` (used by
        // createBareRemote, with no override), it will not be this name.
        // If seedBareRemoteFromLocalRepo failed to set the bare repo's
        // symbolic HEAD explicitly, the bare repo's HEAD would still point
        // at the host's default branch — a ref that would not exist in
        // this repo — reproducing exactly the "remote HEAD refers to
        // nonexistent ref" failure this test guards against.
        const branch = "ris-seed-test-branch";

        const workDir = join(runRoot, "seed-work");
        mkdirSync(workDir, { recursive: true });
        await runGit(workDir, ["-c", `init.defaultBranch=${branch}`, "init", "-q"]);
        await runGit(workDir, ["config", "user.name", "Test"]);
        await runGit(workDir, ["config", "user.email", "test@localhost.invalid"]);
        writeFileSync(join(workDir, "seed.txt"), "seed\n");
        await runGit(workDir, ["add", "-A"]);
        await runGit(workDir, ["commit", "-q", "-m", "seed commit"]);
        expect((await runGit(workDir, ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe(branch);
        const localHead = (await runGit(workDir, ["rev-parse", "HEAD"])).stdout.trim();

        await seedBareRemoteFromLocalRepo(workDir, bareDir, branch);

        expect(await getRemoteHeadCommit(bareDir, branch)).toBe(localHead);
        expect(await getRemoteCommitCount(bareDir, branch)).toBe(1);

        // The actual fix under test: the bare repo's symbolic HEAD must
        // point at refs/heads/<branch>, not whatever init.defaultBranch
        // gave it when createBareRemote ran `git init --bare`.
        const bareHead = await runGit(bareDir, ["symbolic-ref", "HEAD"]);
        expect(bareHead.stdout.trim()).toBe(`refs/heads/${branch}`);

        // End-to-end proof: a normal `git clone` (no branch specified,
        // exactly what the app's `ris_git::clone()` runs) must check out
        // `branch` automatically, with no warning and a non-empty working
        // tree — the failure mode a mismatched HEAD produces.
        const cloneDir = join(runRoot, "seed-clone");
        await runGit(runRoot, ["clone", "-q", bareDir, cloneDir]);
        expect((await runGit(cloneDir, ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe(branch);
        expect((await runGit(cloneDir, ["rev-parse", "HEAD"])).stdout.trim()).toBe(localHead);
        expect(existsSync(join(cloneDir, "seed.txt"))).toBe(true);
      } finally {
        await cleanup(server);
      }
    },
  );

  it.skipIf(!sshdAvailable)(
    "configureSsh writes a config file the wrapper script can source",
    async () => {
      const server = await startRemote();
      try {
        configureSsh(server);
        const configPath = join(runRoot, "git", "ssh-remote-command.env");
        expect(existsSync(configPath)).toBe(true);
        const contents = readFileSync(configPath, "utf8");
        expect(contents).toContain(`RIS_SSH_REMOTE_PORT=${shQuote(String(server.port))}`);
        expect(contents).toContain(`RIS_SSH_REMOTE_IDENTITY=${shQuote(server.identityPath)}`);
      } finally {
        await cleanup(server);
      }
    },
  );

  it.skipIf(!sshdAvailable)(
    "cleanup removes the ssh-remote-command.env config file",
    async () => {
      const server = await startRemote();
      configureSsh(server);
      const configPath = join(runRoot, "git", "ssh-remote-command.env");
      expect(existsSync(configPath)).toBe(true);
      await cleanup(server);
      expect(existsSync(configPath)).toBe(false);
    },
  );

  // ── End-to-end push/pull over the fixture's real SSH transport ────────────
  //
  // Uses the ssh-wrapper.sh script exactly as the application would (via
  // GIT_SSH_COMMAND), not a shortcut — the strongest proof the fixture is
  // usable by Stage 3F.2's actual spec.

  it.skipIf(!sshdAvailable)(
    "supports a real push and pull round trip through GIT_SSH_COMMAND -> ssh-wrapper.sh -> sshd",
    async () => {
      const server = await startRemote();
      const savedSshCommand = process.env["GIT_SSH_COMMAND"];
      try {
        configureSsh(server);
        const wrapperPath = join(
          import.meta.dirname,
          "ssh-wrapper.sh",
        );
        process.env["GIT_SSH_COMMAND"] = `bash "${wrapperPath}"`;

        const bareDir = await createBareRemote(server.remotesParent, "roundtrip");
        const remoteUrl = buildSshRemoteUrl(server, bareDir);
        expect(remoteUrl).toBe(`${server.username}@127.0.0.1:${bareDir}`);

        const workDir = join(runRoot, "work");
        mkdirSync(workDir, { recursive: true });
        await runGit(workDir, ["init", "-q"]);
        await runGit(workDir, ["config", "user.name", "Test"]);
        await runGit(workDir, ["config", "user.email", "test@localhost.invalid"]);
        writeFileSync(join(workDir, "a.txt"), "hello\n");
        await runGit(workDir, ["add", "-A"]);
        await runGit(workDir, ["commit", "-q", "-m", "initial"]);
        await runGit(workDir, ["remote", "add", "origin", remoteUrl]);
        const branch = (await runGit(workDir, ["symbolic-ref", "--short", "HEAD"])).stdout.trim();

        await runGit(workDir, ["push", "-q", "-u", "origin", branch]);

        const localHead = (await runGit(workDir, ["rev-parse", "HEAD"])).stdout.trim();
        expect(await getRemoteHeadCommit(bareDir, branch)).toBe(localHead);
        expect(await getRemoteCommitCount(bareDir, branch)).toBe(1);

        // Simulate a teammate's commit landing on the remote, then pull it.
        const simulatedSha = await pushSimulatedRemoteCommit(
          bareDir,
          server.remotesParent,
          branch,
          "from-teammate.txt",
          "Simulated remote commit",
        );
        expect(await getRemoteCommitCount(bareDir, branch)).toBe(2);

        await runGit(workDir, ["pull", "-q", "--ff-only", "origin", branch]);
        const pulledHead = (await runGit(workDir, ["rev-parse", "HEAD"])).stdout.trim();
        expect(pulledHead).toBe(simulatedSha);
        expect(existsSync(join(workDir, "from-teammate.txt"))).toBe(true);
      } finally {
        if (savedSshCommand === undefined) delete process.env["GIT_SSH_COMMAND"];
        else process.env["GIT_SSH_COMMAND"] = savedSshCommand;
        await cleanup(server);
      }
    },
    30_000,
  );
});
