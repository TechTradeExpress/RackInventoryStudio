// @vitest-environment node
/**
 * Unit tests for container-git-remote.ts — the containerized Git-over-SSH
 * fixture infrastructure prepared in Stage 3F.5.4's proof of concept and
 * hardened in Stage 3F.5.4-R1 (transactional startup rollback, atomic
 * fixture initialization, content-addressed image caching, and the
 * lifecycle fault-injection coverage this file adds for all of it).
 *
 * Mirrors git-remote.test.ts's split: pure parsing/construction logic is
 * exercised directly and unconditionally (no WSL/Docker required, no
 * mocking of node:child_process needed — `selectDistribution` and friends
 * take their process-executing dependency as a plain injected function, the
 * same dependency-injection style securePrivateKeyFile/buildSshdConfig
 * already use in git-remote.ts). Every lifecycle function this stage's RP
 * added fault-injection coverage for (startContainerRemote,
 * cleanupContainerRemote, cleanupOrphanedContainers,
 * createContainerRemoteFixture, rollbackPartialContainerFixture,
 * ensureImageBuilt) is exercised the same way: real production code, fake
 * injected dependencies. Nothing in this file spawns wsl.exe or docker —
 * the real end-to-end path is covered separately, on a real
 * Windows+WSL2+Docker host, as this stage's own "Real Windows Validation"
 * report section, not here.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_LABEL,
  assertCleanupSucceeded,
  assertFixtureCleanupSucceeded,
  assertLinuxAbsolutePath,
  assertSafeIdentifier,
  buildCleanupArgs,
  buildContainerName,
  buildContainerSshRemoteUrl,
  buildDockerRunArgs,
  buildImageTag,
  classifyDockerError,
  classifyLinuxExecError,
  cleanupContainerRemote,
  cleanupOrphanedContainers,
  clearContainerSshConfig,
  computeCurrentFixtureImageTag,
  computeFixtureContentHash,
  createContainerHostBackend,
  createContainerRemoteFixture,
  decodeWslMetaOutput,
  ensureImageBuilt,
  execFileP,
  formatCleanupFailure,
  formatFixtureCleanupFailure,
  generateRunId,
  inspectContainerPresence,
  isCleanupSuccessful,
  isDockerCommandError,
  isDockerNotFoundError,
  isNodeErrorWithCode,
  isSafeIdentifier,
  parsePublishedPort,
  parseWslList,
  removeContainerViaDocker,
  removeContainerWorkDir,
  resolveContainerHostKind,
  resolveGitRemoteProvider,
  resolveWslDistroOverride,
  rollbackPartialContainerFixture,
  selectDistribution,
  shouldForceRebuild,
  spawnWithStdin,
  startContainerRemote,
  toFixtureCleanupResult,
  windowsPathToWslMountPath,
  type CleanupResult,
  type ContainerHostBackend,
  type ContainerOpsDeps,
  type ContainerPresence,
  type ContainerRemovalResult,
  type ContainerSshRemoteServer,
  type ErrorWithCleanupDiagnostics,
  type FixtureCleanupResult,
  type FixtureSourceFile,
  type PartialContainerFixtureState,
  type SshConfigRemovalResult,
  type WorkDirRemovalResult,
  type WslDistribution,
} from "./container-git-remote";

/** Builds a fake `DockerCommandError`-shaped rejection — duck-typed by
 * `isDockerCommandError` (`stderr: string`, `dockerArgs: string[]`), so
 * `inspectContainerPresence`'s classification can be exercised with no real
 * `execDocker`/WSL/Docker access. */
function fakeDockerError(stderr: string): Error {
  return Object.assign(new Error(`docker failed: ${stderr}`), {
    stderr,
    dockerArgs: ["inspect", "fake"],
    hostDescription: "Ubuntu",
    exitCode: 1,
  });
}

/**
 * A fully-stubbed `ContainerHostBackend` for tests that exercise shared
 * lifecycle logic (rollback, cleanup, startContainerRemote orchestration,
 * ...) without any real WSL/Docker access — mirrors `fakeDockerError`'s own
 * "duck-typed, no real process access" rationale. `execDocker`/
 * `execDockerWithStdin` default to rejecting (most lifecycle tests inject
 * their own `ContainerOpsDeps` methods instead of calling through the
 * backend directly), overridable per test via `overrides`.
 */
function fakeBackend(overrides: Partial<ContainerHostBackend> = {}): ContainerHostBackend {
  return {
    kind: "windows-wsl2",
    platform: "win32",
    describe: () => "fake backend (Ubuntu)",
    preflight: async () => ({ ok: true, detail: "fake backend (Ubuntu)" }),
    execDocker: async () => {
      throw new Error("fakeBackend.execDocker: not stubbed for this test");
    },
    execDockerWithStdin: async () => {
      throw new Error("fakeBackend.execDockerWithStdin: not stubbed for this test");
    },
    resolveBuildContext: async (hostPath) => hostPath,
    resolveBindSource: async (hostPath) => hostPath,
    startKeepAlive: () => {},
    stopKeepAlive: () => {},
    buildFailureHint: () => "(fake backend build failure hint)",
    ...overrides,
  };
}

// ── isSafeIdentifier / assertSafeIdentifier ──────────────────────────────────

describe("isSafeIdentifier", () => {
  it("accepts alphanumeric identifiers", () => {
    expect(isSafeIdentifier("Ubuntu")).toBe(true);
    expect(isSafeIdentifier("ris-e2e-git-ssh-abc123")).toBe(true);
    expect(isSafeIdentifier("scenario1")).toBe(true);
  });

  it("accepts dots, hyphens, underscores after the first character", () => {
    expect(isSafeIdentifier("a.b_c-d")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isSafeIdentifier("")).toBe(false);
  });

  it("rejects a leading dot/hyphen/underscore", () => {
    expect(isSafeIdentifier(".hidden")).toBe(false);
    expect(isSafeIdentifier("-flag")).toBe(false);
    expect(isSafeIdentifier("_x")).toBe(false);
  });

  it("rejects shell metacharacters", () => {
    for (const bad of ["a;b", "a$b", "a`b`", "a&b", "a|b", "a b", "a\nb", "a'b", '"a"', "a/b", "a\\b"]) {
      expect(isSafeIdentifier(bad)).toBe(false);
    }
  });

  it("rejects an identifier longer than 128 characters", () => {
    expect(isSafeIdentifier("a".repeat(129))).toBe(false);
    expect(isSafeIdentifier("a".repeat(128))).toBe(true);
  });
});

describe("assertSafeIdentifier", () => {
  it("returns the value unchanged when safe", () => {
    expect(assertSafeIdentifier("Ubuntu", "distro")).toBe("Ubuntu");
  });

  it("throws a descriptive error for an unsafe value", () => {
    expect(() => assertSafeIdentifier("a; rm -rf /", "distro")).toThrow(/unsafe distro/);
  });
});

// ── Naming / tagging ──────────────────────────────────────────────────────────

describe("generateRunId", () => {
  it("produces a safe identifier", () => {
    expect(isSafeIdentifier(generateRunId())).toBe(true);
  });

  it("produces distinct ids on successive calls", () => {
    const a = generateRunId();
    const b = generateRunId();
    expect(a).not.toBe(b);
  });
});

describe("buildContainerName", () => {
  it("prefixes the run id", () => {
    expect(buildContainerName("abc123")).toBe("ris-e2e-git-ssh-abc123");
  });

  it("rejects an unsafe run id", () => {
    expect(() => buildContainerName("abc 123")).toThrow(/unsafe run id/);
  });
});

describe("buildImageTag", () => {
  it("builds repository:tag", () => {
    expect(buildImageTag("dev")).toBe("ris-e2e-git-ssh-server:dev");
  });

  it("rejects an unsafe tag (would break the docker CLI argument)", () => {
    expect(() => buildImageTag("dev; rm -rf /")).toThrow(/unsafe image tag/);
  });
});

// ── Content-addressed image hashing (Stage 3F.5.4-R1) ───────────────────────

describe("computeFixtureContentHash", () => {
  const baseFiles = (): FixtureSourceFile[] => [
    { name: "Dockerfile", content: "FROM alpine:3.20.3" },
    { name: "entrypoint.sh", content: "#!/bin/bash\necho hi" },
    { name: "sshd_config", content: "Port 22" },
  ];

  it("is deterministic for the same files and order", () => {
    expect(computeFixtureContentHash(baseFiles())).toBe(computeFixtureContentHash(baseFiles()));
  });

  it("changes when Dockerfile content changes", () => {
    const files = baseFiles();
    const changed = baseFiles();
    changed[0] = { name: "Dockerfile", content: "FROM alpine:3.20.4" };
    expect(computeFixtureContentHash(files)).not.toBe(computeFixtureContentHash(changed));
  });

  it("changes when entrypoint.sh content changes", () => {
    const files = baseFiles();
    const changed = baseFiles();
    changed[1] = { name: "entrypoint.sh", content: "#!/bin/bash\necho bye" };
    expect(computeFixtureContentHash(files)).not.toBe(computeFixtureContentHash(changed));
  });

  it("changes when sshd_config content changes", () => {
    const files = baseFiles();
    const changed = baseFiles();
    changed[2] = { name: "sshd_config", content: "Port 2222" };
    expect(computeFixtureContentHash(files)).not.toBe(computeFixtureContentHash(changed));
  });

  it("does not collide across a shifted content boundary between two files with the same names", () => {
    // Naive content-only concatenation with no separators would hash
    // ["ab","c"] and ["a","bc"] identically — the name+NUL-delimited
    // design must not reproduce that ambiguity.
    const a = computeFixtureContentHash([
      { name: "x", content: "ab" },
      { name: "y", content: "c" },
    ]);
    const b = computeFixtureContentHash([
      { name: "x", content: "a" },
      { name: "y", content: "bc" },
    ]);
    expect(a).not.toBe(b);
  });

  it("does not collide when content shifts across the Dockerfile/entrypoint.sh boundary", () => {
    const a = computeFixtureContentHash([
      { name: "Dockerfile", content: "FROM alpine" },
      { name: "entrypoint.sh", content: ":3.20.3" },
    ]);
    const b = computeFixtureContentHash([
      { name: "Dockerfile", content: "FROM alpine:3.20.3" },
      { name: "entrypoint.sh", content: "" },
    ]);
    expect(a).not.toBe(b);
  });

  it("returns a 12-character lowercase hex string", () => {
    expect(computeFixtureContentHash(baseFiles())).toMatch(/^[0-9a-f]{12}$/);
  });

  it("produces a value that is a valid, safe image tag", () => {
    const hash = computeFixtureContentHash(baseFiles());
    expect(() => buildImageTag(hash)).not.toThrow();
    expect(buildImageTag(hash)).toBe(`ris-e2e-git-ssh-server:${hash}`);
  });
});

describe("computeCurrentFixtureImageTag", () => {
  it("builds ris-e2e-git-ssh-server:<hash> from the given source files", () => {
    const files: FixtureSourceFile[] = [
      { name: "Dockerfile", content: "FROM alpine:3.20.3" },
      { name: "entrypoint.sh", content: "#!/bin/bash" },
      { name: "sshd_config", content: "Port 22" },
    ];
    const expectedHash = computeFixtureContentHash(files);
    expect(computeCurrentFixtureImageTag(files)).toBe(`ris-e2e-git-ssh-server:${expectedHash}`);
  });
});

describe("ensureImageBuilt", () => {
  const sampleFiles: FixtureSourceFile[] = [
    { name: "Dockerfile", content: "FROM alpine:3.20.3" },
    { name: "entrypoint.sh", content: "#!/bin/bash" },
    { name: "sshd_config", content: "Port 22" },
  ];
  const fakeBuildContext = "/mnt/c/fake/fixture/dir";
  const backend = fakeBackend();

  it("reuses an existing image when the exact content-hash tag already exists (does not rebuild)", async () => {
    const expectedTag = computeCurrentFixtureImageTag(sampleFiles);
    const imageExists = vi.fn(async (_backend: ContainerHostBackend, tag: string) => tag === expectedTag);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt(backend, false, sampleFiles, {
      imageExists,
      buildImage,
      resolveBuildContext: async () => fakeBuildContext,
    });
    expect(tag).toBe(expectedTag);
    expect(buildImage).not.toHaveBeenCalled();
  });

  it("builds when no image with the exact content-hash tag exists", async () => {
    const imageExists = vi.fn(async () => false);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt(backend, false, sampleFiles, {
      imageExists,
      buildImage,
      resolveBuildContext: async () => fakeBuildContext,
    });
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(buildImage).toHaveBeenCalledWith(backend, tag, fakeBuildContext, expect.any(String));
  });

  it("an existing old-hash tag does not satisfy a new source hash — a build still runs for the new tag", async () => {
    const oldTag = "ris-e2e-git-ssh-server:aaaaaaaaaaaa";
    const imageExists = vi.fn(async (_backend: ContainerHostBackend, tag: string) => tag === oldTag);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt(backend, false, sampleFiles, {
      imageExists,
      buildImage,
      resolveBuildContext: async () => fakeBuildContext,
    });
    expect(tag).not.toBe(oldTag);
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(buildImage).toHaveBeenCalledWith(backend, tag, fakeBuildContext, expect.any(String));
  });

  it("forced rebuild rebuilds the exact same content-hash tag even when it already exists", async () => {
    const expectedTag = computeCurrentFixtureImageTag(sampleFiles);
    const imageExists = vi.fn(async () => true);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt(backend, true, sampleFiles, {
      imageExists,
      buildImage,
      resolveBuildContext: async () => fakeBuildContext,
    });
    expect(tag).toBe(expectedTag);
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(imageExists).not.toHaveBeenCalled();
  });

  it("propagates a build failure with a diagnostic message, preserving the underlying error as cause", async () => {
    const underlying = new Error("docker build exploded");
    const imageExists = vi.fn(async () => false);
    const buildImage = vi.fn(async () => {
      throw underlying;
    });
    await expect(
      ensureImageBuilt(backend, false, sampleFiles, { imageExists, buildImage, resolveBuildContext: async () => fakeBuildContext }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("docker build exploded"),
      cause: underlying,
    });
  });

  it("Stage 3F.5.7-R1: a build failure (prerequisite/config class) retains the original diagnostic and includes the native-fallback hint", async () => {
    const underlying = new Error("docker build exploded");
    const imageExists = vi.fn(async () => false);
    const buildImage = vi.fn(async () => {
      throw underlying;
    });
    await expect(
      ensureImageBuilt(backend, false, sampleFiles, { imageExists, buildImage, resolveBuildContext: async () => fakeBuildContext }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/docker build exploded/),
    });
    await expect(
      ensureImageBuilt(backend, false, sampleFiles, { imageExists, buildImage, resolveBuildContext: async () => fakeBuildContext }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/supported on Windows through WSL2 Docker.*RIS_E2E_GIT_REMOTE_PROVIDER=native/s),
    });
  });
});

