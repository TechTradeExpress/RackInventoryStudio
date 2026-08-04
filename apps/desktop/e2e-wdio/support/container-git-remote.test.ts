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
import { describe, expect, it, vi } from "vitest";
import {
  FIXTURE_LABEL,
  assertSafeIdentifier,
  buildCleanupArgs,
  buildContainerName,
  buildContainerSshRemoteUrl,
  buildDockerRunArgs,
  buildImageTag,
  classifyDockerError,
  cleanupContainerRemote,
  cleanupOrphanedContainers,
  computeCurrentFixtureImageTag,
  computeFixtureContentHash,
  createContainerRemoteFixture,
  decodeWslMetaOutput,
  ensureImageBuilt,
  generateRunId,
  isSafeIdentifier,
  parsePublishedPort,
  parseWslList,
  resolveGitRemoteProvider,
  resolveWslDistroOverride,
  rollbackPartialContainerFixture,
  selectDistribution,
  shouldForceRebuild,
  startContainerRemote,
  windowsPathToWslMountPath,
  type CleanupResult,
  type ContainerOpsDeps,
  type ContainerSshRemoteServer,
  type FixtureSourceFile,
  type PartialContainerFixtureState,
  type WslDistribution,
} from "./container-git-remote";

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
  const fakeMountPath = "/mnt/c/fake/fixture/dir";

  it("reuses an existing image when the exact content-hash tag already exists (does not rebuild)", async () => {
    const expectedTag = computeCurrentFixtureImageTag(sampleFiles);
    const imageExists = vi.fn(async (_distro: string, tag: string) => tag === expectedTag);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt("Ubuntu", false, sampleFiles, {
      imageExists,
      buildImage,
      resolveMountPath: () => fakeMountPath,
    });
    expect(tag).toBe(expectedTag);
    expect(buildImage).not.toHaveBeenCalled();
  });

  it("builds when no image with the exact content-hash tag exists", async () => {
    const imageExists = vi.fn(async () => false);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt("Ubuntu", false, sampleFiles, {
      imageExists,
      buildImage,
      resolveMountPath: () => fakeMountPath,
    });
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(buildImage).toHaveBeenCalledWith("Ubuntu", tag, fakeMountPath, expect.any(String));
  });

  it("an existing old-hash tag does not satisfy a new source hash — a build still runs for the new tag", async () => {
    const oldTag = "ris-e2e-git-ssh-server:aaaaaaaaaaaa";
    const imageExists = vi.fn(async (_distro: string, tag: string) => tag === oldTag);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt("Ubuntu", false, sampleFiles, {
      imageExists,
      buildImage,
      resolveMountPath: () => fakeMountPath,
    });
    expect(tag).not.toBe(oldTag);
    expect(buildImage).toHaveBeenCalledTimes(1);
    expect(buildImage).toHaveBeenCalledWith("Ubuntu", tag, fakeMountPath, expect.any(String));
  });

  it("forced rebuild rebuilds the exact same content-hash tag even when it already exists", async () => {
    const expectedTag = computeCurrentFixtureImageTag(sampleFiles);
    const imageExists = vi.fn(async () => true);
    const buildImage = vi.fn(async () => {});
    const tag = await ensureImageBuilt("Ubuntu", true, sampleFiles, {
      imageExists,
      buildImage,
      resolveMountPath: () => fakeMountPath,
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
      ensureImageBuilt("Ubuntu", false, sampleFiles, { imageExists, buildImage, resolveMountPath: () => fakeMountPath }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("docker build exploded"),
      cause: underlying,
    });
  });
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
  it("defaults to native when unset", () => {
    expect(resolveGitRemoteProvider({})).toBe("native");
  });

  it("defaults to native for an empty string", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "" })).toBe("native");
  });

  it("accepts an explicit native", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "native" })).toBe("native");
  });

  it("accepts container", () => {
    expect(resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "container" })).toBe("container");
  });

  it("throws loudly on an unrecognized value rather than silently defaulting", () => {
    expect(() => resolveGitRemoteProvider({ RIS_E2E_GIT_REMOTE_PROVIDER: "docker" })).toThrow(
      /invalid RIS_E2E_GIT_REMOTE_PROVIDER="docker"/,
    );
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
    const deps: Pick<
      ContainerOpsDeps,
      "collectDiagnostics" | "removeContainer" | "removeWorkDir" | "clearSshConfig" | "stopKeepAlive"
    > = {
      collectDiagnostics: vi.fn(async (distro: string, name: string) => {
        calls.push(`collectDiagnostics(${distro},${name})`);
        return "fake diagnostics";
      }),
      removeContainer: vi.fn(async (distro: string, name: string) => {
        calls.push(`removeContainer(${distro},${name})`);
      }),
      removeWorkDir: vi.fn(async (workDir: string) => {
        calls.push(`removeWorkDir(${workDir})`);
      }),
      clearSshConfig: vi.fn(() => {
        calls.push("clearSshConfig()");
      }),
      stopKeepAlive: vi.fn(() => {
        calls.push("stopKeepAlive()");
      }),
      ...overrides,
    };
    return { deps, calls };
  }

  it("is safe (no-op) when the state is entirely empty", async () => {
    const { deps } = fakeDeps();
    const diagnostics = await rollbackPartialContainerFixture({}, deps);
    expect(diagnostics).toEqual([]);
    expect(deps.removeContainer).not.toHaveBeenCalled();
    expect(deps.removeWorkDir).not.toHaveBeenCalled();
    expect(deps.stopKeepAlive).not.toHaveBeenCalled();
  });

  it("is safe when there is no container (skips diagnostics/removeContainer, still handles the rest)", async () => {
    const keepAlive = {} as ContainerSshRemoteServer["keepAlive"];
    const state: PartialContainerFixtureState = { workDir: "/work/dir", keepAlive };
    const { deps, calls } = fakeDeps();
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.collectDiagnostics).not.toHaveBeenCalled();
    expect(deps.removeContainer).not.toHaveBeenCalled();
    expect(calls).toEqual(["removeWorkDir(/work/dir)", "stopKeepAlive()"]);
  });

  it("is safe when there is no work directory (skips removeWorkDir, still handles the rest)", async () => {
    const keepAlive = {} as ContainerSshRemoteServer["keepAlive"];
    const state: PartialContainerFixtureState = { distro: "Ubuntu", containerName: "c1", keepAlive };
    const { deps, calls } = fakeDeps();
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.removeWorkDir).not.toHaveBeenCalled();
    expect(calls).toEqual(["collectDiagnostics(Ubuntu,c1)", "removeContainer(Ubuntu,c1)", "stopKeepAlive()"]);
  });

  it("follows the documented order: diagnostics -> remove container -> remove workDir -> clear ssh config -> stop keep-alive last", async () => {
    const keepAlive = {} as ContainerSshRemoteServer["keepAlive"];
    const state: PartialContainerFixtureState = {
      distro: "Ubuntu",
      containerName: "c1",
      workDir: "/work/dir",
      keepAlive,
      sshConfigCreated: true,
    };
    const { deps, calls } = fakeDeps();
    await rollbackPartialContainerFixture(state, deps);
    expect(calls).toEqual([
      "collectDiagnostics(Ubuntu,c1)",
      "removeContainer(Ubuntu,c1)",
      "removeWorkDir(/work/dir)",
      "clearSshConfig()",
      "stopKeepAlive()",
    ]);
  });

  it("still stops the keep-alive even when every earlier step fails", async () => {
    const keepAlive = {} as ContainerSshRemoteServer["keepAlive"];
    const state: PartialContainerFixtureState = {
      distro: "Ubuntu",
      containerName: "c1",
      workDir: "/work/dir",
      keepAlive,
      sshConfigCreated: true,
    };
    const { deps } = fakeDeps({
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
    await rollbackPartialContainerFixture(state, deps);
    expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
  });

  it("collects every step failure into the returned diagnostics array, without throwing", async () => {
    const keepAlive = {} as ContainerSshRemoteServer["keepAlive"];
    const state: PartialContainerFixtureState = {
      distro: "Ubuntu",
      containerName: "c1",
      workDir: "/work/dir",
      keepAlive,
    };
    const { deps } = fakeDeps({
      removeContainer: vi.fn(async () => {
        throw new Error("docker rm -f failed");
      }),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
    });
    const result = await rollbackPartialContainerFixture(state, deps);
    expect(result.some((d) => d.includes("docker rm -f failed"))).toBe(true);
    expect(result.some((d) => d.includes("rmdir failed"))).toBe(true);
  });
});

