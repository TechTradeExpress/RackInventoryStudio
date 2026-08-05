// @vitest-environment node
/**
 * Unit tests for git-remote-fixture.ts's `createGitRemoteFixture()`
 * control flow (Stage 3F.5.5-R1) — provider branching, the native
 * atomic-setup/rollback path, and the resulting adapter's argument wiring.
 * Real production code, fake injected `CreateGitRemoteFixtureDeps` — no
 * real sshd/Docker/WSL/Git process required, same dependency-injection
 * testing philosophy `container-git-remote.test.ts` already uses for
 * `ContainerOpsDeps`.
 *
 * Does not mock WDIO (this module has no WebdriverIO dependency to mock)
 * and does not test scenario assertions (those belong to each spec's own
 * `it()` bodies, unaffected by this module).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitRemoteFixture, defaultCreateGitRemoteFixtureDeps, type CreateGitRemoteFixtureDeps } from "./git-remote-fixture";
import { resolveGitRemoteProvider } from "./container-git-remote";
import type {
  ContainerRemoteFixtureHandle,
  ErrorWithCleanupDiagnostics,
  FixtureCleanupResult,
} from "./container-git-remote";
import type { SshRemoteServer } from "./git-remote";

function fakeServer(overrides: Partial<SshRemoteServer> = {}): SshRemoteServer {
  return {
    port: 32768,
    username: "test-user",
    identityPath: "C:\\work\\id_ed25519",
    workDir: "C:\\work",
    remotesParent: "C:\\work\\remotes",
    process: {} as SshRemoteServer["process"],
    ...overrides,
  };
}

function fakeContainerHandle(overrides: Partial<ContainerRemoteFixtureHandle> = {}): ContainerRemoteFixtureHandle {
  return {
    createBareRemote: vi.fn(async () => "/home/git/repos/fake.git"),
    buildRemoteUrl: vi.fn((bareRepoPath: string) => `git@127.0.0.1:${bareRepoPath}`),
    seedBareRemote: vi.fn(async () => {}),
    getRemoteHeadCommit: vi.fn(async () => "abc123"),
    getRemoteCommitCount: vi.fn(async () => 1),
    pushSimulatedRemoteCommit: vi.fn(async () => "def456"),
    cleanup: vi.fn(async () => ({ ok: true, provider: "container", errors: [] }) as FixtureCleanupResult),
    ...overrides,
  };
}

function fakeDeps(overrides: Partial<CreateGitRemoteFixtureDeps> = {}): CreateGitRemoteFixtureDeps {
  return {
    resolveProvider: vi.fn(() => "native"),
    createContainerFixture: vi.fn(async () => fakeContainerHandle()),
    findNativeSshd: vi.fn(async () => "/usr/sbin/sshd"),
    startNativeRemote: vi.fn(async () => fakeServer()),
    configureNativeSsh: vi.fn(),
    cleanupNativeRemote: vi.fn(async () => {}),
    createNativeBareRemote: vi.fn(async () => "C:\\work\\remotes\\scenario1.git"),
    buildNativeRemoteUrl: vi.fn((_server, bareRepoPath: string) => `native-user@127.0.0.1:${bareRepoPath}`),
    seedNativeBareRemote: vi.fn(async () => {}),
    getNativeRemoteHeadCommit: vi.fn(async () => "aaa111"),
    getNativeRemoteCommitCount: vi.fn(async () => 1),
    pushSimulatedNativeRemoteCommit: vi.fn(async () => "bbb222"),
    ...overrides,
  };
}

// ── 1. Container provider ────────────────────────────────────────────────

describe("createGitRemoteFixture — container provider", () => {
  it("calls createContainerFixture exactly once and touches no native dependency", async () => {
    const handle = fakeContainerHandle();
    const deps = fakeDeps({
      resolveProvider: vi.fn(() => "container"),
      createContainerFixture: vi.fn(async () => handle),
    });
    const fixture = await createGitRemoteFixture(deps);
    expect(deps.createContainerFixture).toHaveBeenCalledTimes(1);
    expect(deps.findNativeSshd).not.toHaveBeenCalled();
    expect(deps.startNativeRemote).not.toHaveBeenCalled();
    expect(deps.configureNativeSsh).not.toHaveBeenCalled();
    // The container handle is returned as-is — it already satisfies
    // GitRemoteFixture structurally (see ContainerRemoteFixtureHandle).
    expect(fixture).toBe(handle);
  });

  it("exposes the container handle's own operations through the returned GitRemoteFixture shape", async () => {
    const handle = fakeContainerHandle();
    const deps = fakeDeps({
      resolveProvider: vi.fn(() => "container"),
      createContainerFixture: vi.fn(async () => handle),
    });
    const fixture = await createGitRemoteFixture(deps);
    await fixture.createBareRemote("scenario1");
    await fixture.buildRemoteUrl("/home/git/repos/x.git");
    await fixture.seedBareRemote("C:\\seed", "/home/git/repos/x.git", "main");
    await fixture.getRemoteHeadCommit("/home/git/repos/x.git", "main");
    await fixture.getRemoteCommitCount("/home/git/repos/x.git", "main");
    await fixture.pushSimulatedRemoteCommit("/home/git/repos/x.git", "main", "f.txt", "msg");
    await fixture.cleanup();
    expect(handle.createBareRemote).toHaveBeenCalledWith("scenario1");
    expect(handle.seedBareRemote).toHaveBeenCalledWith("C:\\seed", "/home/git/repos/x.git", "main");
    expect(handle.cleanup).toHaveBeenCalledTimes(1);
  });
});

// ── 2. Native prerequisite missing ───────────────────────────────────────

describe("createGitRemoteFixture — native prerequisite missing", () => {
  it("throws a clear prerequisite error and never calls startNativeRemote", async () => {
    const deps = fakeDeps({ findNativeSshd: vi.fn(async () => null) });
    await expect(createGitRemoteFixture(deps)).rejects.toThrow(/sshd was not found/);
    expect(deps.startNativeRemote).not.toHaveBeenCalled();
  });
});

// ── 3. Native setup success ──────────────────────────────────────────────

describe("createGitRemoteFixture — native setup success", () => {
  it("runs startNativeRemote then configureNativeSsh, and the adapter maps every operation correctly", async () => {
    const server = fakeServer({ remotesParent: "C:\\work\\remotes" });
    const deps = fakeDeps({
      startNativeRemote: vi.fn(async () => server),
    });
    const fixture = await createGitRemoteFixture(deps);
    expect(deps.startNativeRemote).toHaveBeenCalledTimes(1);
    expect(deps.configureNativeSsh).toHaveBeenCalledWith(server);
    expect(deps.configureNativeSsh).toHaveBeenCalledTimes(1);

    await fixture.createBareRemote("scenario1");
    expect(deps.createNativeBareRemote).toHaveBeenCalledWith("C:\\work\\remotes", "scenario1");

    fixture.buildRemoteUrl("C:\\work\\remotes\\x.git");
    expect(deps.buildNativeRemoteUrl).toHaveBeenCalledWith(server, "C:\\work\\remotes\\x.git");

    await fixture.seedBareRemote("C:\\seed", "C:\\work\\remotes\\x.git", "main");
    expect(deps.seedNativeBareRemote).toHaveBeenCalledWith("C:\\seed", "C:\\work\\remotes\\x.git", "main");

    await fixture.getRemoteHeadCommit("C:\\work\\remotes\\x.git", "main");
    expect(deps.getNativeRemoteHeadCommit).toHaveBeenCalledWith("C:\\work\\remotes\\x.git", "main");

    await fixture.getRemoteCommitCount("C:\\work\\remotes\\x.git", "main");
    expect(deps.getNativeRemoteCommitCount).toHaveBeenCalledWith("C:\\work\\remotes\\x.git", "main");
  });
});

// ── 4/5/6. Native configure() failure — atomic rollback diagnostics ─────

describe("createGitRemoteFixture — native configure failure", () => {
  it("configure fails, cleanup succeeds: cleanup runs exactly once, the original Error instance is rethrown, no cleanupDiagnostics attached", async () => {
    const configureError = new Error("failed to write ssh-remote-command.env");
    const server = fakeServer();
    const deps = fakeDeps({
      startNativeRemote: vi.fn(async () => server),
      configureNativeSsh: vi.fn(() => {
        throw configureError;
      }),
      cleanupNativeRemote: vi.fn(async () => {}),
    });
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createGitRemoteFixture(deps);
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBe(configureError);
    expect(deps.cleanupNativeRemote).toHaveBeenCalledTimes(1);
    expect(deps.cleanupNativeRemote).toHaveBeenCalledWith(server);
    expect(caught?.cleanupDiagnostics).toBeUndefined();
  });

  it("configure fails, cleanup also fails: cleanup runs exactly once, the original Error remains the thrown object, cleanupDiagnostics contains the cleanup failure", async () => {
    const configureError = new Error("failed to write ssh-remote-command.env");
    const server = fakeServer();
    const deps = fakeDeps({
      startNativeRemote: vi.fn(async () => server),
      configureNativeSsh: vi.fn(() => {
        throw configureError;
      }),
      cleanupNativeRemote: vi.fn(async () => {
        throw new Error("sshd process refused to terminate");
      }),
    });
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createGitRemoteFixture(deps);
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBe(configureError);
    expect(caught?.message).toBe("failed to write ssh-remote-command.env");
    expect(deps.cleanupNativeRemote).toHaveBeenCalledTimes(1);
    expect(caught?.cleanupDiagnostics).toBeDefined();
    expect(caught?.cleanupDiagnostics?.some((d) => d.includes("sshd process refused to terminate"))).toBe(true);
  });

  it("configure throws a non-Error value: the result is an Error, the original value is preserved as cause, and cleanup is still attempted", async () => {
    const server = fakeServer();
    const deps = fakeDeps({
      startNativeRemote: vi.fn(async () => server),
      configureNativeSsh: vi.fn(() => {
        throw "a raw string failure";
      }),
      cleanupNativeRemote: vi.fn(async () => {}),
    });
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createGitRemoteFixture(deps);
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toBe("a raw string failure");
    expect(caught?.cause).toBe("a raw string failure");
    expect(deps.cleanupNativeRemote).toHaveBeenCalledTimes(1);
  });
});

// ── 7/8. Ready native fixture cleanup ────────────────────────────────────

describe("createGitRemoteFixture — native fixture cleanup mapping", () => {
  it("a successful cleanup maps to {ok: true, provider: 'native', errors: []}", async () => {
    const deps = fakeDeps({ cleanupNativeRemote: vi.fn(async () => {}) });
    const fixture = await createGitRemoteFixture(deps);
    await expect(fixture.cleanup()).resolves.toEqual<FixtureCleanupResult>({
      ok: true,
      provider: "native",
      errors: [],
    });
  });

  it("a thrown cleanup error maps to {ok: false, provider: 'native', errors: [message]} rather than propagating", async () => {
    const deps = fakeDeps({
      cleanupNativeRemote: vi.fn(async () => {
        throw new Error("sshd already exited");
      }),
    });
    const fixture = await createGitRemoteFixture(deps);
    const result = await fixture.cleanup();
    expect(result.ok).toBe(false);
    expect(result.provider).toBe("native");
    expect(result.errors).toEqual(["sshd already exited"]);
  });
});

// ── 9. No partially constructed fixture ──────────────────────────────────

describe("createGitRemoteFixture — no partial fixture on setup failure", () => {
  it("rejects rather than resolving with a half-initialized fixture when configure fails", async () => {
    const deps = fakeDeps({
      configureNativeSsh: vi.fn(() => {
        throw new Error("configure failed");
      }),
    });
    await expect(createGitRemoteFixture(deps)).rejects.toThrow("configure failed");
  });

  it("rejects rather than resolving when startNativeRemote itself fails, without calling configureNativeSsh", async () => {
    const startError = new Error("startRemote failed");
    const deps = fakeDeps({
      startNativeRemote: vi.fn(async () => {
        throw startError;
      }),
    });
    await expect(createGitRemoteFixture(deps)).rejects.toBe(startError);
    expect(deps.configureNativeSsh).not.toHaveBeenCalled();
    expect(deps.cleanupNativeRemote).not.toHaveBeenCalled();
  });
});

// ── Stage 3F.5.7: real resolver wiring (unset -> container, native override) ──

describe("createGitRemoteFixture — Stage 3F.5.7 default-provider wiring", () => {
  const ENV_KEY = "RIS_E2E_GIT_REMOTE_PROVIDER";
  let previousValue: string | undefined;

  beforeEach(() => {
    previousValue = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (previousValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previousValue;
    }
  });

  it("defaultCreateGitRemoteFixtureDeps.resolveProvider is the real resolveGitRemoteProvider (no reimplementation)", () => {
    expect(defaultCreateGitRemoteFixtureDeps.resolveProvider).toBe(resolveGitRemoteProvider);
  });

  it("chooses the container branch through the real resolver when the env var is unset", async () => {
    delete process.env[ENV_KEY];
    const handle = fakeContainerHandle();
    const deps = fakeDeps({
      resolveProvider: resolveGitRemoteProvider,
      createContainerFixture: vi.fn(async () => handle),
    });
    const fixture = await createGitRemoteFixture(deps);
    expect(deps.createContainerFixture).toHaveBeenCalledTimes(1);
    expect(deps.startNativeRemote).not.toHaveBeenCalled();
    expect(fixture).toBe(handle);
  });

  it("chooses the native branch through the real resolver when RIS_E2E_GIT_REMOTE_PROVIDER=native", async () => {
    process.env[ENV_KEY] = "native";
    const server = fakeServer();
    const deps = fakeDeps({
      resolveProvider: resolveGitRemoteProvider,
      startNativeRemote: vi.fn(async () => server),
    });
    const fixture = await createGitRemoteFixture(deps);
    expect(deps.startNativeRemote).toHaveBeenCalledTimes(1);
    expect(deps.createContainerFixture).not.toHaveBeenCalled();
    await fixture.createBareRemote("scenario1");
    expect(deps.createNativeBareRemote).toHaveBeenCalledWith(server.remotesParent, "scenario1");
  });
});

// ── 10. Correct native argument wiring ───────────────────────────────────

describe("createGitRemoteFixture — native argument wiring", () => {
  it("seedBareRemote and pushSimulatedRemoteCommit receive the correct arguments, with server.remotesParent only ever supplied by the adapter itself", async () => {
    const server = fakeServer({ remotesParent: "C:\\work\\remotes-xyz" });
    const deps = fakeDeps({ startNativeRemote: vi.fn(async () => server) });
    const fixture = await createGitRemoteFixture(deps);

    await fixture.seedBareRemote("C:\\seed-repo", "C:\\work\\remotes-xyz\\scenario1.git", "main");
    expect(deps.seedNativeBareRemote).toHaveBeenCalledWith(
      "C:\\seed-repo",
      "C:\\work\\remotes-xyz\\scenario1.git",
      "main",
    );

    // The spec-facing pushSimulatedRemoteCommit signature has no
    // remotesParent parameter at all (see GitRemoteFixture) — it is
    // supplied solely by the adapter, from the server it closed over.
    await fixture.pushSimulatedRemoteCommit("C:\\work\\remotes-xyz\\scenario1.git", "main", "f.txt", "message");
    expect(deps.pushSimulatedNativeRemoteCommit).toHaveBeenCalledWith(
      "C:\\work\\remotes-xyz\\scenario1.git",
      "C:\\work\\remotes-xyz",
      "main",
      "f.txt",
      "message",
    );
  });
});