// ── Stage 3F.5.7-R1: withNativeFallbackHint classification ──────────────────
//
// Representative coverage across the shared helper's classification
// decision, not every call site (per this stage's own scope note):
// prerequisite/configuration failures get the hint, an internal fixture
// invariant failure (published-port parsing) deliberately does not.

describe("withNativeFallbackHint classification", () => {
  it("no WSL distributions installed (prerequisite): retains original diagnostic and includes the hint", async () => {
    await expect(selectDistribution([], async () => ({ available: true }))).rejects.toThrow(
      /no WSL distributions are installed/,
    );
    await expect(selectDistribution([], async () => ({ available: true }))).rejects.toThrow(
      /supported on Windows through WSL2 Docker.*RIS_E2E_GIT_REMOTE_PROVIDER=native/s,
    );
  });

  it("selected WSL distribution without Docker (prerequisite, explicit override): retains original diagnostic and includes the hint", async () => {
    const wsl2Ubuntu: WslDistribution = { name: "Ubuntu", state: "Running", version: 2, isDefault: true };
    const checkDocker = async () => ({ available: false, diagnostic: "Docker daemon is not running" });
    await expect(selectDistribution([wsl2Ubuntu], checkDocker, "Ubuntu")).rejects.toThrow(
      /Docker is not available in WSL distribution "Ubuntu": Docker daemon is not running/,
    );
    await expect(selectDistribution([wsl2Ubuntu], checkDocker, "Ubuntu")).rejects.toThrow(
      /supported on Windows through WSL2 Docker.*RIS_E2E_GIT_REMOTE_PROVIDER=native/s,
    );
  });

  // The published-port-parse-failure (internal fixture invariant) case is
  // covered in the "startContainerRemote (fault injection, no real
  // WSL/Docker)" describe block below, reusing its own fakeDeps/withRunRoot
  // helpers rather than re-injecting ContainerOpsDeps here — see "scenario
  // 1" there for the hint-absence assertions.
});

// ── Windows path -> WSL mount path ────────────────────────────────────────────

describe("windowsPathToWslMountPath", () => {
  it("converts a C: drive path, lowercasing the drive letter", () => {
    expect(windowsPathToWslMountPath("C:\\ris\\RackInventoryStudio")).toBe("/mnt/c/ris/RackInventoryStudio");
  });

  it("converts forward-slash separators too", () => {
    expect(windowsPathToWslMountPath("C:/ris/RackInventoryStudio")).toBe("/mnt/c/ris/RackInventoryStudio");
  });

  it("preserves spaces in path segments", () => {
    expect(windowsPathToWslMountPath("D:\\Program Files\\thing")).toBe("/mnt/d/Program Files/thing");
  });

  it("lowercases an already-lowercase or uppercase drive letter consistently", () => {
    expect(windowsPathToWslMountPath("d:\\x")).toBe("/mnt/d/x");
  });

  it("throws for a non-drive-absolute path", () => {
    expect(() => windowsPathToWslMountPath("relative\\path")).toThrow(/cannot convert/);
    expect(() => windowsPathToWslMountPath("/already/posix")).toThrow(/cannot convert/);
  });
});

// ── wsl.exe meta-output decoding (resilient detection — Stage 3F.5.4-R1) ────

describe("decodeWslMetaOutput", () => {
  it("decodes UTF-16LE bytes with a BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ubuntu", "utf16le")]);
    expect(decodeWslMetaOutput(withBom)).toBe("Ubuntu");
  });

  it("decodes UTF-16LE bytes without a BOM, via NUL-density detection", () => {
    const noBom = Buffer.from("Ubuntu\r\n", "utf16le");
    expect(decodeWslMetaOutput(noBom)).toBe("Ubuntu\r\n");
  });

  it("decodes plain UTF-8 text unchanged (no false-positive UTF-16LE detection)", () => {
    const utf8 = Buffer.from("  NAME             STATE           VERSION\r\n* Ubuntu           Stopped         2\r\n", "utf8");
    expect(decodeWslMetaOutput(utf8)).toBe(utf8.toString("utf8"));
  });

  it("handles an empty buffer without throwing", () => {
    expect(decodeWslMetaOutput(Buffer.alloc(0))).toBe("");
  });

  it("decodes a non-ASCII (Latin-1 range) distro name in UTF-16LE", () => {
    const name = "Ubuntu-café";
    const buffer = Buffer.from(name, "utf16le");
    expect(decodeWslMetaOutput(buffer)).toBe(name);
  });

  it("does not misclassify short UTF-8 text containing no NUL bytes as UTF-16LE", () => {
    const utf8 = Buffer.from("Ubuntu", "utf8");
    // A correct UTF-8 decode of ASCII "Ubuntu" bytes must round-trip
    // unchanged; a wrong UTF-16LE decode would corrupt it.
    expect(decodeWslMetaOutput(utf8)).toBe("Ubuntu");
  });
});

// ── wsl --list --verbose parsing ─────────────────────────────────────────────

describe("parseWslList", () => {
  it("parses a standard table with a default-distro marker", () => {
    const raw = "  NAME             STATE           VERSION\r\n" + "* Ubuntu           Stopped         2\r\n";
    expect(parseWslList(raw)).toEqual<WslDistribution[]>([
      { name: "Ubuntu", state: "Stopped", version: 2, isDefault: true },
    ]);
  });

  it("parses multiple rows and only marks the starred one as default", () => {
    const raw =
      "  NAME             STATE           VERSION\r\n" +
      "  Debian           Running         1\r\n" +
      "* Ubuntu           Stopped         2\r\n";
    expect(parseWslList(raw)).toEqual<WslDistribution[]>([
      { name: "Debian", state: "Running", version: 1, isDefault: false },
      { name: "Ubuntu", state: "Stopped", version: 2, isDefault: true },
    ]);
  });

  it("handles a multi-word state value", () => {
    const raw = "  NAME    STATE            VERSION\r\n" + "  Foo     Installing...    2\r\n";
    expect(parseWslList(raw)[0]).toEqual({ name: "Foo", state: "Installing...", version: 2, isDefault: false });
  });

  it("ignores blank lines", () => {
    const raw = "  NAME  STATE  VERSION\r\n\r\n* Ubuntu Stopped 2\r\n\r\n";
    expect(parseWslList(raw)).toHaveLength(1);
  });

  it("returns an empty array when there are no distributions installed", () => {
    expect(parseWslList("  NAME  STATE  VERSION\r\n")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseWslList("")).toEqual([]);
  });

  it("ignores a malformed row with too few columns", () => {
    const raw = "  NAME  STATE  VERSION\r\n  OnlyOneColumn\r\n* Ubuntu Stopped 2\r\n";
    expect(parseWslList(raw)).toEqual([{ name: "Ubuntu", state: "Stopped", version: 2, isDefault: true }]);
  });
});

// ── Docker error classification ──────────────────────────────────────────────

describe("classifyDockerError", () => {
  it("recognizes a stopped daemon", () => {
    expect(classifyDockerError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock")).toBe(
      "Docker daemon is not running",
    );
  });

  it("recognizes a permissions problem", () => {
    expect(classifyDockerError("permission denied while trying to connect")).toBe(
      "current user lacks Docker permissions (not in the docker group)",
    );
  });

  it("recognizes a missing docker CLI", () => {
    expect(classifyDockerError("docker: command not found")).toBe("Docker CLI is not installed");
  });

  it("falls back to a generic diagnostic for an unrecognized error", () => {
    expect(classifyDockerError("some completely different error")).toBe("unknown Docker error");
  });
});

// ── Docker not-found classification (tri-state presence — Stage 3F.5.4-R2) ──

describe("isDockerNotFoundError", () => {
  it("recognizes the lowercase 'error: no such object: <name>' shape (docker inspect, Docker 29.x)", () => {
    expect(isDockerNotFoundError("error: no such object: ris-e2e-git-ssh-abc123")).toBe(true);
  });

  it("recognizes the 'Error response from daemon: No such container: <name>' shape (docker rm/port)", () => {
    expect(isDockerNotFoundError("Error response from daemon: No such container: ris-e2e-git-ssh-abc123")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isDockerNotFoundError("ERROR: NO SUCH OBJECT: x")).toBe(true);
  });

  it("does not recognize a daemon-unavailable error as not-found", () => {
    expect(
      isDockerNotFoundError(
        "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
      ),
    ).toBe(false);
  });

  it("does not recognize a permission-denied error as not-found", () => {
    expect(isDockerNotFoundError("permission denied while trying to connect to the Docker daemon socket")).toBe(false);
  });

  it("does not recognize a missing docker CLI as not-found", () => {
    expect(isDockerNotFoundError("docker: command not found")).toBe(false);
  });

  it("does not recognize a WSL-unavailable error as not-found", () => {
    expect(isDockerNotFoundError("Wsl/Service/CreateInstance/CreateVm/HCS/HCS_E_SERVICE_NOT_AVAILABLE")).toBe(false);
  });

  it("does not recognize a generic unrelated 'not found' as container not-found", () => {
    expect(isDockerNotFoundError("bash: some-script.sh: not found")).toBe(false);
    expect(isDockerNotFoundError("open /some/file: file not found")).toBe(false);
  });

  it("does not recognize empty stderr as not-found", () => {
    expect(isDockerNotFoundError("")).toBe(false);
  });
});

