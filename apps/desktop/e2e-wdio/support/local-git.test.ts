// @vitest-environment node
/**
 * Unit tests for local-git.ts — the isolated local Git fixture
 * infrastructure prepared in Stage 3F.0.5 for future local Git workflow
 * specs (Stage 3F.1). No WDIO session, no network, no SSH, no Docker.
 *
 * Every git invocation here writes/reads only repository-local config
 * (never --global) — see the "isolates user.name/user.email" test below,
 * which proves a fixture commit never picks up a simulated "real
 * developer" global identity even though GIT_CONFIG_GLOBAL is set and
 * readable during the test.
 */
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GitCommandError,
  createLocalGitRepository,
  getCommitCount,
  getCurrentBranch,
  getHeadCommit,
  getRemoteUrl,
  getWorkingTreeStatus,
  isGitRepository,
  readGitConfig,
  runGit,
} from "./local-git";

const ENV_KEYS = [
  "RIS_E2E_RUN_ROOT",
  "RIS_E2E_REPOSITORY_PARENT",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
];

describe.sequential("local-git", () => {
  let runRoot: string;
  let repoParent: string;
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

    runRoot = mkdtempSync(join(tmpdir(), "local-git-test-"));
    repoParent = join(runRoot, "repositories");
    mkdirSync(repoParent, { recursive: true });

    process.env["RIS_E2E_RUN_ROOT"] = runRoot;
    process.env["RIS_E2E_REPOSITORY_PARENT"] = repoParent;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (existsSync(runRoot)) rmSync(runRoot, { recursive: true, force: true });
  });

  // ── runGit ───────────────────────────────────────────────────────────────

  describe("runGit", () => {
    it("resolves stdout/stderr/exitCode 0 for a successful command", async () => {
      const result = await runGit(repoParent, ["init"]);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(repoParent, ".git"))).toBe(true);
    });

    it("rejects with a GitCommandError carrying diagnostic context for an invalid subcommand", async () => {
      await runGit(repoParent, ["init"]);
      try {
        await runGit(repoParent, ["not-a-real-subcommand"]);
        expect.fail("expected runGit to reject");
      } catch (e) {
        expect(e).toBeInstanceOf(GitCommandError);
        const err = e as GitCommandError;
        expect(err.exitCode).not.toBe(0);
        expect(err.message).toContain("not-a-real-subcommand");
        expect(err.cwd).toBe(repoParent);
      }
    });

    it("passes arguments literally with no shell interpolation", async () => {
      await runGit(repoParent, ["init"]);
      await runGit(repoParent, ["config", "user.name", "Test"]);
      await runGit(repoParent, ["config", "user.email", "test@localhost.invalid"]);
      writeFileSync(join(repoParent, "f.txt"), "x");
      await runGit(repoParent, ["add", "f.txt"]);
      const shellMeta = "message; touch should-not-exist $(echo also-not) `echo neither`";
      await runGit(repoParent, ["commit", "-m", shellMeta]);
      const log = await runGit(repoParent, ["log", "-1", "--format=%s"]);
      expect(log.stdout.trim()).toBe(shellMeta);
      expect(existsSync(join(repoParent, "should-not-exist"))).toBe(false);
      expect(existsSync(join(repoParent, "also-not"))).toBe(false);
      expect(existsSync(join(repoParent, "neither"))).toBe(false);
    });
  });

  // ── createLocalGitRepository ────────────────────────────────────────────

  describe("createLocalGitRepository", () => {
    it("creates a repository without git init when initialized: false", async () => {
      const repo = await createLocalGitRepository({ initialized: false });
      try {
        expect(repo.initialized).toBe(false);
        expect(existsSync(join(repo.path, ".git"))).toBe(false);
        expect(await isGitRepository(repo.path)).toBe(false);
        // The RIS fixture is still written by default, independent of git init.
        expect(existsSync(join(repo.path, "inventory", "repo.yaml"))).toBe(true);
      } finally {
        await repo.cleanup();
      }
    });

    it("creates a repository with git init by default", async () => {
      const repo = await createLocalGitRepository();
      try {
        expect(repo.initialized).toBe(true);
        expect(await isGitRepository(repo.path)).toBe(true);
      } finally {
        await repo.cleanup();
      }
    });

    it("writes the racks/device-models/devices/placements directories the validator requires (VAL-REPO-004)", async () => {
      // Regression: the loader tolerates these being absent (an empty glob
      // read), but crates/ris-validation's VAL-REPO-004 is an ERROR-level
      // check that each of these paths exists — found while implementing
      // Stage 3F.1B's own Validate workflow spec, where a fixture missing
      // all four failed validation with 4 errors.
      const repo = await createLocalGitRepository({ label: "validator-dirs" });
      try {
        for (const dir of ["racks", "device-models", "devices", "placements"]) {
          expect(existsSync(join(repo.path, "inventory", dir))).toBe(true);
        }
      } finally {
        await repo.cleanup();
      }
    });

    it("creates a repository with an initial commit", async () => {
      const repo = await createLocalGitRepository({ initialCommit: true });
      try {
        expect(repo.initialCommitSha).toBeTruthy();
        expect(await getCommitCount(repo.path)).toBe(1);
        expect(await getHeadCommit(repo.path)).toBe(repo.initialCommitSha);
        expect(await getWorkingTreeStatus(repo.path)).toBe("clean");
      } finally {
        await repo.cleanup();
      }
    });

    it("isolates user.name/user.email locally and never reads a global identity", async () => {
      // Simulate a "real developer" global config with a different identity.
      // The fixture's commit must not pick this up despite GIT_CONFIG_GLOBAL
      // pointing at a real, readable file throughout this test.
      const fakeGlobalConfig = join(runRoot, "fake-global-gitconfig");
      writeFileSync(
        fakeGlobalConfig,
        "[user]\n\tname = Real Developer\n\temail = real.developer@example.com\n",
      );
      process.env["GIT_CONFIG_GLOBAL"] = fakeGlobalConfig;
      process.env["GIT_CONFIG_NOSYSTEM"] = "1";

      const repo = await createLocalGitRepository({ initialCommit: true });
      try {
        const authorName = await runGit(repo.path, ["log", "-1", "--format=%an"]);
        const authorEmail = await runGit(repo.path, ["log", "-1", "--format=%ae"]);
        expect(authorName.stdout.trim()).toBe("RIS WDIO Local Git Fixture");
        expect(authorEmail.stdout.trim()).toBe("wdio-local-git@localhost.invalid");
        expect(authorName.stdout.trim()).not.toBe("Real Developer");

        expect(await readGitConfig(repo.path, "user.name")).toBe("RIS WDIO Local Git Fixture");
      } finally {
        await repo.cleanup();
      }
    });

    it("reports clean vs dirty working-tree status", async () => {
      const clean = await createLocalGitRepository({ initialCommit: true });
      try {
        expect(await getWorkingTreeStatus(clean.path)).toBe("clean");
      } finally {
        await clean.cleanup();
      }

      const dirty = await createLocalGitRepository({ initialCommit: true, dirty: true });
      try {
        expect(await getWorkingTreeStatus(dirty.path)).toBe("dirty");
      } finally {
        await dirty.cleanup();
      }
    });

    it("adds and reads a remote URL without contacting the network", async () => {
      const repo = await createLocalGitRepository();
      try {
        await runGit(repo.path, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
        expect(await getRemoteUrl(repo.path)).toBe("https://example.invalid/repo.git");
        expect(await getRemoteUrl(repo.path, "nonexistent")).toBeNull();
      } finally {
        await repo.cleanup();
      }
    });

    it("cleanup removes the repository and is idempotent", async () => {
      const repo = await createLocalGitRepository();
      expect(existsSync(repo.path)).toBe(true);
      await repo.cleanup();
      expect(existsSync(repo.path)).toBe(false);
      await expect(repo.cleanup()).resolves.toBeUndefined();
    });

    it("refuses to clean up a path outside the isolated run root", async () => {
      const outsideParent = mkdtempSync(join(tmpdir(), "outside-run-root-"));
      try {
        const repo = await createLocalGitRepository({ parent: outsideParent });
        try {
          await expect(repo.cleanup()).rejects.toThrow(/refusing to remove a path outside/);
          expect(existsSync(repo.path)).toBe(true);
        } finally {
          rmSync(repo.path, { recursive: true, force: true });
        }
      } finally {
        rmSync(outsideParent, { recursive: true, force: true });
      }
    });

    it("throws a clear error when no parent is available", async () => {
      delete process.env["RIS_E2E_REPOSITORY_PARENT"];
      await expect(createLocalGitRepository()).rejects.toThrow(
        /RIS_E2E_REPOSITORY_PARENT is not set/,
      );
    });
  });

  // ── inspection helpers ───────────────────────────────────────────────────

  describe("inspection helpers", () => {
    it("getCurrentBranch returns the initial branch name", async () => {
      const repo = await createLocalGitRepository({ initialCommit: true });
      try {
        const branch = await getCurrentBranch(repo.path);
        expect(branch).toBeTruthy();
      } finally {
        await repo.cleanup();
      }
    });

    it("getCurrentBranch resolves on an unborn HEAD (git init with no commit yet)", async () => {
      // Regression: rev-parse --abbrev-ref HEAD fails on an unborn HEAD
      // (exit 128, "ambiguous argument 'HEAD'") — found while implementing
      // Stage 3F.1A's own init-detection spec, which reads the branch name
      // immediately after `git init`, before any commit exists.
      const repo = await createLocalGitRepository({ initialized: true, initialCommit: false });
      try {
        const branch = await getCurrentBranch(repo.path);
        expect(branch).toBeTruthy();
      } finally {
        await repo.cleanup();
      }
    });

    it("isGitRepository returns false for a non-existent path", async () => {
      expect(await isGitRepository(join(runRoot, "does-not-exist"))).toBe(false);
    });
  });
});
