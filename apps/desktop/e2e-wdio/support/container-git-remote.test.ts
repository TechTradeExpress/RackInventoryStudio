// @vitest-environment node
/**
 * Unit tests for container-git-remote.ts — the containerized Git-over-SSH
 * fixture infrastructure prepared in Stage 3F.5.4's proof of concept.
 *
 * Mirrors git-remote.test.ts's split: pure parsing/construction logic is
 * exercised directly and unconditionally (no WSL/Docker required, no
 * mocking of node:child_process needed — `selectDistribution` and friends
 * take their process-executing dependency as a plain injected function, the
 * same dependency-injection style securePrivateKeyFile/buildSshdConfig
 * already use in git-remote.ts). Nothing in this file spawns wsl.exe or
 * docker — the real end-to-end path is covered separately, on a real
 * Windows+WSL2+Docker host, as this stage's own "Native Windows Git
 * Integration" / "WDIO Proof-of-Concept" validation, not here.
 */
import { describe, expect, it } from "vitest";
import {
  FIXTURE_LABEL,
  assertSafeIdentifier,
  buildCleanupArgs,
  buildContainerName,
  buildContainerSshRemoteUrl,
  buildDockerRunArgs,
  buildImageTag,
  classifyDockerError,
  computeFixtureContentHash,
  decodeWslMetaOutput,
  generateRunId,
  isSafeIdentifier,
  parsePublishedPort,
  parseWslList,
  resolveGitRemoteProvider,
  resolveWslDistroOverride,
  selectDistribution,
  shouldForceRebuild,
  windowsPathToWslMountPath,
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

describe("computeFixtureContentHash", () => {
  it("is deterministic for the same inputs", () => {
    const a = computeFixtureContentHash(["FROM alpine", "ENTRYPOINT foo"]);
    const b = computeFixtureContentHash(["FROM alpine", "ENTRYPOINT foo"]);
    expect(a).toBe(b);
  });

  it("changes when any input content changes", () => {
    const a = computeFixtureContentHash(["FROM alpine:3.20.3"]);
    const b = computeFixtureContentHash(["FROM alpine:3.20.4"]);
    expect(a).not.toBe(b);
  });

  it("returns a 12-character hex string", () => {
    expect(computeFixtureContentHash(["x"])).toMatch(/^[0-9a-f]{12}$/);
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

// ── wsl.exe meta-output decoding ──────────────────────────────────────────────

describe("decodeWslMetaOutput", () => {
  it("decodes UTF-16LE bytes back to the original text", () => {
    const original = "Ubuntu\r\n";
    const buffer = Buffer.from(original, "utf16le");
    expect(decodeWslMetaOutput(buffer)).toBe(original);
  });

  it("strips a leading BOM", () => {
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Ubuntu", "utf16le")]);
    expect(decodeWslMetaOutput(withBom)).toBe("Ubuntu");
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