describe("inspectContainerPresence", () => {
  const backend = fakeBackend();

  it("is 'present' when docker inspect succeeds", async () => {
    const dockerInspect = vi.fn(async () => ({ stdout: "[{}]", stderr: "" }));
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence).toEqual<ContainerPresence>({ status: "present" });
  });

  it("is 'absent' for docker's exact 'no such object' not-found result", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("error: no such object: c1");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence).toEqual<ContainerPresence>({ status: "absent" });
  });

  it("is 'absent' for docker's exact 'no such container' not-found result", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("Error response from daemon: No such container: c1");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence).toEqual<ContainerPresence>({ status: "absent" });
  });

  it("is 'unknown' when the Docker daemon is unavailable — never misread as absent", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("is 'unknown' when WSL itself is unavailable — never misread as absent", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("Wsl/Service/CreateInstance/HCS_E_SERVICE_NOT_AVAILABLE");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("is 'unknown' on permission denied — never misread as absent", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("permission denied while trying to connect to the Docker daemon socket");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("is 'unknown' when the docker CLI itself is missing — never misread as absent", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("docker: command not found");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("is 'unknown' for a generic 'not found' unrelated to the container itself — never misread as absent", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("bash: some-script.sh: not found");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("preserves the underlying diagnostic on an 'unknown' result", async () => {
    const dockerInspect = vi.fn(async () => {
      throw fakeDockerError("Cannot connect to the Docker daemon");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status === "unknown" && presence.error).toContain("Cannot connect to the Docker daemon");
  });

  it("is 'unknown' for a non-DockerCommandError-shaped rejection (defensive: never assume absence from a malformed error)", async () => {
    const dockerInspect = vi.fn(async () => {
      throw new Error("some other kind of failure with no .stderr");
    });
    const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
    expect(presence.status).toBe("unknown");
  });

  it("no 'unknown' result ever produces status 'absent' (containerVerifiedAbsent must never be inferred from it)", async () => {
    const stderrs = [
      "Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
      "permission denied while trying to connect to the Docker daemon socket",
      "docker: command not found",
      "Wsl/Service/CreateInstance/HCS_E_SERVICE_NOT_AVAILABLE",
      "bash: some-script.sh: not found",
    ];
    for (const stderr of stderrs) {
      const dockerInspect = vi.fn(async () => {
        throw fakeDockerError(stderr);
      });
      const presence = await inspectContainerPresence(backend, "c1", dockerInspect);
      expect(presence.status).not.toBe("absent");
    }
  });
});

// ── WSL distribution selection (dependency-injected Docker check) ───────────

describe("selectDistribution", () => {
  const wsl2Ubuntu: WslDistribution = { name: "Ubuntu", state: "Running", version: 2, isDefault: true };
  const wsl2Debian: WslDistribution = { name: "Debian", state: "Running", version: 2, isDefault: false };
  const wsl1Legacy: WslDistribution = { name: "LegacyWsl1", state: "Stopped", version: 1, isDefault: false };

  it("picks the first WSL2 distribution with working Docker, in list order", async () => {
    const checked: string[] = [];
    const checkDocker = async (distro: string) => {
      checked.push(distro);
      return { available: true };
    };
    const result = await selectDistribution([wsl2Ubuntu, wsl2Debian], checkDocker);
    expect(result.distro).toBe("Ubuntu");
    expect(checked).toEqual(["Ubuntu"]);
  });

  it("skips a WSL2 distribution without working Docker and tries the next", async () => {
    const checkDocker = async (distro: string) =>
      distro === "Ubuntu" ? { available: false, diagnostic: "Docker daemon is not running" } : { available: true };
    const result = await selectDistribution([wsl2Ubuntu, wsl2Debian], checkDocker);
    expect(result.distro).toBe("Debian");
    expect(result.diagnostics).toEqual([
      { distro: "Ubuntu", available: false, diagnostic: "Docker daemon is not running" },
      { distro: "Debian", available: true },
    ]);
  });

  it("filters out WSL1 distributions entirely", async () => {
    const checked: string[] = [];
    const checkDocker = async (distro: string) => {
      checked.push(distro);
      return { available: true };
    };
    await selectDistribution([wsl1Legacy, wsl2Ubuntu], checkDocker);
    expect(checked).toEqual(["Ubuntu"]);
  });

  it("throws when no WSL distributions are installed at all", async () => {
    await expect(selectDistribution([], async () => ({ available: true }))).rejects.toThrow(
      /no WSL distributions are installed/,
    );
  });

  it("throws a precise diagnostic when only WSL1 distributions exist", async () => {
    await expect(selectDistribution([wsl1Legacy], async () => ({ available: true }))).rejects.toThrow(
      /only WSL1 distribution\(s\) found \(LegacyWsl1\)/,
    );
  });

  it("throws when every WSL2 distribution lacks working Docker, listing each diagnostic", async () => {
    const checkDocker = async () => ({ available: false, diagnostic: "Docker CLI is not installed" });
    await expect(selectDistribution([wsl2Ubuntu, wsl2Debian], checkDocker)).rejects.toThrow(
      /no WSL2 distribution has a working Docker Engine.*Ubuntu \(Docker CLI is not installed\).*Debian/,
    );
  });

  it("uses an explicit override directly, without enumerating other distributions", async () => {
    const checked: string[] = [];
    const checkDocker = async (distro: string) => {
      checked.push(distro);
      return { available: true };
    };
    const result = await selectDistribution([wsl2Ubuntu, wsl2Debian], checkDocker, "Debian");
    expect(result.distro).toBe("Debian");
    expect(checked).toEqual(["Debian"]);
  });

  it("throws when the override names a distribution that isn't installed", async () => {
    await expect(selectDistribution([wsl2Ubuntu], async () => ({ available: true }), "NoSuchDistro")).rejects.toThrow(
      /RIS_E2E_WSL_DISTRO="NoSuchDistro" is not an installed WSL distribution/,
    );
  });

  it("throws when the override names a WSL1 distribution", async () => {
    await expect(
      selectDistribution([wsl1Legacy], async () => ({ available: true }), "LegacyWsl1"),
    ).rejects.toThrow(/is WSL1, not WSL2/);
  });

  it("throws when the override's Docker is unavailable, without falling back to another distribution", async () => {
    const checkDocker = async () => ({ available: false, diagnostic: "Docker daemon is not running" });
    await expect(
      selectDistribution([wsl2Ubuntu, wsl2Debian], checkDocker, "Ubuntu"),
    ).rejects.toThrow(/Docker is not available in WSL distribution "Ubuntu": Docker daemon is not running/);
  });
});

// ── Environment overrides ────────────────────────────────────────────────────

describe("resolveWslDistroOverride", () => {
  it("returns null when unset", () => {
    expect(resolveWslDistroOverride({})).toBeNull();
  });

  it("returns null for an empty/whitespace-only value", () => {
    expect(resolveWslDistroOverride({ RIS_E2E_WSL_DISTRO: "" })).toBeNull();
    expect(resolveWslDistroOverride({ RIS_E2E_WSL_DISTRO: "   " })).toBeNull();
  });

  it("returns the trimmed value when set", () => {
    expect(resolveWslDistroOverride({ RIS_E2E_WSL_DISTRO: "  Ubuntu-22.04  " })).toBe("Ubuntu-22.04");
  });
});

describe("resolveGitRemoteProvider", () => {
  // ── Stage 3F.5.7-R1: platform-aware unset/empty default ────────────────────
  // The container backend is Windows-specific (wsl.exe, WSL distribution
  // discovery, Docker-through-WSL2, /mnt/<drive> path translation) — it
  // cannot run natively on Linux/macOS. So the unset/empty default is
  // "container" only on win32; every other platform still defaults to
  // "native" until Stage 3F.5.8 implements direct Linux Docker execution.
  // Platform is always passed explicitly here (never left to the real
  // process.platform) so these cases are deterministic on every CI/dev host.

  it("1. unset + win32 -> container", () => {
    expect(resolveGitRemoteProvider({}, "win32")).toBe("container");
  });

  it("2. empty string + win32 -> container", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "" }, "win32")).toBe("container");
  });

  it("3. unset + linux -> native", () => {
    expect(resolveGitRemoteProvider({}, "linux")).toBe("native");
  });

  it("4. empty string + linux -> native", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "" }, "linux")).toBe("native");
  });

  it("5. unset + darwin -> native", () => {
    expect(resolveGitRemoteProvider({}, "darwin")).toBe("native");
  });

  it("6. explicit container + win32 -> container", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "container" }, "win32")).toBe("container");
  });

  it("7. explicit container + linux -> container", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "container" }, "linux")).toBe("container");
  });

  it("8. explicit native + win32 -> native", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "native" }, "win32")).toBe("native");
  });

  it("9. explicit native + linux -> native", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "native" }, "linux")).toBe("native");
  });

  it("10. invalid value + win32 -> throws the existing invalid-value error", () => {
    expect(() => resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "docker" }, "win32")).toThrow(
      /invalid RIS_E2E_GIT_REMOTE_PROVIDER="docker" — expected "native" or "container"/,
    );
  });

  it("11. invalid value + linux -> throws the same error", () => {
    expect(() => resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "docker" }, "linux")).toThrow(
      /invalid RIS_E2E_GIT_REMOTE_PROVIDER="docker" — expected "native" or "container"/,
    );
  });

  it("12. existing case-sensitive behavior is unchanged: 'Container' remains invalid", () => {
    expect(() => resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "Container" }, "win32")).toThrow(
      /invalid RIS_E2E_GIT_REMOTE_PROVIDER="Container"/,
    );
  });

  it("13. existing non-trim behavior is unchanged: ' native' remains invalid", () => {
    expect(() => resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: " native" }, "win32")).toThrow(
      /invalid RIS_E2E_GIT_REMOTE_PROVIDER=" native"/,
    );
  });

  describe("production zero-argument call (real process.env and process.platform)", () => {
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

    // Deliberately does not mock/mutate process.platform (per this stage's
    // own requirement) — it asserts against whatever the actual host is,
    // so this test is meaningful and deterministic on both Windows and
    // Linux CI/dev hosts.
    it("resolves against the real host platform when the env var is deleted", () => {
      delete process.env[ENV_KEY];
      const expected = process.platform === "win32" ? "container" : "native";
      expect(resolveGitRemoteProvider()).toBe(expected);
    });

    it("resolves to native when the real env var is explicitly set, on any platform", () => {
      process.env[ENV_KEY] = "native";
      expect(resolveGitRemoteProvider()).toBe("native");
    });

    it("resolves to container when the real env var is explicitly set, on any platform", () => {
      process.env[ENV_KEY] = "container";
      expect(resolveGitRemoteProvider()).toBe("container");
    });
  });
});

describe("shouldForceRebuild", () => {
  it("is false by default", () => {
    expect(shouldForceRebuild({})).toBe(false);
  });

  it("is true only for exactly '1'", () => {
    expect(shouldForceRebuild({ RIS_E2E_CONTAINER_REBUILD: "1" })).toBe(true);
    expect(shouldForceRebuild({ RIS_E2E_CONTAINER_REBUILD: "true" })).toBe(false);
    expect(shouldForceRebuild({ RIS_E2E_CONTAINER_REBUILD: "0" })).toBe(false);
  });
});

// ── Docker argument construction ─────────────────────────────────────────────

describe("buildDockerRunArgs", () => {
  it("builds the full run argument array, publishing to a random 127.0.0.1 port", () => {
    const args = buildDockerRunArgs({
      containerName: "ris-e2e-git-ssh-abc123",
      imageTag: "ris-e2e-git-ssh-server:dev",
      runId: "abc123",
    });
    expect(args).toEqual([
      "run",
      "-d",
      "--name",
      "ris-e2e-git-ssh-abc123",
      "--label",
      FIXTURE_LABEL,
      "--label",
      "ris.e2e.run=abc123",
      "--security-opt",
      "no-new-privileges",
      "-p",
      "127.0.0.1::22",
      "ris-e2e-git-ssh-server:dev",
    ]);
  });

  it("never includes --rm (container must survive for post-mortem diagnostics)", () => {
    const args = buildDockerRunArgs({ containerName: "c", imageTag: "t", runId: "r" });
    expect(args).not.toContain("--rm");
  });

  it("never publishes to a fixed port like 22/2222/22222", () => {
    const args = buildDockerRunArgs({ containerName: "c", imageTag: "t", runId: "r" });
    const publishIndex = args.indexOf("-p");
    expect(args[publishIndex + 1]).toBe("127.0.0.1::22");
    expect(args[publishIndex + 1]).not.toMatch(/^127\.0\.0\.1:(22|2222|22222):22$/);
  });

  it("rejects an unsafe container name before it reaches argv", () => {
    expect(() => buildDockerRunArgs({ containerName: "c;rm -rf /", imageTag: "t", runId: "r" })).toThrow(
      /unsafe container name/,
    );
  });
});

describe("buildCleanupArgs", () => {
  it("always filters by the fixture label", () => {
    expect(buildCleanupArgs()).toEqual(["ps", "-aq", "--filter", `label=${FIXTURE_LABEL}`]);
  });

  it("adds a run-id filter when given, on top of the fixture-label filter", () => {
    expect(buildCleanupArgs("abc123")).toEqual([
      "ps",
      "-aq",
      "--filter",
      `label=${FIXTURE_LABEL}`,
      "--filter",
      "label=ris.e2e.run=abc123",
    ]);
  });

  it("rejects an unsafe run id", () => {
    expect(() => buildCleanupArgs("abc; rm -rf /")).toThrow(/unsafe run id/);
  });
});

describe("parsePublishedPort", () => {
  it("parses a standard docker port mapping line", () => {
    expect(parsePublishedPort("22/tcp -> 127.0.0.1:32768")).toBe(32768);
  });

  it("parses when the mapping is one of several lines", () => {
    expect(parsePublishedPort("80/tcp -> 0.0.0.0:8080\n22/tcp -> 127.0.0.1:41000\n")).toBe(41000);
  });

  it("returns null when there is no 127.0.0.1 mapping", () => {
    expect(parsePublishedPort("22/tcp -> 0.0.0.0:32768")).toBeNull();
  });

  it("returns null for empty output", () => {
    expect(parsePublishedPort("")).toBeNull();
  });
});

describe("buildContainerSshRemoteUrl", () => {
  it("builds the SCP-like remote URL with the fixed git username", () => {
    expect(buildContainerSshRemoteUrl("/home/git/repos/scenario1-abc123.git")).toBe(
      "git@127.0.0.1:/home/git/repos/scenario1-abc123.git",
    );
  });
});

// ── rollbackPartialContainerFixture (Stage 3F.5.4-R1) ────────────────────────

