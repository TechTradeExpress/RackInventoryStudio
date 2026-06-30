import { describe, it, expect } from "vitest";
import { computeClonePath, dirNameFromUrl, validateCloneDirName, validateCloneUrl } from "./cloneHelpers";

describe("dirNameFromUrl", () => {
  it("extracts name from HTTPS URL with .git suffix", () => {
    expect(dirNameFromUrl("https://github.com/org/repo.git")).toBe("repo");
  });

  it("extracts name from SSH URL", () => {
    expect(dirNameFromUrl("git@github.com:org/repo.git")).toBe("repo");
  });

  it("extracts name from SSH alias URL", () => {
    expect(dirNameFromUrl("github-ris-test:org/repo.git")).toBe("repo");
  });

  it("extracts name without .git suffix", () => {
    expect(dirNameFromUrl("https://github.com/org/myrepo")).toBe("myrepo");
  });

  it("strips trailing slash before extraction", () => {
    expect(dirNameFromUrl("https://github.com/org/repo/")).toBe("repo");
  });

  it("works with HTTPS URL containing token in userinfo", () => {
    expect(dirNameFromUrl("https://token@github.com/org/repo.git")).toBe("repo");
  });

  it("returns empty string for empty input", () => {
    expect(dirNameFromUrl("")).toBe("");
  });
});

describe("validateCloneDirName", () => {
  it("returns null for a valid simple name", () => {
    expect(validateCloneDirName("my-repo")).toBeNull();
  });

  it("returns error for empty name", () => {
    expect(validateCloneDirName("")).not.toBeNull();
    expect(validateCloneDirName("   ")).not.toBeNull();
  });

  it("returns error for name containing forward slash", () => {
    expect(validateCloneDirName("org/repo")).not.toBeNull();
  });

  it("returns error for name containing backslash", () => {
    expect(validateCloneDirName("org\\repo")).not.toBeNull();
  });

  it("returns error for name containing Windows-forbidden chars", () => {
    expect(validateCloneDirName("repo*")).not.toBeNull();
    expect(validateCloneDirName("repo<name>")).not.toBeNull();
    expect(validateCloneDirName('repo"name')).not.toBeNull();
  });

  it("returns null for valid name with dots, underscores, hyphens", () => {
    expect(validateCloneDirName("my.repo_name-v2")).toBeNull();
  });
});

describe("validateCloneUrl", () => {
  it("returns error for blank URL", () => {
    expect(validateCloneUrl("")).not.toBeNull();
    expect(validateCloneUrl("   ")).not.toBeNull();
  });

  it("returns error for ext:: transport helper", () => {
    expect(validateCloneUrl("ext::sh -c 'touch /tmp/pwned'")).not.toBeNull();
  });

  it("returns error for fd:: transport helper", () => {
    expect(validateCloneUrl("fd::4")).not.toBeNull();
  });

  it("returns error for file:// URL", () => {
    expect(validateCloneUrl("file:///tmp/repo.git")).not.toBeNull();
  });

  it("returns error for http:// URL", () => {
    expect(validateCloneUrl("http://github.com/org/repo.git")).not.toBeNull();
  });

  it("returns error for git:// URL", () => {
    expect(validateCloneUrl("git://github.com/org/repo.git")).not.toBeNull();
  });

  it("returns null for https:// URL", () => {
    expect(validateCloneUrl("https://github.com/org/repo.git")).toBeNull();
  });

  it("returns null for ssh:// URL", () => {
    expect(validateCloneUrl("ssh://git@github.com/org/repo.git")).toBeNull();
  });

  it("returns null for scp-style SSH URL with user", () => {
    expect(validateCloneUrl("git@github.com:org/repo.git")).toBeNull();
  });

  it("returns null for scp-style SSH alias (no user)", () => {
    expect(validateCloneUrl("github-ris-test:org/repo.git")).toBeNull();
  });

  it("error message mentions HTTPS or SSH", () => {
    const msg = validateCloneUrl("ext::bad");
    expect(msg).toContain("HTTPS");
    expect(msg).toContain("SSH");
  });
});

describe("computeClonePath", () => {
  it("joins parent and dirName with forward slash on Unix-style path", () => {
    expect(computeClonePath("/home/user/repos", "my-repo")).toBe("/home/user/repos/my-repo");
  });

  it("joins with backslash when parent uses Windows-style path", () => {
    expect(computeClonePath("C:\\Users\\user\\repos", "my-repo")).toBe(
      "C:\\Users\\user\\repos\\my-repo",
    );
  });

  it("strips trailing slash from parent before joining", () => {
    expect(computeClonePath("/home/user/repos/", "repo")).toBe("/home/user/repos/repo");
  });

  it("returns empty string when parent is empty", () => {
    expect(computeClonePath("", "repo")).toBe("");
  });

  it("returns empty string when dirName is empty", () => {
    expect(computeClonePath("/home/user", "")).toBe("");
  });
});