// ── cleanupContainerRemote ordering (Stage 3F.5.4-R1) ────────────────────────

describe("cleanupContainerRemote", () => {
  function fakeServer(overrides: Partial<ContainerSshRemoteServer> = {}): ContainerSshRemoteServer {
    return {
      distro: "Ubuntu",
      containerName: "ris-e2e-git-ssh-abc123",
      runId: "abc123",
      port: 32768,
      username: "git",
      identityPath: "C:\\work\\id_ed25519",
      workDir: "C:\\work",
      keepAlive: {} as ContainerSshRemoteServer["keepAlive"],
      ...overrides,
    };
  }

  function fakeDeps(overrides: Partial<ContainerOpsDeps> = {}) {
    const calls: string[] = [];
    const deps: ContainerOpsDeps = {
      resolveDistribution: vi.fn(async () => "Ubuntu"),
      startKeepAlive: vi.fn(),
      stopKeepAlive: vi.fn(() => {
        calls.push("stopKeepAlive");
      }),
      ensureImageBuilt: vi.fn(async () => "ris-e2e-git-ssh-server:hash"),
      dockerRun: vi.fn(async () => {}),
      dockerPort: vi.fn(async () => "22/tcp -> 127.0.0.1:32768"),
      waitForHealthy: vi.fn(async () => {}),
      collectDiagnostics: vi.fn(async () => "diag"),
      removeContainer: vi.fn(async () => {
        calls.push("removeContainer");
      }),
      checkContainerExists: vi.fn(async () => {
        calls.push("checkContainerExists");
        return false;
      }),
      listFixtureContainers: vi.fn(async () => []),
      removeContainersByIds: vi.fn(async () => {}),
      generateKeypair: vi.fn(async () => {}),
      securePrivateKeyFile: vi.fn(),
      readPublicKey: vi.fn(() => "ssh-ed25519 AAAA"),
      installPublicKey: vi.fn(async () => {}),
      removeWorkDir: vi.fn(async () => {
        calls.push("removeWorkDir");
      }),
      clearSshConfig: vi.fn(() => {
        calls.push("clearSshConfig");
      }),
      ...overrides,
    };
    return { deps, calls };
  }

  it("runs in the documented order: clear ssh config -> remove container -> verify -> remove workDir -> stop keep-alive", async () => {
    const { deps, calls } = fakeDeps();
    await cleanupContainerRemote(fakeServer(), deps);
    expect(calls).toEqual(["clearSshConfig", "removeContainer", "checkContainerExists", "removeWorkDir", "stopKeepAlive"]);
  });

  it("still stops the keep-alive when docker rm -f fails (finally semantics)", async () => {
    const { deps } = fakeDeps({
      removeContainer: vi.fn(async () => {
        throw new Error("docker rm -f failed");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer(), deps);
    expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
    expect(result.keepAliveStopped).toBe(true);
    expect(result.containerRemoved).toBe(false);
    expect(result.errors.some((e) => e.includes("docker rm -f failed"))).toBe(true);
  });

  it("still stops the keep-alive when verification fails and when work-directory removal fails", async () => {
    const { deps } = fakeDeps({
      checkContainerExists: vi.fn(async () => {
        throw new Error("inspect failed");
      }),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
    });
    const result = await cleanupContainerRemote(fakeServer(), deps);
    expect(result.keepAliveStopped).toBe(true);
    expect(result.workDirRemoved).toBe(false);
    expect(result.errors.some((e) => e.includes("inspect failed"))).toBe(true);
    expect(result.errors.some((e) => e.includes("rmdir failed"))).toBe(true);
  });

  it("does not silently treat a container still present after removal as success", async () => {
    const { deps } = fakeDeps({
      checkContainerExists: vi.fn(async () => true),
    });
    const result = await cleanupContainerRemote(fakeServer(), deps);
    expect(result.containerVerifiedAbsent).toBe(false);
    expect(result.errors.some((e) => e.includes("still present"))).toBe(true);
  });

  it("never throws — a fully-failing cleanup still resolves with a structured result", async () => {
    const { deps } = fakeDeps({
      clearSshConfig: vi.fn(() => {
        throw new Error("clear failed");
      }),
      removeContainer: vi.fn(async () => {
        throw new Error("rm failed");
      }),
      checkContainerExists: vi.fn(async () => {
        throw new Error("inspect failed");
      }),
      removeWorkDir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
      stopKeepAlive: vi.fn(() => {
        throw new Error("stop failed");
      }),
    });
    await expect(cleanupContainerRemote(fakeServer(), deps)).resolves.toMatchObject({
      sshConfigCleared: false,
      containerRemoved: false,
      workDirRemoved: false,
      keepAliveStopped: false,
    });
  });

  it("is safe to call twice on the same server", async () => {
    const { deps } = fakeDeps();
    const server = fakeServer();
    await expect(cleanupContainerRemote(server, deps)).resolves.toBeDefined();
    await expect(cleanupContainerRemote(server, deps)).resolves.toBeDefined();
    expect(deps.stopKeepAlive).toHaveBeenCalledTimes(2);
  });
});

// ── cleanupOrphanedContainers: never sweeps unrelated containers ────────────

describe("cleanupOrphanedContainers", () => {
  it("removes exactly the ids the (label-filtered) list call returned, nothing else", async () => {
    const listFixtureContainers = vi.fn(async () => ["abc123", "def456"]);
    const removeContainersByIds = vi.fn(async () => {});
    const result = await cleanupOrphanedContainers("Ubuntu", undefined, { listFixtureContainers, removeContainersByIds });
    expect(result).toEqual(["abc123", "def456"]);
    expect(removeContainersByIds).toHaveBeenCalledWith("Ubuntu", ["abc123", "def456"]);
    expect(removeContainersByIds).toHaveBeenCalledTimes(1);
  });

  it("does not call remove at all when the list is empty (no fallback to 'remove everything')", async () => {
    const listFixtureContainers = vi.fn(async () => []);
    const removeContainersByIds = vi.fn(async () => {});
    const result = await cleanupOrphanedContainers("Ubuntu", undefined, { listFixtureContainers, removeContainersByIds });
    expect(result).toEqual([]);
    expect(removeContainersByIds).not.toHaveBeenCalled();
  });

  it("passes the run id through to the list call for further scoping", async () => {
    const listFixtureContainers = vi.fn(async () => []);
    const removeContainersByIds = vi.fn(async () => {});
    await cleanupOrphanedContainers("Ubuntu", "run1", { listFixtureContainers, removeContainersByIds });
    expect(listFixtureContainers).toHaveBeenCalledWith("Ubuntu", "run1");
  });
});

// ── startContainerRemote: transactional startup / fault injection ───────────

describe("startContainerRemote (fault injection, no real WSL/Docker)", () => {
  const RUN_ROOT_ENV = "RIS_E2E_RUN_ROOT";

  function withRunRoot<T>(fn: () => Promise<T>): Promise<T> {
    const previous = process.env[RUN_ROOT_ENV];
    process.env[RUN_ROOT_ENV] = "C:\\fake-run-root";
    return fn().finally(() => {
      if (previous === undefined) delete process.env[RUN_ROOT_ENV];
      else process.env[RUN_ROOT_ENV] = previous;
    });
  }

  function fakeDeps(overrides: Partial<ContainerOpsDeps> = {}) {
    const keepAlive = { killed: false, exitCode: null, kill: vi.fn() } as unknown as ContainerSshRemoteServer["keepAlive"];
    const deps: ContainerOpsDeps = {
      resolveDistribution: vi.fn(async () => "Ubuntu"),
      startKeepAlive: vi.fn(() => keepAlive),
      stopKeepAlive: vi.fn(),
      ensureImageBuilt: vi.fn(async () => "ris-e2e-git-ssh-server:hash"),
      dockerRun: vi.fn(async () => {}),
      dockerPort: vi.fn(async () => "22/tcp -> 127.0.0.1:32768"),
      waitForHealthy: vi.fn(async () => {}),
      collectDiagnostics: vi.fn(async () => "diag"),
      removeContainer: vi.fn(async () => {}),
      checkContainerExists: vi.fn(async () => false),
      listFixtureContainers: vi.fn(async () => []),
      removeContainersByIds: vi.fn(async () => {}),
      generateKeypair: vi.fn(async () => {}),
      securePrivateKeyFile: vi.fn(),
      readPublicKey: vi.fn(() => "ssh-ed25519 AAAA"),
      installPublicKey: vi.fn(async () => {}),
      removeWorkDir: vi.fn(async () => {}),
      clearSshConfig: vi.fn(),
      ...overrides,
    };
    return { deps, keepAlive };
  }

  it("succeeds and returns a complete server when every step succeeds", () =>
    withRunRoot(async () => {
      const { deps } = fakeDeps();
      const server = await startContainerRemote({}, deps);
      expect(server.port).toBe(32768);
      expect(server.distro).toBe("Ubuntu");
      expect(deps.installPublicKey).toHaveBeenCalledTimes(1);
    }));

  it("scenario 1: docker run succeeds, port parsing fails — container is removed and error is rethrown", () =>
    withRunRoot(async () => {
      const { deps } = fakeDeps({
        dockerPort: vi.fn(async () => "22/tcp -> 0.0.0.0:32768"), // no 127.0.0.1 mapping — unparseable per this fixture's contract
      });
      await expect(startContainerRemote({}, deps)).rejects.toThrow(/could not parse a 127\.0\.0\.1 published port/);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.installPublicKey).not.toHaveBeenCalled();
    }));

  it("scenario 2: container becomes healthy, ssh-keygen fails — container and work dir are rolled back", () =>
    withRunRoot(async () => {
      const keygenError = new Error("ssh-keygen exploded");
      const { deps } = fakeDeps({
        generateKeypair: vi.fn(async () => {
          throw keygenError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(keygenError);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(deps.removeWorkDir).toHaveBeenCalledTimes(1);
      expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.installPublicKey).not.toHaveBeenCalled();
    }));

  it("scenario 3: SSH key generation succeeds, installPublicKey fails — full rollback still runs", () =>
    withRunRoot(async () => {
      const installError = new Error("docker exec tee failed");
      const { deps } = fakeDeps({
        installPublicKey: vi.fn(async () => {
          throw installError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(installError);
      expect(deps.generateKeypair).toHaveBeenCalledTimes(1);
      expect(deps.removeContainer).toHaveBeenCalledTimes(1);
      expect(deps.removeWorkDir).toHaveBeenCalledTimes(1);
      expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
    }));

  it("scenario 8: the original startup error remains the primary thrown error (same instance)", () =>
    withRunRoot(async () => {
      const original = new Error("distinctive original failure");
      const { deps } = fakeDeps({
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
      const { deps } = fakeDeps({
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
      const distroError = new Error("no working WSL2 distribution");
      const { deps } = fakeDeps({
        resolveDistribution: vi.fn(async () => {
          throw distroError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(distroError);
      // Nothing was ever acquired — no container, no work dir, no keep-alive.
      expect(deps.removeContainer).not.toHaveBeenCalled();
      expect(deps.removeWorkDir).not.toHaveBeenCalled();
      expect(deps.stopKeepAlive).not.toHaveBeenCalled();
    }));

  it("stops the keep-alive on rollback even when it was the only resource ever acquired", () =>
    withRunRoot(async () => {
      const imageError = new Error("image build failed");
      const { deps } = fakeDeps({
        ensureImageBuilt: vi.fn(async () => {
          throw imageError;
        }),
      });
      await expect(startContainerRemote({}, deps)).rejects.toBe(imageError);
      expect(deps.stopKeepAlive).toHaveBeenCalledTimes(1);
      expect(deps.removeContainer).not.toHaveBeenCalled();
    }));
});

// ── createContainerRemoteFixture: atomic provider initialization ────────────

describe("createContainerRemoteFixture", () => {
  function fakeServer(): ContainerSshRemoteServer {
    return {
      distro: "Ubuntu",
      containerName: "ris-e2e-git-ssh-abc123",
      runId: "abc123",
      port: 32768,
      username: "git",
      identityPath: "C:\\work\\id_ed25519",
      workDir: "C:\\work",
      keepAlive: {} as ContainerSshRemoteServer["keepAlive"],
    };
  }

  it("returns a ready fixture handle when both steps succeed", async () => {
    const server = fakeServer();
    const handle = await createContainerRemoteFixture(
      {},
      {
        startContainerRemote: vi.fn(async () => server),
        configureContainerSsh: vi.fn(),
        cleanupContainerRemote: vi.fn(async () => ({}) as CleanupResult),
      },
    );
    expect(typeof handle.createBareRemote).toBe("function");
    expect(typeof handle.cleanup).toBe("function");
  });

  it("scenario 4: configureContainerSsh fails after startContainerRemote succeeds — cleanupContainerRemote runs and the original error is rethrown", async () => {
    const server = fakeServer();
    const configureError = new Error("failed to write ssh-remote-command.env");
    const cleanupContainerRemote = vi.fn(async () => ({}) as CleanupResult);
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
    const cleanupContainerRemote = vi.fn(async () => ({}) as CleanupResult);
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

  it("swallows a cleanup failure during the configureContainerSsh-failure path rather than masking the original error", async () => {
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
});