describe("rollbackPartialContainerFixture", () => {
  function fakeDeps(overrides: Partial<ContainerOpsDeps> = {}) {
    const calls: string[] = [];
    let presenceCallCount = 0;
    const backend = fakeBackend({
      describe: () => "Ubuntu",
      stopKeepAlive: vi.fn(() => {
        calls.push("stopKeepAlive()");
      }),
    });
    const deps: Pick<
      ContainerOpsDeps,
      "collectDiagnostics" | "removeContainer" | "inspectContainerPresence" | "removeWorkDir" | "clearSshConfig"
    > = {
      collectDiagnostics: vi.fn(async (backendArg: ContainerHostBackend, name: string) => {
        calls.push(`collectDiagnostics(${backendArg.describe()},${name})`);
        return "fake diagnostics";
      }),
      removeContainer: vi.fn(async (backendArg: ContainerHostBackend, name: string): Promise<ContainerRemovalResult> => {
        calls.push(`removeContainer(${backendArg.describe()},${name})`);
        return "removed";
      }),
      // Default: genuinely present before rollback, genuinely gone after —
      // the realistic shape a successful removeContainer call produces.
      // Tests needing a different shape (unknown/still-present) override
      // this explicitly.
      inspectContainerPresence: vi.fn(async (backendArg: ContainerHostBackend, name: string): Promise<ContainerPresence> => {
        presenceCallCount++;
        calls.push(`inspectContainerPresence(${backendArg.describe()},${name})`);
        return presenceCallCount === 1 ? { status: "present" } : { status: "absent" };
      }),
      removeWorkDir: vi.fn(async (workDir: string): Promise<WorkDirRemovalResult> => {
        calls.push(`removeWorkDir(${workDir})`);
        return "removed";
      }),
      clearSshConfig: vi.fn((): SshConfigRemovalResult => {
        calls.push("clearSshConfig()");
        return "removed";
      }),
      ...overrides,
    };
    return { deps, calls, backend };
  }

  it("is safe (no-op) when the state is entirely empty", async () => {
    const { deps } = fakeDeps();
    const diagnostics = await rollbackPartialContainerFixture({}, deps);
    expect(diagnostics).toEqual([]);
    expect(deps.removeContainer).not.toHaveBeenCalled();
    expect(deps.removeWorkDir).not.toHaveBeenCalled();
  });

  it("is safe when there is no container (skips diagnostics/presence-check/removeContainer, still handles the rest)", async () => {
    const { deps, calls, backend } = fakeDeps();
    const state: PartialContainerFixtureState = { workDir: "/work/dir", backend, keepAliveStarted: true };
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.collectDiagnostics).not.toHaveBeenCalled();
    expect(deps.inspectContainerPresence).not.toHaveBeenCalled();
    expect(deps.removeContainer).not.toHaveBeenCalled();
    expect(calls).toEqual(["removeWorkDir(/work/dir)", "stopKeepAlive()"]);
  });

  it("does not stop the keep-alive when it was never started", async () => {
    const { deps, calls, backend } = fakeDeps();
    const state: PartialContainerFixtureState = { workDir: "/work/dir", backend };
    await rollbackPartialContainerFixture(state, deps);
    expect(calls).toEqual(["removeWorkDir(/work/dir)"]);
  });

  it("is safe when there is no work directory (skips removeWorkDir, still handles the rest)", async () => {
    const { deps, calls, backend } = fakeDeps();
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.removeWorkDir).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "collectDiagnostics(Ubuntu,c1)",
      "inspectContainerPresence(Ubuntu,c1)",
      "removeContainer(Ubuntu,c1)",
      "inspectContainerPresence(Ubuntu,c1)",
      "stopKeepAlive()",
    ]);
  });

  it("follows the documented order: diagnostics -> presence check -> remove container -> verify -> remove workDir -> clear ssh config -> stop keep-alive last", async () => {
    const { deps, calls, backend } = fakeDeps();
    const state: PartialContainerFixtureState = {
      backend,
      containerName: "c1",
      workDir: "/work/dir",
      keepAliveStarted: true,
      sshConfigCreated: true,
    };
    await rollbackPartialContainerFixture(state, deps);
    expect(calls).toEqual([
      "collectDiagnostics(Ubuntu,c1)",
      "inspectContainerPresence(Ubuntu,c1)",
      "removeContainer(Ubuntu,c1)",
      "inspectContainerPresence(Ubuntu,c1)",
      "removeWorkDir(/work/dir)",
      "clearSshConfig()",
      "stopKeepAlive()",
    ]);
  });

  it("skips the removal attempt entirely when the container is already confirmed absent before rollback (idempotency)", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "absent" })),
    });
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(deps.removeContainer).not.toHaveBeenCalled();
    // Only the initial check — it already proved absence, so no final
    // re-check is needed.
    expect(deps.inspectContainerPresence).toHaveBeenCalledTimes(1);
    // The pre-rollback diagnostics snapshot is always collected regardless
    // of presence — only the *removal-attempt* is skipped for a
    // confirmed-absent container.
    expect(diagnostics.some((d) => d.includes("still present"))).toBe(false);
    expect(diagnostics.some((d) => d.includes("could not be"))).toBe(false);
  });

  it("still attempts a safe removal when presence is unknown (a failed inspection proves nothing, and the name is unique to this run)", async () => {
    let call = 0;
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => {
        call++;
        return call === 1 ? { status: "unknown", error: "daemon unavailable" } : { status: "absent" };
      }),
    });
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(deps.removeContainer).toHaveBeenCalledTimes(1);
    expect(diagnostics.some((d) => d.includes("could not be determined before rollback"))).toBe(true);
  });

  it("does not convert a generic final-inspection failure into confirmed absence", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(
        async (): Promise<ContainerPresence> => ({ status: "unknown", error: "wsl.exe timed out" }),
      ),
    });
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("could not be verified after rollback"))).toBe(true);
  });

  it("records a diagnostic when the container is still present after the rollback removal attempt", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "present" })),
    });
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("still present after rollback removal attempt"))).toBe(true);
  });

  it("still stops the keep-alive even when every earlier step fails", async () => {
    const { deps, backend } = fakeDeps({
      collectDiagnostics: vi.fn(async () => {
        throw new Error("diag failed");
      }),
      removeContainer: vi.fn(async () => {
        throw new Error("rm failed");
      }),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
      clearSshConfig: vi.fn(() => {
        throw new Error("clear failed");
      }),
    });
    const state: PartialContainerFixtureState = {
      backend,
      containerName: "c1",
      workDir: "/work/dir",
      keepAliveStarted: true,
      sshConfigCreated: true,
    };
    await rollbackPartialContainerFixture(state, deps);
    expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it("collects every step failure into the returned diagnostics array, without throwing", async () => {
    const { deps, backend } = fakeDeps({
      removeContainer: vi.fn(async () => {
        throw new Error("docker rm -f failed");
      }),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
    });
    const state: PartialContainerFixtureState = {
      backend,
      containerName: "c1",
      workDir: "/work/dir",
      keepAliveStarted: true,
    };
    const result = await rollbackPartialContainerFixture(state, deps);
    expect(result.some((d) => d.includes("docker rm -f failed"))).toBe(true);
    expect(result.some((d) => d.includes("rmdir failed"))).toBe(true);
  });

  it("reports a refused work-directory removal as a diagnostic, not as silent success", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => "refused"),
    });
    const state: PartialContainerFixtureState = { workDir: "/outside/run-root", backend, keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("refused"))).toBe(true);
  });

  // ── Authoritative work-directory cleanup (Stage 3F.5.4-R5) ────────────────

  it("a structured EACCES from removeWorkDir is recorded as a diagnostic, and clearSshConfig + keep-alive shutdown still run afterward", async () => {
    const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { deps, backend } = fakeDeps({
      removeWorkDir: vi.fn(async () => {
        throw eaccesError;
      }),
    });
    const state: PartialContainerFixtureState = { workDir: "/work/dir", backend, keepAliveStarted: true, sshConfigCreated: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("removing work directory") && d.includes("permission denied"))).toBe(
      true,
    );
    expect(deps.clearSshConfig).toHaveBeenCalledTimes(1);
    expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it("integration: the real removeContainerWorkDir wired in — remove throwing ENOENT (TOCTOU) adds no failure diagnostic", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: (workDir) =>
        removeContainerWorkDir(workDir, {
          lstat: async () => {},
          remove: async () => {
            throw Object.assign(new Error("gone"), { code: "ENOENT" });
          },
        }),
    });
    const state: PartialContainerFixtureState = { workDir: "C:\\fake-run-root\\git\\container-ssh-abc123", backend, keepAliveStarted: true };
    const previousRunRoot = process.env["RIS_E2E_RUN_ROOT"];
    process.env["RIS_E2E_RUN_ROOT"] = "C:\\fake-run-root";
    try {
      const diagnostics = await rollbackPartialContainerFixture(state, deps);
      expect(diagnostics.some((d) => d.includes("removing work directory") && d.includes("failed"))).toBe(false);
    } finally {
      if (previousRunRoot === undefined) delete process.env["RIS_E2E_RUN_ROOT"];
      else process.env["RIS_E2E_RUN_ROOT"] = previousRunRoot;
    }
  });

  it("integration (Stage 3F.5.8A): the real removeContainerWorkDir wired in against a native Linux absolute run root", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: (workDir) =>
        removeContainerWorkDir(workDir, {
          lstat: async () => {},
          remove: async () => {},
        }),
    });
    const state: PartialContainerFixtureState = { workDir: "/tmp/ris-wdio-fake-run-root/git/container-ssh-abc123", backend, keepAliveStarted: true };
    const previousRunRoot = process.env["RIS_E2E_RUN_ROOT"];
    process.env["RIS_E2E_RUN_ROOT"] = "/tmp/ris-wdio-fake-run-root";
    try {
      const diagnostics = await rollbackPartialContainerFixture(state, deps);
      expect(diagnostics.some((d) => d.includes("removing work directory") && d.includes("failed"))).toBe(false);
    } finally {
      if (previousRunRoot === undefined) delete process.env["RIS_E2E_RUN_ROOT"];
      else process.env["RIS_E2E_RUN_ROOT"] = previousRunRoot;
    }
  });

  // ── Idempotent removal / ssh-config tri-state (Stage 3F.5.4-R3) ───────────

  it("initial presence unknown, removeContainer reports already-absent, final presence absent: no removal-failure diagnostic is added", async () => {
    let call = 0;
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => {
        call++;
        return call === 1 ? { status: "unknown", error: "daemon unavailable" } : { status: "absent" };
      }),
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => "already-absent"),
    });
    const state: PartialContainerFixtureState = { backend, containerName: "c1", keepAliveStarted: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("could not be determined before rollback"))).toBe(true);
    expect(diagnostics.some((d) => d.includes("removing container") && d.includes("failed"))).toBe(false);
  });

  it("sshConfigCreated=true and clearSshConfig returns 'refused' adds a diagnostic", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn((): SshConfigRemovalResult => "refused"),
    });
    const state: PartialContainerFixtureState = { backend, keepAliveStarted: true, sshConfigCreated: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("clearing ssh config was refused"))).toBe(true);
  });

  it("sshConfigCreated=true and clearSshConfig returns 'already-absent' adds no error", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn((): SshConfigRemovalResult => "already-absent"),
    });
    const state: PartialContainerFixtureState = { backend, keepAliveStarted: true, sshConfigCreated: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics).toEqual([]);
  });

  it("sshConfigCreated=true and clearSshConfig throws a structured EACCES: rollback records a diagnostic and still stops the keep-alive (Stage 3F.5.4-R4)", async () => {
    const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn(() => {
        throw eaccesError;
      }),
    });
    const state: PartialContainerFixtureState = { backend, keepAliveStarted: true, sshConfigCreated: true };
    const diagnostics = await rollbackPartialContainerFixture(state, deps);
    expect(diagnostics.some((d) => d.includes("clearing ssh config failed") && d.includes("permission denied"))).toBe(
      true,
    );
    expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it("does not attempt ssh config cleanup when sshConfigCreated is not true", async () => {
    const { deps, backend } = fakeDeps();
    const state: PartialContainerFixtureState = { backend, keepAliveStarted: true };
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.clearSshConfig).not.toHaveBeenCalled();
  });
});

// ── removeContainerViaDocker: idempotent not-found classification (Stage 3F.5.4-R3) ──

describe("removeContainerViaDocker", () => {
  const backend = fakeBackend();

  it("returns 'removed' when docker rm succeeds", async () => {
    const dockerRemove = vi.fn(async () => ({ stdout: "abc123", stderr: "" }));
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).resolves.toBe("removed");
  });

  it("returns 'already-absent' for docker's exact 'No such container' not-found result (cross-version: exit non-zero rather than 0)", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("Error response from daemon: No such container: c1");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).resolves.toBe("already-absent");
  });

  it("returns 'already-absent' for docker's exact 'no such object' not-found result", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("error: no such object: c1");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).resolves.toBe("already-absent");
  });

  it("rethrows when the Docker daemon is unavailable — never misread as already-absent", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("Cannot connect to the Docker daemon at unix:///var/run/docker.sock");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).rejects.toThrow();
  });

  it("rethrows when WSL itself is unavailable — never misread as already-absent", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("Wsl/Service/CreateInstance/HCS_E_SERVICE_NOT_AVAILABLE");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).rejects.toThrow();
  });

  it("rethrows on permission denied — never misread as already-absent", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("permission denied while trying to connect to the Docker daemon socket");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).rejects.toThrow();
  });

  it("rethrows for a generic 'not found' unrelated to the container itself — never misread as already-absent", async () => {
    const dockerRemove = vi.fn(async () => {
      throw fakeDockerError("bash: some-script.sh: not found");
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).rejects.toThrow();
  });

  it("preserves the original error identity/message when rethrowing a non-not-found failure", async () => {
    const original = fakeDockerError("Cannot connect to the Docker daemon");
    const dockerRemove = vi.fn(async () => {
      throw original;
    });
    await expect(removeContainerViaDocker(backend, "c1", dockerRemove)).rejects.toBe(original);
  });
});

// ── clearContainerSshConfig: tri-state result (Stage 3F.5.4-R3) ─────────────

