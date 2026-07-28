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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSshRemoteUrl,
  cleanup,
  configureSsh,
  createBareRemote,
  findSshd,
  getRemoteCommitCount,
  getRemoteHeadCommit,
  pushSimulatedRemoteCommit,
  seedBareRemoteFromLocalRepo,
  startRemote,
} from "./git-remote";
import { runGit } from "./local-git";

const ENV_KEYS = ["RIS_E2E_RUN_ROOT"];

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
        expect(contents).toContain(`RIS_SSH_REMOTE_PORT=${server.port}`);
        expect(contents).toContain(`RIS_SSH_REMOTE_IDENTITY=${server.identityPath}`);
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