describe("clearContainerSshConfig", () => {
  const RUN_ROOT_ENV = "RIS_E2E_RUN_ROOT";

  function withRunRoot<T>(runRoot: string | undefined, fn: () => T): T {
    const previous = process.env[RUN_ROOT_ENV];
    if (runRoot === undefined) delete process.env[RUN_ROOT_ENV];
    else process.env[RUN_ROOT_ENV] = runRoot;
    try {
      return fn();
    } finally {
      if (previous === undefined) delete process.env[RUN_ROOT_ENV];
      else process.env[RUN_ROOT_ENV] = previous;
    }
  }

  it("returns 'refused' when RIS_E2E_RUN_ROOT is unset", () => {
    withRunRoot(undefined, () => {
      expect(clearContainerSshConfig()).toBe("refused");
    });
  });

  it("returns 'already-absent' when the run root is valid but the config file does not exist", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      withRunRoot(runRoot, () => {
        expect(clearContainerSshConfig()).toBe("already-absent");
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("returns 'removed' and actually deletes the file when the config exists", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const gitDir = join(runRoot, "git");
      mkdirSync(gitDir, { recursive: true });
      const configPath = join(gitDir, "ssh-remote-command.env");
      writeFileSync(configPath, "RIS_SSH_REMOTE_PORT=1234\n");
      withRunRoot(runRoot, () => {
        expect(clearContainerSshConfig()).toBe("removed");
      });
      expect(existsSync(configPath)).toBe(false);
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  // ── Structured filesystem error classification (Stage 3F.5.4-R4) ────────
  //
  // Deterministic via injected SshConfigFsDeps — never by changing real
  // NTFS ACLs (see this stage's own "make these deterministic on Windows"
  // requirement). `existsSync()` could only ever say "not there right now",
  // never *why* — these prove only a structured ENOENT (never a message
  // substring match) may produce "already-absent", and every other
  // filesystem error propagates unchanged instead of being misread as
  // confirmed absence.

  function fakeFsError(code: string, message = `simulated ${code}`): NodeJS.ErrnoException {
    const error = new Error(message) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  }

  it("returns 'already-absent' when lstat throws ENOENT, without attempting removal", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const remove = vi.fn();
      withRunRoot(runRoot, () => {
        const result = clearContainerSshConfig({
          lstat: () => {
            throw fakeFsError("ENOENT");
          },
          remove,
        });
        expect(result).toBe("already-absent");
      });
      expect(remove).not.toHaveBeenCalled();
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows the exact original error instance when lstat throws EACCES — never converted to already-absent", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = fakeFsError("EACCES");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {
              throw original;
            },
            remove: vi.fn(),
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows the exact original error instance when lstat throws EPERM", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = fakeFsError("EPERM");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {
              throw original;
            },
            remove: vi.fn(),
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows the exact original error instance when lstat throws EIO", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = fakeFsError("EIO");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {
              throw original;
            },
            remove: vi.fn(),
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows an lstat error with no recognized code at all, rather than defaulting to already-absent", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = new Error("some unrecognized failure with no .code");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {
              throw original;
            },
            remove: vi.fn(),
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows the exact original error when lstat succeeds but remove throws EPERM", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = fakeFsError("EPERM");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {},
            remove: () => {
              throw original;
            },
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  // ── TOCTOU: ENOENT during removal (Stage 3F.5.4-R5) ──────────────────────
  //
  // lstat can succeed and then a concurrent cleanup (or a forcibly-killed
  // sibling process) removes the file before this function's own `remove`
  // call runs. The final state is correct (the file is gone) — this must
  // be idempotent success, not a reported cleanup failure.

  it("returns 'already-absent' when lstat succeeds but remove throws ENOENT (TOCTOU race)", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      withRunRoot(runRoot, () => {
        const result = clearContainerSshConfig({
          lstat: () => {},
          remove: () => {
            throw fakeFsError("ENOENT");
          },
        });
        expect(result).toBe("already-absent");
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });

  it("rethrows the exact original error when lstat succeeds but remove throws EACCES", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "ris-e2e-sshconfig-"));
    try {
      const original = fakeFsError("EACCES");
      withRunRoot(runRoot, () => {
        let caught: unknown;
        try {
          clearContainerSshConfig({
            lstat: () => {},
            remove: () => {
              throw original;
            },
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    } finally {
      rmSync(runRoot, { recursive: true, force: true });
    }
  });
});

// ── removeContainerWorkDir: structured filesystem error classification (Stage 3F.5.4-R5) ──

describe("removeContainerWorkDir", () => {
  const RUN_ROOT_ENV = "RIS_E2E_RUN_ROOT";

  function withRunRoot<T>(runRoot: string | undefined, fn: () => Promise<T>): Promise<T> {
    const previous = process.env[RUN_ROOT_ENV];
    if (runRoot === undefined) delete process.env[RUN_ROOT_ENV];
    else process.env[RUN_ROOT_ENV] = runRoot;
    return fn().finally(() => {
      if (previous === undefined) delete process.env[RUN_ROOT_ENV];
      else process.env[RUN_ROOT_ENV] = previous;
    });
  }

  function fakeFsError(code: string, message = `simulated ${code}`): NodeJS.ErrnoException {
    const error = new Error(message) as NodeJS.ErrnoException;
    error.code = code;
    return error;
  }

  // Deliberately built with `node:path`'s host-platform-dependent `join`
  // (already imported at the top of this file), not a hardcoded
  // Windows-style string: `removeContainerWorkDir`'s own logic
  // (`isStrictChildPath`, `node:fs/promises`) is genuinely platform-neutral
  // — it defers entirely to whatever the real host's `node:path` resolves —
  // so these fixture values must be valid *host-native* paths to actually
  // exercise the lstat/remove classification logic being tested, on
  // whichever platform runs this suite (Stage 3F.5.8A: this file now runs
  // for real on Linux, not only Windows).
  const RUN_ROOT = join(tmpdir(), "ris-fake-run-root");
  const WORK_DIR = join(RUN_ROOT, "git", "container-ssh-abc123");
  const OUTSIDE_WORK_DIR = join(tmpdir(), "ris-somewhere-else", "workdir");

  it("returns 'refused' when RIS_E2E_RUN_ROOT is unset, without calling lstat or remove", async () => {
    const lstat = vi.fn();
    const remove = vi.fn();
    await withRunRoot(undefined, async () => {
      const result = await removeContainerWorkDir(WORK_DIR, { lstat, remove });
      expect(result).toBe("refused");
    });
    expect(lstat).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns 'refused' when workDir is not a strict child of the run root (path-safety), without calling lstat or remove", async () => {
    const lstat = vi.fn();
    const remove = vi.fn();
    await withRunRoot(RUN_ROOT, async () => {
      const result = await removeContainerWorkDir(OUTSIDE_WORK_DIR, { lstat, remove });
      expect(result).toBe("refused");
    });
    expect(lstat).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("returns 'removed' when lstat and remove both succeed", async () => {
    await withRunRoot(RUN_ROOT, async () => {
      const result = await removeContainerWorkDir(WORK_DIR, {
        lstat: async () => {},
        remove: async () => {},
      });
      expect(result).toBe("removed");
    });
  });

  it("returns 'already-absent' when lstat throws ENOENT, without attempting removal", async () => {
    const remove = vi.fn();
    await withRunRoot(RUN_ROOT, async () => {
      const result = await removeContainerWorkDir(WORK_DIR, {
        lstat: async () => {
          throw fakeFsError("ENOENT");
        },
        remove,
      });
      expect(result).toBe("already-absent");
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(["EACCES", "EPERM", "EIO", "ENOTDIR"])(
    "rethrows the exact original error when lstat throws %s",
    async (code) => {
      const original = fakeFsError(code);
      await withRunRoot(RUN_ROOT, async () => {
        let caught: unknown;
        try {
          await removeContainerWorkDir(WORK_DIR, {
            lstat: async () => {
              throw original;
            },
            remove: vi.fn(),
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    },
  );

  it("rethrows an lstat error with no recognized code at all, rather than defaulting to already-absent", async () => {
    const original = new Error("some unrecognized failure with no .code");
    await withRunRoot(RUN_ROOT, async () => {
      let caught: unknown;
      try {
        await removeContainerWorkDir(WORK_DIR, {
          lstat: async () => {
            throw original;
          },
          remove: vi.fn(),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(original);
    });
  });

  // ── TOCTOU: ENOENT during removal ─────────────────────────────────────────

  it("returns 'already-absent' when lstat succeeds but remove throws ENOENT (TOCTOU race)", async () => {
    await withRunRoot(RUN_ROOT, async () => {
      const result = await removeContainerWorkDir(WORK_DIR, {
        lstat: async () => {},
        remove: async () => {
          throw fakeFsError("ENOENT");
        },
      });
      expect(result).toBe("already-absent");
    });
  });

  it.each(["EPERM", "EBUSY"])(
    "rethrows the exact original error when lstat succeeds but remove throws %s",
    async (code) => {
      const original = fakeFsError(code);
      await withRunRoot(RUN_ROOT, async () => {
        let caught: unknown;
        try {
          await removeContainerWorkDir(WORK_DIR, {
            lstat: async () => {},
            remove: async () => {
              throw original;
            },
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBe(original);
      });
    },
  );
});

describe("isNodeErrorWithCode", () => {
  it("matches an Error whose .code equals the given code", () => {
    const error = Object.assign(new Error("nope"), { code: "ENOENT" });
    expect(isNodeErrorWithCode(error, "ENOENT")).toBe(true);
  });

  it("does not match a different code", () => {
    const error = Object.assign(new Error("nope"), { code: "EACCES" });
    expect(isNodeErrorWithCode(error, "ENOENT")).toBe(false);
  });

  it("does not match an Error with no code at all", () => {
    expect(isNodeErrorWithCode(new Error("nope"), "ENOENT")).toBe(false);
  });

  it("does not match a non-Error value", () => {
    expect(isNodeErrorWithCode("not an error", "ENOENT")).toBe(false);
    expect(isNodeErrorWithCode(undefined, "ENOENT")).toBe(false);
  });

  it("never inspects the error message text (only the structured code)", () => {
    const error = Object.assign(new Error("file not found somewhere"), { code: "EACCES" });
    expect(isNodeErrorWithCode(error, "ENOENT")).toBe(false);
  });
});

// ── cleanupContainerRemote ordering (Stage 3F.5.4-R1) ────────────────────────

describe("cleanupContainerRemote", () => {
  function fakeServer(overrides: Partial<ContainerSshRemoteServer> = {}): ContainerSshRemoteServer {
    return {
      backend: fakeBackend(),
      containerName: "ris-e2e-git-ssh-abc123",
      runId: "abc123",
      port: 32768,
      username: "git",
      identityPath: "C:\\work\\id_ed25519",
      workDir: "C:\\work",
      ...overrides,
    };
  }

  function fakeDeps(overrides: Partial<ContainerOpsDeps> = {}) {
    const calls: string[] = [];
    const backend = fakeBackend({
      stopKeepAlive: vi.fn(() => {
        calls.push("stopKeepAlive");
      }),
    });
    const deps: ContainerOpsDeps = {
      createBackend: vi.fn(() => backend),
      ensureImageBuilt: vi.fn(async () => "ris-e2e-git-ssh-server:hash"),
      dockerRun: vi.fn(async () => {}),
      dockerPort: vi.fn(async () => "22/tcp -> 127.0.0.1:32768"),
      waitForHealthy: vi.fn(async () => {}),
      collectDiagnostics: vi.fn(async () => "diag"),
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => {
        calls.push("removeContainer");
        return "removed";
      }),
      // Never throws in the real implementation — a "verification failed"
      // scenario is expressed as `status: "unknown"`, not a rejection (see
      // inspectContainerPresence's own contract).
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => {
        calls.push("inspectContainerPresence");
        return { status: "absent" };
      }),
      listFixtureContainers: vi.fn(async () => []),
      removeContainersByIds: vi.fn(async () => {}),
      generateKeypair: vi.fn(async () => {}),
      securePrivateKeyFile: vi.fn(),
      readPublicKey: vi.fn(() => "ssh-ed25519 AAAA"),
      installPublicKey: vi.fn(async () => {}),
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => {
        calls.push("removeWorkDir");
        return "removed";
      }),
      clearSshConfig: vi.fn((): SshConfigRemovalResult => {
        calls.push("clearSshConfig");
        return "removed";
      }),
      ...overrides,
    };
    return { deps, calls, backend };
  }


  it("runs in the documented order: clear ssh config -> remove container -> verify -> remove workDir -> stop keep-alive", async () => {
    const { deps, calls, backend } = fakeDeps();
    await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(calls).toEqual(["clearSshConfig", "removeContainer", "inspectContainerPresence", "removeWorkDir", "stopKeepAlive"]);
  });

  it("still stops the keep-alive when docker rm -f fails (finally semantics)", async () => {
    const { deps, backend } = fakeDeps({
      removeContainer: vi.fn(async () => {
        throw new Error("docker rm -f failed");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
    expect(result.keepAliveStopped).toBe(true);
    expect(result.containerRemoved).toBe(false);
    expect(result.containerRemovalAttempted).toBe(true);
    expect(result.errors.some((e) => e.includes("docker rm -f failed"))).toBe(true);
  });

  it("still stops the keep-alive when verification is unknown and when work-directory removal fails", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "unknown", error: "inspect failed" })),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.keepAliveStopped).toBe(true);
    expect(result.workDirRemoved).toBe(false);
    expect(result.containerVerifiedAbsent).toBe(false);
    expect(result.errors.some((e) => e.includes("inspect failed"))).toBe(true);
    expect(result.errors.some((e) => e.includes("rmdir failed"))).toBe(true);
  });

  it("does not silently treat a container still present after removal as success", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "present" })),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.containerVerifiedAbsent).toBe(false);
    expect(result.errors.some((e) => e.includes("still present"))).toBe(true);
  });

  it("does not treat an unverifiable (unknown) presence result as confirmed absence (defect-1 fix)", async () => {
    const { deps, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(
        async (): Promise<ContainerPresence> => ({ status: "unknown", error: "docker daemon unreachable" }),
      ),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.containerVerifiedAbsent).toBe(false);
    expect(result.errors.some((e) => e.includes("could not be verified") && e.includes("docker daemon unreachable"))).toBe(
      true,
    );
  });

  it("reports a refused work-directory removal as an error, not as success", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => "refused"),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.workDirRemoved).toBe(false);
    expect(result.errors.some((e) => e.includes("refused"))).toBe(true);
  });

  it("treats an already-absent work directory as successfully removed (idempotency)", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => "already-absent"),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.workDirRemoved).toBe(true);
  });

  // ── Authoritative work-directory cleanup (Stage 3F.5.4-R5) ────────────────

  it("a structured EACCES thrown by removeWorkDir fails authoritative cleanup", async () => {
    const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { deps, backend } = fakeDeps({
      removeWorkDir: vi.fn(async () => {
        throw eaccesError;
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.workDirRemoved).toBe(false);
    expect(result.errors.some((e) => e.includes("permission denied"))).toBe(true);
    expect(isCleanupSuccessful(result)).toBe(false);
  });

  it("integration: the real removeContainerWorkDir wired in — remove throwing ENOENT (TOCTOU) still yields a conclusively successful cleanup", async () => {
    const { deps, backend } = fakeDeps({
      removeWorkDir: (workDir) =>
        removeContainerWorkDir(workDir, {
          lstat: async () => {},
          remove: async () => {
            throw Object.assign(new Error("gone"), { code: "ENOENT" });
          },
        }),
    });
    const fakeRunRoot = join(tmpdir(), "ris-fake-run-root-cleanup");
    const server = fakeServer({ workDir: join(fakeRunRoot, "git", "container-ssh-abc123"), backend });
    const previousRunRoot = process.env["RIS_E2E_RUN_ROOT"];
    process.env["RIS_E2E_RUN_ROOT"] = fakeRunRoot;
    try {
      const result = await cleanupContainerRemote(server, deps);
      expect(result.workDirRemoved).toBe(true);
      expect(result.errors).toEqual([]);
      expect(isCleanupSuccessful(result)).toBe(true);
    } finally {
      if (previousRunRoot === undefined) delete process.env["RIS_E2E_RUN_ROOT"];
      else process.env["RIS_E2E_RUN_ROOT"] = previousRunRoot;
    }
  });

  it("never throws — a fully-failing cleanup still resolves with a structured result", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn(() => {
        throw new Error("clear failed");
      }),
      removeContainer: vi.fn(async () => {
        throw new Error("rm failed");
      }),
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "unknown", error: "inspect failed" })),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
    });
    backend.stopKeepAlive = vi.fn(() => {
      throw new Error("stop failed");
    });
    await expect(cleanupContainerRemote(fakeServer({ backend }), deps)).resolves.toMatchObject({
      sshConfigCleared: false,
      containerRemoved: false,
      containerVerifiedAbsent: false,
      workDirRemoved: false,
      keepAliveStopped: false,
    });
  });

  it("is safe to call twice on the same server", async () => {
    const { deps, backend } = fakeDeps();
    const server = fakeServer({ backend });
    await expect(cleanupContainerRemote(server, deps)).resolves.toBeDefined();
    await expect(cleanupContainerRemote(server, deps)).resolves.toBeDefined();
    expect(backend.stopKeepAlive).toHaveBeenCalledTimes(2);
  });

  it("calling twice on an already-absent container/workDir still yields two conclusively successful results (idempotency)", async () => {
    const { deps, backend } = fakeDeps({
      // rm -f on an already-absent container does not throw — confirmed
      // empirically against real Docker Engine 29.4.3 (exit 0).
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => "already-absent"),
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "absent" })),
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => "already-absent"),
    });
    const server = fakeServer({ backend });
    const first = await cleanupContainerRemote(server, deps);
    const second = await cleanupContainerRemote(server, deps);
    expect(isCleanupSuccessful(first)).toBe(true);
    expect(isCleanupSuccessful(second)).toBe(true);
  });

  // ── Idempotent removal / ssh-config tri-state (Stage 3F.5.4-R3) ───────────

  it("removeContainer reporting 'already-absent' plus a conclusive final 'absent' inspect is a successful cleanup", async () => {
    const { deps, backend } = fakeDeps({
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => "already-absent"),
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "absent" })),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.containerRemovalAttempted).toBe(true);
    expect(result.containerRemoved).toBe(false);
    expect(result.containerVerifiedAbsent).toBe(true);
    expect(isCleanupSuccessful(result)).toBe(true);
  });

  it("remains successful even when the SECOND cleanup's removal reports exact Docker not-found rather than a non-throwing exit code (cross-version idempotency)", async () => {
    let call = 0;
    const { deps, backend } = fakeDeps({
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => {
        call++;
        return call === 1 ? "removed" : "already-absent";
      }),
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "absent" })),
    });
    const server = fakeServer({ backend });
    const first = await cleanupContainerRemote(server, deps);
    const second = await cleanupContainerRemote(server, deps);
    expect(first.containerRemoved).toBe(true);
    expect(second.containerRemoved).toBe(false);
    expect(isCleanupSuccessful(first)).toBe(true);
    expect(isCleanupSuccessful(second)).toBe(true);
  });

  it("clearSshConfig returning 'refused' makes sshConfigCleared false and adds a refusal diagnostic, failing isCleanupSuccessful", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn((): SshConfigRemovalResult => "refused"),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.sshConfigCleared).toBe(false);
    expect(result.errors.some((e) => e.includes("clearing ssh config was refused"))).toBe(true);
    expect(isCleanupSuccessful(result)).toBe(false);
  });

  it("clearSshConfig returning 'already-absent' makes sshConfigCleared true and adds no error", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn((): SshConfigRemovalResult => "already-absent"),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.sshConfigCleared).toBe(true);
    expect(result.errors).toEqual([]);
    expect(isCleanupSuccessful(result)).toBe(true);
  });

  it("a filesystem exception from clearSshConfig leaves sshConfigCleared false and adds a cleanup error", async () => {
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn(() => {
        throw new Error("EPERM: operation not permitted");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.sshConfigCleared).toBe(false);
    expect(result.errors.some((e) => e.includes("EPERM"))).toBe(true);
  });

  it("a structured EACCES thrown by clearSshConfig fails authoritative cleanup (Stage 3F.5.4-R4)", async () => {
    const eaccesError = Object.assign(new Error("permission denied"), { code: "EACCES" });
    const { deps, backend } = fakeDeps({
      clearSshConfig: vi.fn(() => {
        throw eaccesError;
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.sshConfigCleared).toBe(false);
    expect(result.errors.some((e) => e.includes("permission denied"))).toBe(true);
    expect(isCleanupSuccessful(result)).toBe(false);
  });

  it("an inspectContainerPresence dependency that throws (violating its own contract) degrades to 'unknown' rather than aborting cleanup early", async () => {
    const { deps, calls, backend } = fakeDeps({
      inspectContainerPresence: vi.fn(async () => {
        throw new Error("injected: dependency violated its never-throws contract");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer({ backend }), deps);
    expect(result.containerVerifiedAbsent).toBe(false);
    expect(result.errors.some((e) => e.includes("injected: dependency violated its never-throws contract"))).toBe(true);
    // work-directory removal and keep-alive shutdown still ran afterward.
    expect(calls).toContain("removeWorkDir");
    expect(calls).toContain("stopKeepAlive");
    expect(result.workDirRemoved).toBe(true);
    expect(result.keepAliveStopped).toBe(true);
  });
});

// ── Teardown authority (Stage 3F.5.4-R2's defect-2 fix) ─────────────────────

describe("isCleanupSuccessful / assertCleanupSucceeded / formatCleanupFailure", () => {
  function successfulResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
    return {
      sshConfigCleared: true,
      containerRemovalAttempted: true,
      containerRemoved: true,
      containerVerifiedAbsent: true,
      workDirRemoved: true,
      keepAliveStopRequested: true,
      keepAliveStopped: true,
      errors: [],
      ...overrides,
    };
  }

  it("a fully clean CleanupResult is successful and does not throw", () => {
    expect(isCleanupSuccessful(successfulResult())).toBe(true);
    expect(() => assertCleanupSucceeded(successfulResult())).not.toThrow();
  });

  it("containerVerifiedAbsent=false makes teardown fail", () => {
    const result = successfulResult({ containerVerifiedAbsent: false });
    expect(isCleanupSuccessful(result)).toBe(false);
    expect(() => assertCleanupSucceeded(result)).toThrow(/containerVerifiedAbsent=false/);
  });

  it("workDirRemoved=false makes teardown fail", () => {
    const result = successfulResult({ workDirRemoved: false });
    expect(isCleanupSuccessful(result)).toBe(false);
    expect(() => assertCleanupSucceeded(result)).toThrow(/workDirRemoved=false/);
  });

  it("keepAliveStopped=false makes teardown fail", () => {
    const result = successfulResult({ keepAliveStopped: false });
    expect(isCleanupSuccessful(result)).toBe(false);
    expect(() => assertCleanupSucceeded(result)).toThrow(/keepAliveStopped=false/);
  });

  it("sshConfigCleared=false makes teardown fail", () => {
    expect(isCleanupSuccessful(successfulResult({ sshConfigCleared: false }))).toBe(false);
  });

  it("a non-empty errors array makes teardown fail even when every boolean field is true", () => {
    const result = successfulResult({ errors: ["something non-fatal but recorded"] });
    expect(isCleanupSuccessful(result)).toBe(false);
    expect(() => assertCleanupSucceeded(result)).toThrow(/something non-fatal but recorded/);
  });

  it("an already-absent container (containerRemoved=false, containerVerifiedAbsent=true) is still a successful cleanup", () => {
    const result = successfulResult({ containerRemoved: false, containerRemovalAttempted: true });
    expect(isCleanupSuccessful(result)).toBe(true);
  });

  it("formats the container name and every unmet field/error into the thrown message", () => {
    const result = successfulResult({ containerVerifiedAbsent: false, errors: ["docker daemon unreachable"] });
    const message = formatCleanupFailure(result, "ris-e2e-git-ssh-abc123");
    expect(message).toContain("ris-e2e-git-ssh-abc123");
    expect(message).toContain("containerVerifiedAbsent=false");
    expect(message).toContain("docker daemon unreachable");
  });
});

// ── Provider-neutral cleanup contract (Stage 3F.5.4-R2) ──────────────────────

describe("toFixtureCleanupResult / assertFixtureCleanupSucceeded / formatFixtureCleanupFailure", () => {
  function successfulResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
    return {
      sshConfigCleared: true,
      containerRemovalAttempted: true,
      containerRemoved: true,
      containerVerifiedAbsent: true,
      workDirRemoved: true,
      keepAliveStopRequested: true,
      keepAliveStopped: true,
      errors: [],
      ...overrides,
    };
  }

  it("maps a fully successful CleanupResult to ok:true with no errors (not Promise<unknown> — a typed, actionable shape)", () => {
    const fixtureResult = toFixtureCleanupResult(successfulResult());
    expect(fixtureResult).toEqual<FixtureCleanupResult>({ ok: true, provider: "container", errors: [] });
    expect(() => assertFixtureCleanupSucceeded(fixtureResult)).not.toThrow();
  });

  it("maps an unsuccessful CleanupResult to ok:false carrying the unmet-field reasons", () => {
    const fixtureResult = toFixtureCleanupResult(successfulResult({ containerVerifiedAbsent: false }));
    expect(fixtureResult.ok).toBe(false);
    expect(fixtureResult.provider).toBe("container");
    expect(fixtureResult.errors.some((e) => e.includes("containerVerifiedAbsent=false"))).toBe(true);
    expect(() => assertFixtureCleanupSucceeded(fixtureResult)).toThrow(
      /container fixture cleanup did not conclusively succeed/,
    );
  });

  it("a failed native-provider result also fails the shared provider-neutral assertion", () => {
    const fixtureResult: FixtureCleanupResult = { ok: false, provider: "native", errors: ["sshd kill failed"] };
    expect(() => assertFixtureCleanupSucceeded(fixtureResult)).toThrow(/native fixture cleanup did not conclusively succeed/);
    expect(() => assertFixtureCleanupSucceeded(fixtureResult)).toThrow(/sshd kill failed/);
  });

  it("a successful native-provider result does not throw", () => {
    const fixtureResult: FixtureCleanupResult = { ok: true, provider: "native", errors: [] };
    expect(() => assertFixtureCleanupSucceeded(fixtureResult)).not.toThrow();
  });

  // ── Defensive hardening (Stage 3F.5.4-R3) ──────────────────────────────

  it("rejects an internally inconsistent result — ok:true with a non-empty errors array — rather than trusting ok blindly", () => {
    const inconsistent: FixtureCleanupResult = {
      ok: true,
      provider: "container",
      errors: ["this should never coexist with ok:true"],
    };
    expect(() => assertFixtureCleanupSucceeded(inconsistent)).toThrow(
      /reported ok:true but recorded 1 error\(s\)/,
    );
    expect(() => assertFixtureCleanupSucceeded(inconsistent)).toThrow(/this should never coexist with ok:true/);
  });

  it("does not flag a consistent ok:true/no-errors result as inconsistent", () => {
    const consistent: FixtureCleanupResult = { ok: true, provider: "native", errors: [] };
    expect(() => assertFixtureCleanupSucceeded(consistent)).not.toThrow();
  });
});

// ── cleanupOrphanedContainers: never sweeps unrelated containers ────────────

describe("cleanupOrphanedContainers", () => {
  const backend = fakeBackend();

  it("removes exactly the ids the (label-filtered) list call returned, nothing else", async () => {
    const listFixtureContainers = vi.fn(async () => ["abc123", "def456"]);
    const removeContainersByIds = vi.fn(async () => {});
    const result = await cleanupOrphanedContainers(backend, undefined, { listFixtureContainers, removeContainersByIds });
    expect(result).toEqual(["abc123", "def456"]);
    expect(removeContainersByIds).toHaveBeenCalledWith(backend, ["abc123", "def456"]);
    expect(removeContainersByIds).toHaveBeenCalledTimes(1);
  });

  it("does not call remove at all when the list is empty (no fallback to 'remove everything')", async () => {
    const listFixtureContainers = vi.fn(async () => []);
    const removeContainersByIds = vi.fn(async () => {});
    const result = await cleanupOrphanedContainers(backend, undefined, { listFixtureContainers, removeContainersByIds });
    expect(result).toEqual([]);
    expect(removeContainersByIds).not.toHaveBeenCalled();
  });

  it("passes the run id through to the list call for further scoping", async () => {
    const listFixtureContainers = vi.fn(async () => []);
    const removeContainersByIds = vi.fn(async () => {});
    await cleanupOrphanedContainers(backend, "run1", { listFixtureContainers, removeContainersByIds });
    expect(listFixtureContainers).toHaveBeenCalledWith(backend, "run1");
  });
});

// ── startContainerRemote: transactional startup / fault injection ───────────

describe("startContainerRemote (fault injection, no real WSL/Docker)", () => {
  const RUN_ROOT_ENV = "RIS_E2E_RUN_ROOT";
  // Deliberately a real, host-native temp path (not a hardcoded Windows-style
  // string): `startContainerRemote` really does call `mkdirSync`/`writeFileSync`
  // against `RIS_E2E_RUN_ROOT`-derived paths even with every Docker/WSL
  // dependency faked, so this must be a directory that genuinely exists —
  // and is genuinely cleaned up afterward, not left behind as clutter in the
  // repo working directory (Stage 3F.5.8A: this file now runs for real on
  // Linux, not only Windows).
  const FAKE_RUN_ROOT = join(tmpdir(), "ris-fake-run-root-start-container-remote-test");

  function withRunRoot<T>(fn: () => Promise<T>): Promise<T> {
    const previous = process.env[RUN_ROOT_ENV];
    process.env[RUN_ROOT_ENV] = FAKE_RUN_ROOT;
    mkdirSync(FAKE_RUN_ROOT, { recursive: true });
    return fn().finally(() => {
      if (previous === undefined) delete process.env[RUN_ROOT_ENV];
      else process.env[RUN_ROOT_ENV] = previous;
      rmSync(FAKE_RUN_ROOT, { recursive: true, force: true });
    });
  }

  function fakeDeps(overrides: Partial<ContainerOpsDeps> = {}) {
    const backend = fakeBackend({
      preflight: vi.fn(async () => ({ ok: true as const, detail: "fake backend (Ubuntu)" })),
      startKeepAlive: vi.fn(),
      stopKeepAlive: vi.fn(),
    });
    let presenceCallCount = 0;
    const deps: ContainerOpsDeps = {
      createBackend: vi.fn(() => backend),
      ensureImageBuilt: vi.fn(async () => "ris-e2e-git-ssh-server:hash"),
      dockerRun: vi.fn(async () => {}),
      dockerPort: vi.fn(async () => "22/tcp -> 127.0.0.1:32768"),
      waitForHealthy: vi.fn(async () => {}),
      collectDiagnostics: vi.fn(async () => "diag"),
      removeContainer: vi.fn(async (): Promise<ContainerRemovalResult> => "removed"),
      // Default: present on the first (pre-removal) check, absent on the
      // second (post-removal) check — the realistic shape a successful
      // rollback removal produces. Individual tests override this when a
      // different presence shape is the point of the test.
      inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => {
        presenceCallCount++;
        return presenceCallCount === 1 ? { status: "present" } : { status: "absent" };
      }),
      listFixtureContainers: vi.fn(async () => []),
      removeContainersByIds: vi.fn(async () => {}),
      generateKeypair: vi.fn(async () => {}),
      securePrivateKeyFile: vi.fn(),
      readPublicKey: vi.fn(() => "ssh-ed25519 AAAA"),
      installPublicKey: vi.fn(async () => {}),
      removeWorkDir: vi.fn(async (): Promise<WorkDirRemovalResult> => "removed"),
      clearSshConfig: vi.fn((): SshConfigRemovalResult => "removed"),
      ...overrides,
    };
    return { deps, backend };
  }


  it("succeeds and returns a complete server when every step succeeds", () =>
    withRunRoot(async () => {
      const { deps, backend } = fakeDeps();
      const server = await startContainerRemote({}, deps);
      expect(server.port).toBe(32768);
      expect(server.backend.describe()).toBe("fake backend (Ubuntu)");
      expect(deps.installPublicKey).toHaveBeenCalledTimes(1);
    }));

  it("scenario 1: docker run succeeds, port parsing fails — container is removed and error is rethrown", () =>
    withRunRoot(async () => {
      const { deps, backend } = fakeDeps({
        dockerPort: vi.fn(async () => "22/tcp -> 0.0.0.0:32768"), // no 127.0.0.1 mapping — unparseable per this fixture's contract
      });
      await expect(startContainerRemote({}, deps)).rejects.toThrow(/could not parse a 127\.0\.0\.1 published port/);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.installPublicKey).not.toHaveBeenCalled();
    }));

  it("Stage 3F.5.7-R1: scenario 1's port-parse failure is an internal fixture invariant — no native-fallback hint appended", () =>
    withRunRoot(async () => {
      const { deps, backend } = fakeDeps({
        dockerPort: vi.fn(async () => "22/tcp -> 0.0.0.0:32768"),
      });
      let caught: Error | undefined;
      try {
        await startContainerRemote({}, deps);
      } catch (error) {
        caught = error as Error;
      }
      expect(caught?.message).toMatch(/could not parse a 127\.0\.0\.1 published port/);
      expect(caught?.message).not.toMatch(/supported on Windows through WSL2 Docker/);
      expect(caught?.message).not.toMatch(/RIS_E2E_GIT_REMOTE_PROVIDER=native/);
    }));

  it("scenario 2: container becomes healthy, ssh-keygen fails — container and work dir are rolled back", () =>
    withRunRoot(async () => {
      const keygenError = new Error("ssh-keygen exploded");
      const { deps, backend } = fakeDeps({
        generateKeypair: vi.fn(async () => {
          throw keygenError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(keygenError);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(deps.removeWorkDir).toHaveBeenCalledTimes(1);
      expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.installPublicKey).not.toHaveBeenCalled();
    }));

  it("scenario 3: SSH key generation succeeds, installPublicKey fails — full rollback still runs", () =>
    withRunRoot(async () => {
      const installError = new Error("docker exec tee failed");
      const { deps, backend } = fakeDeps({
        installPublicKey: vi.fn(async () => {
          throw installError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(installError);
      expect(deps.generateKeypair).toHaveBeenCalledTimes(1);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(deps.removeWorkDir).toHaveBeenCalledTimes(1);
      expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
    }));

  it("scenario 8: the original startup error remains the primary thrown error (same instance)", () =>
    withRunRoot(async () => {
      const original = new Error("distinctive original failure");
      const { deps, backend } = fakeDeps({
        waitForHealthy: vi.fn(async () => {
          throw original;
        }),
      });
      let caught: unknown;
      try {
        await startContainerRemote({}, deps);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(original);
    }));

  it("scenario 9: rollback (cleanup) errors appear as secondary diagnostics on the thrown error, not replacing it", () =>
    withRunRoot(async () => {
      const original = new Error("primary startup failure");
      const { deps, backend } = fakeDeps({
        waitForHealthy: vi.fn(async () => {
          throw original;
        }),
        removeContainer: vi.fn(async () => {
          throw new Error("docker rm -f also failed");
        }),
      });
      let caught: (Error & { rollbackDiagnostics?: string[] }) | undefined;
      try {
        await startContainerRemote({}, deps);
      } catch (error) {
        caught = error as Error & { rollbackDiagnostics?: string[] };
      }
      expect(caught).toBe(original);
      expect(caught?.message).toBe("primary startup failure");
      expect(caught?.rollbackDiagnostics?.some((d) => d.includes("docker rm -f also failed"))).toBe(true);
    }));

  it("scenario 12/13 (via a very early failure): partial rollback with no container and no work directory created yet is safe", () =>
    withRunRoot(async () => {
      const preflightError = new Error("no working WSL2 distribution");
      const failingBackend = fakeBackend({
        preflight: vi.fn(async () => {
          throw preflightError;
        }),
        stopKeepAlive: vi.fn(),
      });
      const { deps } = fakeDeps({ createBackend: vi.fn(() => failingBackend) });
      await expect(startContainerRemote({}, deps)).rejects.toBe(preflightError);
      // Nothing was ever acquired — no container, no work dir, no keep-alive.
      expect(deps.removeContainer).not.toHaveBeenCalled();
      expect(deps.removeWorkDir).not.toHaveBeenCalled();
      expect(failingBackend.stopKeepAlive).not.toHaveBeenCalled();
    }));

  it("stops the keep-alive on rollback even when it was the only resource ever acquired", () =>
    withRunRoot(async () => {
      const imageError = new Error("image build failed");
      const { deps, backend } = fakeDeps({
        ensureImageBuilt: vi.fn(async () => {
          throw imageError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(imageError);
      expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.removeContainer).not.toHaveBeenCalled();
    }));

  // ── Partial docker-run failure (Stage 3F.5.4-R2's defect-4 fix) ───────────
  //
  // The generated container name is now recorded in PartialContainerFixtureState
  // *before* `docker run` is even attempted — these prove rollback can still
  // target that exact, unique name when `docker run` itself is what throws
  // (a partial engine-side success, a lost response, an interruption).

  it("docker run itself throws after the container name was already recorded — rollback still targets that exact name", () =>
    withRunRoot(async () => {
      const runError = new Error("docker run lost its response");
      const { deps, backend } = fakeDeps({
        dockerRun: vi.fn(async () => {
          throw runError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(runError);
      expect(deps.inspectContainerPresence).toHaveBeenCalled();
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      const [backendArg, nameArg] = (deps.removeContainer as unknown as { mock: { calls: [ContainerHostBackend, string][] } })
        .mock.calls[0]!;
      expect(backendArg).toBe(backend);
      expect(nameArg).toMatch(/^ris-e2e-git-ssh-/);
      expect(backend.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.dockerPort).not.toHaveBeenCalled();
    }));

  it("docker run throws but the container was never actually created engine-side — presence check reports absent and removal is skipped", () =>
    withRunRoot(async () => {
      const runError = new Error("docker run: connection reset before any container existed");
      const { deps, backend } = fakeDeps({
        dockerRun: vi.fn(async () => {
          throw runError;
        }),
        inspectContainerPresence: vi.fn(async (): Promise<ContainerPresence> => ({ status: "absent" })),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(runError);
      expect(deps.removeContainer).not.toHaveBeenCalled();
    }));

  it("docker run throws AND the rollback removal also fails — the original dockerRun error stays primary, with rollback diagnostics attached", () =>
    withRunRoot(async () => {
      const runError = new Error("docker run exploded");
      const { deps, backend } = fakeDeps({
        dockerRun: vi.fn(async () => {
          throw runError;
        }),
        removeContainer: vi.fn(async () => {
          throw new Error("docker rm -f also failed during rollback");
        }),
      });
      let caught: (Error & { rollbackDiagnostics?: string[] }) | undefined;
      try {
        await startContainerRemote({}, deps);
      } catch (error) {
        caught = error as Error & { rollbackDiagnostics?: string[] };
      }
      expect(caught).toBe(runError);
      expect(caught?.rollbackDiagnostics?.some((d) => d.includes("docker rm -f also failed during rollback"))).toBe(true);
    }));
});

// ── createContainerRemoteFixture: atomic provider initialization ────────────

describe("createContainerRemoteFixture", () => {
  function fakeServer(): ContainerSshRemoteServer {
    return {
      backend: fakeBackend(),
      containerName: "ris-e2e-git-ssh-abc123",
      runId: "abc123",
      port: 32768,
      username: "git",
      identityPath: "C:\\work\\id_ed25519",
      workDir: "C:\\work",
    };
  }

  function successfulCleanupResult(overrides: Partial<CleanupResult> = {}): CleanupResult {
    return {
      sshConfigCleared: true,
      containerRemovalAttempted: true,
      containerRemoved: true,
      containerVerifiedAbsent: true,
      workDirRemoved: true,
      keepAliveStopRequested: true,
      keepAliveStopped: true,
      errors: [],
      ...overrides,
    };
  }

  it("returns a ready fixture handle when both steps succeed", async () => {
    const server = fakeServer();
    const handle = await createContainerRemoteFixture(
      {},
      {
        startContainerRemote: vi.fn(async () => server),
        configureContainerSsh: vi.fn(),
        cleanupContainerRemote: vi.fn(async () => successfulCleanupResult()),
      },
    );
    expect(typeof handle.createBareRemote).toBe("function");
    expect(typeof handle.cleanup).toBe("function");
  });

  it("handle.cleanup() maps the underlying CleanupResult onto the provider-neutral FixtureCleanupResult (never Promise<unknown>)", async () => {
    const server = fakeServer();
    const handle = await createContainerRemoteFixture(
      {},
      {
        startContainerRemote: vi.fn(async () => server),
        configureContainerSsh: vi.fn(),
        cleanupContainerRemote: vi.fn(async () => successfulCleanupResult()),
      },
    );
    await expect(handle.cleanup()).resolves.toEqual<FixtureCleanupResult>({ ok: true, provider: "container", errors: [] });
  });

  it("scenario 4: configureContainerSsh fails after startContainerRemote succeeds — cleanupContainerRemote runs and the original error is rethrown", async () => {
    const server = fakeServer();
    const configureError = new Error("failed to write ssh-remote-command.env");
    const cleanupContainerRemote = vi.fn(async () => successfulCleanupResult());
    const startContainerRemoteFn = vi.fn(async () => server);
    const configureContainerSsh = vi.fn(() => {
      throw configureError;
    });

    await expect(
      createContainerRemoteFixture(
        {},
        { startContainerRemote: startContainerRemoteFn, configureContainerSsh, cleanupContainerRemote },
      ),
    ).rejects.toBe(configureError);

    expect(cleanupContainerRemote).toHaveBeenCalledTimes(1);
    expect(cleanupContainerRemote).toHaveBeenCalledWith(server);
  });

  it("does not call cleanupContainerRemote when startContainerRemote itself fails (nothing complete to clean up here — startContainerRemote already rolled back its own partial state)", async () => {
    const startError = new Error("startContainerRemote failed");
    const cleanupContainerRemote = vi.fn(async () => successfulCleanupResult());
    await expect(
      createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => {
            throw startError;
          }),
          configureContainerSsh: vi.fn(),
          cleanupContainerRemote,
        },
      ),
    ).rejects.toBe(startError);
    expect(cleanupContainerRemote).not.toHaveBeenCalled();
  });

  it("does not let a cleanup failure during the configureContainerSsh-failure path mask the original error", async () => {
    const server = fakeServer();
    const configureError = new Error("configure failed");
    await expect(
      createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => server),
          configureContainerSsh: vi.fn(() => {
            throw configureError;
          }),
          cleanupContainerRemote: vi.fn(async () => {
            throw new Error("cleanup also failed");
          }),
        },
      ),
    ).rejects.toBe(configureError);
  });

  // ── Atomic-init cleanup diagnostics (Stage 3F.5.4-R2's defect-3 fix) ──────
  //
  // Previously the configureContainerSsh-failure path called
  // cleanupContainerRemote() only to discard its outcome
  // (`.catch(() => {})`) before rethrowing — a caller diagnosing "why did
  // the fixture fail to start" had no idea whether the container it left
  // running was actually cleaned up. These prove the original error stays
  // primary while cleanup's outcome (success, failure, or a thrown cleanup
  // error) is attached as a non-replacing `cleanupDiagnostics` property.

  it("attaches no cleanupDiagnostics when the post-failure cleanup fully succeeds", async () => {
    const server = fakeServer();
    const configureError = new Error("failed to write ssh-remote-command.env");
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => server),
          configureContainerSsh: vi.fn(() => {
            throw configureError;
          }),
          cleanupContainerRemote: vi.fn(async () => successfulCleanupResult()),
        },
      );
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBe(configureError);
    expect(caught?.cleanupDiagnostics).toBeUndefined();
  });

  it("attaches cleanupDiagnostics — without replacing the original error — when the post-failure cleanup is not conclusively successful", async () => {
    const server = fakeServer();
    const configureError = new Error("failed to write ssh-remote-command.env");
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => server),
          configureContainerSsh: vi.fn(() => {
            throw configureError;
          }),
          cleanupContainerRemote: vi.fn(async () =>
            successfulCleanupResult({
              containerVerifiedAbsent: false,
              errors: ["container still present after removal attempt"],
            }),
          ),
        },
      );
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBe(configureError);
    expect(caught?.message).toBe("failed to write ssh-remote-command.env");
    expect(caught?.cleanupDiagnostics?.some((d) => d.includes("containerVerifiedAbsent=false"))).toBe(true);
    expect(caught?.cleanupDiagnostics?.some((d) => d.includes("container still present after removal attempt"))).toBe(
      true,
    );
  });

  it("attaches a diagnostic when cleanup itself throws, while the original error stays primary", async () => {
    const server = fakeServer();
    const configureError = new Error("failed to write ssh-remote-command.env");
    const cleanupThrow = new Error("cleanupContainerRemote itself threw");
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => server),
          configureContainerSsh: vi.fn(() => {
            throw configureError;
          }),
          cleanupContainerRemote: vi.fn(async () => {
            throw cleanupThrow;
          }),
        },
      );
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBe(configureError);
    expect(caught?.cleanupDiagnostics?.some((d) => d.includes("cleanup itself threw"))).toBe(true);
    expect(caught?.cleanupDiagnostics?.some((d) => d.includes("cleanupContainerRemote itself threw"))).toBe(true);
  });

  it("wraps a non-Error value thrown by configureContainerSsh in an Error, preserving the original value as cause", async () => {
    const server = fakeServer();
    let caught: ErrorWithCleanupDiagnostics | undefined;
    try {
      await createContainerRemoteFixture(
        {},
        {
          startContainerRemote: vi.fn(async () => server),
          configureContainerSsh: vi.fn(() => {
            throw "a raw string failure";
          }),
          cleanupContainerRemote: vi.fn(async () => successfulCleanupResult()),
        },
      );
    } catch (error) {
      caught = error as ErrorWithCleanupDiagnostics;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toBe("a raw string failure");
    expect(caught?.cause).toBe("a raw string failure");
  });
});

// ── Stage 3F.5.8A: host backend selection ────────────────────────────────────

describe("resolveContainerHostKind", () => {
  it("win32 -> windows-wsl2", () => {
    expect(resolveContainerHostKind("win32")).toBe("windows-wsl2");
  });

  it("linux -> linux-native", () => {
    expect(resolveContainerHostKind("linux")).toBe("linux-native");
  });

  it("darwin -> throws, mentioning the native fallback, before any WSL/Docker invocation is possible", () => {
    expect(() => resolveContainerHostKind("darwin")).toThrow(
      /no backend for platform "darwin".*RIS_E2E_GIT_REMOTE_PROVIDER=native/s,
    );
  });

  it("an unrecognized platform value throws the same way darwin does", () => {
    expect(() => resolveContainerHostKind("aix")).toThrow(/no backend for platform "aix"/);
  });
});

describe("createContainerHostBackend", () => {
  it("win32 selects a windows-wsl2 backend", () => {
    const backend = createContainerHostBackend("win32");
    expect(backend.kind).toBe("windows-wsl2");
    expect(backend.platform).toBe("win32");
  });

  it("linux selects a linux-native backend", () => {
    const backend = createContainerHostBackend("linux");
    expect(backend.kind).toBe("linux-native");
    expect(backend.platform).toBe("linux");
    expect(backend.describe()).toBe("native Linux Docker");
  });

  it("darwin fails clearly, without constructing either backend", () => {
    expect(() => createContainerHostBackend("darwin")).toThrow(/no backend for platform "darwin"/);
  });

  it("a linux-native backend's describe()/buildFailureHint() never mention WSL", () => {
    const backend = createContainerHostBackend("linux");
    expect(backend.describe()).not.toMatch(/wsl/i);
    expect(backend.buildFailureHint()).not.toMatch(/wsl/i);
    expect(backend.buildFailureHint()).toMatch(/docker group|rootless/i);
  });

  it("a windows-wsl2 backend's buildFailureHint() mentions the WSL automount / RIS_E2E_WSL_DISTRO override", () => {
    const backend = createContainerHostBackend("win32");
    expect(backend.buildFailureHint()).toMatch(/RIS_E2E_WSL_DISTRO/);
  });

  it("linux backend's execDocker/execDockerWithStdin refuse to run before preflight() has succeeded (internal-error guard)", async () => {
    const backend = createContainerHostBackend("linux");
    await expect(backend.execDocker(["version"])).rejects.toThrow(/used before preflight\(\) succeeded/);
    await expect(backend.execDockerWithStdin(["exec"], "data")).rejects.toThrow(/used before preflight\(\) succeeded/);
  });

  it("linux backend resolveBuildContext/resolveBindSource return the host path unchanged (no /mnt/<drive> translation)", async () => {
    const backend = createContainerHostBackend("linux");
    expect(await backend.resolveBuildContext("/home/user/project/fixture")).toBe("/home/user/project/fixture");
    expect(await backend.resolveBindSource("/tmp/ris-wdio-abc/git")).toBe("/tmp/ris-wdio-abc/git");
  });

  it("linux backend resolveBuildContext/resolveBindSource reject a relative path", async () => {
    const backend = createContainerHostBackend("linux");
    await expect(backend.resolveBuildContext("relative/path")).rejects.toThrow(/expected an absolute Linux path/);
    await expect(backend.resolveBindSource("../also-relative")).rejects.toThrow(/expected an absolute Linux path/);
  });

  it("linux backend startKeepAlive/stopKeepAlive are safe, inert no-ops (no WSL2-VM concept on Linux)", () => {
    const backend = createContainerHostBackend("linux");
    expect(() => backend.startKeepAlive()).not.toThrow();
    expect(() => backend.stopKeepAlive()).not.toThrow();
    expect(() => backend.stopKeepAlive()).not.toThrow(); // idempotent
  });
});

// ── Stage 3F.5.8A: Linux-native path handling ────────────────────────────────

describe("assertLinuxAbsolutePath", () => {
  it("returns an absolute path unchanged", () => {
    expect(assertLinuxAbsolutePath("/home/user/project")).toBe("/home/user/project");
  });

  it("accepts a path containing spaces", () => {
    expect(assertLinuxAbsolutePath("/home/user/my project/fixture")).toBe("/home/user/my project/fixture");
  });

  it("accepts a path containing parentheses", () => {
    expect(assertLinuxAbsolutePath("/home/user/project (copy)/fixture")).toBe("/home/user/project (copy)/fixture");
  });

  it("accepts a path containing non-ASCII characters", () => {
    expect(assertLinuxAbsolutePath("/home/usér/pröject/fixture")).toBe("/home/usér/pröject/fixture");
  });

  it("accepts a path with repeated separators, unchanged (Docker/the OS both tolerate this)", () => {
    expect(assertLinuxAbsolutePath("/home//user///project")).toBe("/home//user///project");
  });

  it("accepts a path with a trailing separator, unchanged", () => {
    expect(assertLinuxAbsolutePath("/home/user/project/")).toBe("/home/user/project/");
  });

  it("rejects a relative path", () => {
    expect(() => assertLinuxAbsolutePath("relative/path")).toThrow(/expected an absolute Linux path/);
  });

  it("rejects a bare filename", () => {
    expect(() => assertLinuxAbsolutePath("fixture")).toThrow(/expected an absolute Linux path/);
  });

  it("rejects a Windows-style absolute path (not a Linux absolute path)", () => {
    expect(() => assertLinuxAbsolutePath("C:\\Users\\dev\\project")).toThrow(/expected an absolute Linux path/);
  });
});

describe("classifyLinuxExecError", () => {
  it("classifies a structured ENOENT (missing docker executable) distinctly from stderr-text cases", () => {
    const enoent = Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" });
    expect(classifyLinuxExecError(enoent)).toMatch(/Docker CLI is not installed/);
  });

  it("classifies a daemon-unavailable stderr the same way the Windows backend does", () => {
    const error = Object.assign(new Error("failed"), { stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" });
    expect(classifyLinuxExecError(error)).toBe("Docker daemon is not running");
  });

  it("classifies a permission-denied stderr the same way the Windows backend does", () => {
    const error = Object.assign(new Error("failed"), { stderr: "Got permission denied while trying to connect to the Docker daemon socket" });
    expect(classifyLinuxExecError(error)).toBe("current user lacks Docker permissions (not in the docker group)");
  });

  it("falls back to 'unknown Docker error' for an unrecognized failure", () => {
    const error = Object.assign(new Error("failed"), { stderr: "some completely unrelated failure" });
    expect(classifyLinuxExecError(error)).toBe("unknown Docker error");
  });

  it("never produces WSL-specific wording for any classification", () => {
    const cases = [
      Object.assign(new Error("x"), { code: "ENOENT" }),
      Object.assign(new Error("x"), { stderr: "Cannot connect to the Docker daemon" }),
      Object.assign(new Error("x"), { stderr: "permission denied" }),
      Object.assign(new Error("x"), { stderr: "anything else" }),
    ];
    for (const error of cases) {
      expect(classifyLinuxExecError(error)).not.toMatch(/wsl/i);
    }
  });
});

// ── Stage 3F.5.8A-R1: real exec-wrapper → classifier chain ──────────────────
//
// The `classifyLinuxExecError` tests above only prove the classifier logic
// given a hand-constructed error shape. That is insufficient on its own: it
// never proves `execFileP` (the actual production wrapper every real Docker
// call goes through) preserves `code` onto the *rejected* error in the first
// place — which was, in fact, a real bug (the `code` field was silently
// dropped before this repair, so a genuinely missing `docker` executable
// misclassified as "unknown Docker error"). This test exercises the real
// chain end to end: a real `execFile` call against a definitely-nonexistent
// executable, a real Node ENOENT, through the real `execFileP` wrapper, into
// the real `classifyLinuxExecError`. No real Docker required — the
// executable name is generated to guarantee it is never on `PATH`, and
// nothing here modifies `PATH` globally.
describe("execFileP real execution-chain (Stage 3F.5.8A-R1)", () => {
  it("preserves the structured ENOENT code and cause through the real wrapper, and classifies correctly", async () => {
    const missingExecutable = `ris-e2e-definitely-nonexistent-${process.pid}-${Date.now()}`;
    let caught: unknown;
    try {
      await execFileP(missingExecutable, ["--version"]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const wrapped = caught as NodeJS.ErrnoException & { cause?: unknown };
    expect(wrapped.code).toBe("ENOENT");
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect((wrapped.cause as NodeJS.ErrnoException).code).toBe("ENOENT");
    expect(classifyLinuxExecError(wrapped)).toMatch(/Docker CLI is not installed/);
  });
});

// ── Stage 3F.5.8A-R1: spawnWithStdin structured process helper ──────────────
//
// Exercises the real spawn/stdin/stderr/exit-code plumbing both backends'
// execDockerWithStdin ultimately runs through, using `node` itself as a
// deterministic local executable (already required to run this test suite)
// rather than Docker — every test here must pass with no Docker installed.
describe("spawnWithStdin (Stage 3F.5.8A-R1)", () => {
  async function captureRejection(promise: Promise<void>): Promise<unknown> {
    try {
      await promise;
      return undefined;
    } catch (error) {
      return error;
    }
  }

  it("rejects with a structured DockerCommandError preserving ENOENT for a missing executable", async () => {
    const missingExecutable = `ris-e2e-definitely-nonexistent-${process.pid}-${Date.now()}`;
    const error = await captureRejection(
      spawnWithStdin(missingExecutable, ["info"], "irrelevant", "test host", ["fake-docker-arg"]),
    );
    expect(error).toBeInstanceOf(Error);
    expect(isDockerCommandError(error)).toBe(true);
    const wrapped = error as NodeJS.ErrnoException & { dockerArgs: string[]; hostDescription: string };
    expect(wrapped.code).toBe("ENOENT");
    expect(wrapped.dockerArgs).toEqual(["fake-docker-arg"]);
    expect(wrapped.hostDescription).toBe("test host");
  });

  it("preserves exit code, stderr, and dockerArgs when the process exits non-zero", async () => {
    const script = "process.stderr.write('boom'); process.exit(3);";
    const error = await captureRejection(
      spawnWithStdin("node", ["-e", script], "unused-stdin", "test host", ["exec", "-i", "c1"]),
    );
    expect(isDockerCommandError(error)).toBe(true);
    const wrapped = error as { exitCode: number | null; stderr: string; dockerArgs: string[]; code?: string };
    expect(wrapped.exitCode).toBe(3);
    expect(wrapped.stderr).toContain("boom");
    expect(wrapped.dockerArgs).toEqual(["exec", "-i", "c1"]);
    expect(wrapped.code).toBeUndefined();
  });

  it("delivers the expected stdin data to the child and resolves on success", async () => {
    const expected = "expected-stdin-payload";
    const script = `
      let data = "";
      process.stdin.on("data", (chunk) => { data += chunk; });
      process.stdin.on("end", () => {
        process.exitCode = data === ${JSON.stringify(expected)} ? 0 : 1;
      });
    `;
    await expect(spawnWithStdin("node", ["-e", script], expected, "test host", [])).resolves.toBeUndefined();
  });

  it("rejects when the child receives different stdin data than expected (mismatch proves stdin actually plumbed through)", async () => {
    const script = `
      let data = "";
      process.stdin.on("data", (chunk) => { data += chunk; });
      process.stdin.on("end", () => {
        process.stderr.write("received:" + data);
        process.exitCode = data === "expected-value" ? 0 : 1;
      });
    `;
    const error = await captureRejection(spawnWithStdin("node", ["-e", script], "wrong-value", "test host", []));
    expect(isDockerCommandError(error)).toBe(true);
    expect((error as { stderr: string }).stderr).toContain("received:wrong-value");
  });

  it("bounds accumulated stderr instead of growing it without limit", async () => {
    const script = "process.stderr.write('a'.repeat(500000)); process.exit(1);";
    const error = await captureRejection(spawnWithStdin("node", ["-e", script], "", "test host", []));
    const wrapped = error as { stderr: string };
    expect(wrapped.stderr.length).toBeLessThan(500000);
    expect(wrapped.stderr).toContain("truncated");
  });

  it("never invokes a shell — arguments containing shell metacharacters reach the child as literal, unsplit argv entries", async () => {
    const trickyArg = "hello; touch /tmp/ris-e2e-should-not-exist-$$; echo && rm -rf /";
    const script = "process.stderr.write(JSON.stringify(process.argv.slice(1))); process.exit(1);";
    const error = await captureRejection(spawnWithStdin("node", ["-e", script, trickyArg], "", "test host", []));
    const wrapped = error as { stderr: string };
    const receivedArgv = JSON.parse(wrapped.stderr) as string[];
    expect(receivedArgv).toEqual([trickyArg]);
  });
});

// ── Stage 3F.5.8A: real native Linux Docker (this test file's one exception
// to "nothing here spawns wsl.exe or docker" — see below) ───────────────────
//
// Every other describe block in this file deliberately never touches a real
// process (see this file's own module doc comment) — the container
// lifecycle's *orchestration* is what's under test there, exercised through
// injected fakes. This block is different on purpose: it is the one place
// that proves the Linux backend's `execDocker`/`preflight` actually reach a
// real `docker` binary correctly (no shell, right executable, right
// argument shape) — the equivalent of Stage 3F.5.7-R1's own "Windows
// Regression" validation, but for Linux, in-repo, and re-run on every CI
// execution of this suite rather than only once by hand. Skips itself
// gracefully (never fails the suite) when no `docker` CLI is on `PATH` —
// this whole file must stay runnable in environments without Docker.
describe("linux-native backend against a real local Docker daemon", () => {
  let dockerAvailable = false;

  beforeEach(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("docker", ["info"], { stdio: "ignore" });
        proc.on("error", reject);
        proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      });
      dockerAvailable = true;
    } catch {
      dockerAvailable = false;
    }
  });

  it("preflight() succeeds against a real reachable Docker daemon", async () => {
    if (!dockerAvailable) return;
    const backend = createContainerHostBackend("linux");
    await expect(backend.preflight()).resolves.toEqual({ ok: true, detail: "native Linux Docker" });
  });

  it("execDocker(['version']) runs the real docker CLI directly (no wsl.exe involved) and returns real stdout", async () => {
    if (!dockerAvailable) return;
    const backend = createContainerHostBackend("linux");
    await backend.preflight();
    const { stdout } = await backend.execDocker(["version", "--format", "{{.Client.Version}}"]);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it("execDocker against a genuinely missing container produces a DockerCommandError classified as not-found", async () => {
    if (!dockerAvailable) return;
    const backend = createContainerHostBackend("linux");
    await backend.preflight();
    let caught: unknown;
    try {
      await backend.execDocker(["inspect", "ris-e2e-nonexistent-container-for-unit-test"]);
    } catch (error) {
      caught = error;
    }
    expect(isDockerCommandError(caught)).toBe(true);
    expect(isDockerCommandError(caught) && isDockerNotFoundError(caught.stderr)).toBe(true);
    expect(isDockerCommandError(caught) && caught.hostDescription).toBe("native Linux Docker");
  });
});
