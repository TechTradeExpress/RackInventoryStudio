// @vitest-environment node
/**
 * Focused unit tests for the WDIO test-environment helper.
 *
 * Tests that modify process.env use describe.sequential so that they
 * run one at a time and never interfere with each other.
 * Every test that touches env vars saves and restores them in afterEach.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanupOwnedRunRoot,
  initTestEnvironment,
  isStrictChildPath,
  validateOwnedRunRoot,
} from "./test-environment";

// ── Constants mirrored from the module under test ────────────────────────────

const SENTINEL = "ownership-sentinel";
const PREFIX = "ris-wdio-";
const INITIALIZED_MARKER = "RIS_E2E_ENV_INITIALIZED";
const RUN_ROOT_VAR = "RIS_E2E_RUN_ROOT";
const REPO_PARENT_VAR = "RIS_E2E_REPOSITORY_PARENT";
const INITIALIZED_VALUE = "1";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSentinelRoot(): string {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  writeFileSync(join(root, SENTINEL), "ris-wdio-test-environment\n");
  return root;
}

function removeIfExists(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

// ── isStrictChildPath ─────────────────────────────────────────────────────────

describe("isStrictChildPath", () => {
  it("returns true for a direct child", () => {
    expect(isStrictChildPath("/tmp", "/tmp/foo")).toBe(true);
  });

  it("returns true for a deeply nested child", () => {
    expect(isStrictChildPath("/tmp", "/tmp/a/b/c")).toBe(true);
  });

  it("returns false for the same directory", () => {
    expect(isStrictChildPath("/tmp", "/tmp")).toBe(false);
  });

  it("returns false for a sibling reached via ..", () => {
    expect(isStrictChildPath("/tmp/a", "/tmp/b")).toBe(false);
  });

  it("returns false for a parent", () => {
    expect(isStrictChildPath("/tmp/foo", "/tmp")).toBe(false);
  });
});

// ── validateOwnedRunRoot ──────────────────────────────────────────────────────

describe("validateOwnedRunRoot", () => {
  it("does not throw for a valid run root with correct prefix and sentinel", () => {
    const root = makeSentinelRoot();
    try {
      expect(() => validateOwnedRunRoot(root)).not.toThrow();
    } finally {
      removeIfExists(root);
    }
  });

  it("throws when run root is outside tmpdir()", () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), PREFIX));
    // Simulate a path constructed to look like a real root but point to /
    removeIfExists(outsideRoot);
    expect(() => validateOwnedRunRoot("/")).toThrow(/not inside tmpdir/);
  });

  it("throws when basename does not start with ris-wdio-", () => {
    // Create a real child of tmpdir() with a wrong prefix.
    const wrongRoot = mkdtempSync(join(tmpdir(), "wrong-prefix-"));
    writeFileSync(join(wrongRoot, SENTINEL), "test\n");
    try {
      expect(() => validateOwnedRunRoot(wrongRoot)).toThrow(
        /basename does not start with/,
      );
    } finally {
      removeIfExists(wrongRoot);
    }
  });

  it("throws when sentinel is missing", () => {
    // Create a valid-prefix dir without the sentinel.
    const root = mkdtempSync(join(tmpdir(), PREFIX));
    try {
      expect(() => validateOwnedRunRoot(root)).toThrow(
        /ownership sentinel not found/,
      );
    } finally {
      removeIfExists(root);
    }
  });

  it("throws when repositoryParent is outside runRoot", () => {
    const root = makeSentinelRoot();
    const sibling = mkdtempSync(join(tmpdir(), PREFIX));
    try {
      expect(() => validateOwnedRunRoot(root, sibling)).toThrow(
        /repository parent is not inside run root/,
      );
    } finally {
      removeIfExists(root);
      removeIfExists(sibling);
    }
  });

  it("accepts a repositoryParent that is inside runRoot", () => {
    const root = makeSentinelRoot();
    const repoParent = join(root, "repositories");
    mkdirSync(repoParent, { recursive: true });
    try {
      expect(() => validateOwnedRunRoot(root, repoParent)).not.toThrow();
    } finally {
      removeIfExists(root);
    }
  });
});

// ── cleanupOwnedRunRoot ───────────────────────────────────────────────────────

describe("cleanupOwnedRunRoot", () => {
  it("deletes a valid owned run root and returns true", () => {
    const root = makeSentinelRoot();
    const deleted = cleanupOwnedRunRoot(root);
    expect(deleted).toBe(true);
    expect(existsSync(root)).toBe(false);
  });

  it("preserves the run root when keepTemp is true and returns false", () => {
    const root = makeSentinelRoot();
    try {
      const deleted = cleanupOwnedRunRoot(root, { keepTemp: true });
      expect(deleted).toBe(false);
      expect(existsSync(root)).toBe(true);
    } finally {
      removeIfExists(root);
    }
  });

  it("throws and does not delete when sentinel is missing", () => {
    const root = mkdtempSync(join(tmpdir(), PREFIX));
    // No sentinel written — guard must prevent deletion.
    try {
      expect(() => cleanupOwnedRunRoot(root)).toThrow(
        /ownership sentinel not found/,
      );
      // Directory still exists because cleanup was blocked.
      expect(existsSync(root)).toBe(true);
    } finally {
      removeIfExists(root);
    }
  });

  it("throws and does not delete when basename prefix is wrong", () => {
    const root = mkdtempSync(join(tmpdir(), "wrong-prefix-"));
    writeFileSync(join(root, SENTINEL), "test\n");
    try {
      expect(() => cleanupOwnedRunRoot(root)).toThrow(
        /basename does not start with/,
      );
      expect(existsSync(root)).toBe(true);
    } finally {
      removeIfExists(root);
    }
  });

  it("never removes an unrelated directory (outside tmpdir)", () => {
    // /tmp itself is the parent, so / is definitely outside.
    expect(() => cleanupOwnedRunRoot("/")).toThrow(/not inside tmpdir/);
    // / should still exist.
    expect(existsSync("/")).toBe(true);
  });
});

// ── initTestEnvironment — env-var dependent tests ────────────────────────────

// Save env state once outside sequential so the variable names are visible.
const ENV_KEYS = [
  INITIALIZED_MARKER,
  RUN_ROOT_VAR,
  REPO_PARENT_VAR,
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "APPDATA",
  "LOCALAPPDATA",
  "HOME",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
];

describe.sequential("initTestEnvironment", () => {
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {};
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
    }
    // Start each test with a clean slate of these vars.
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
  });

  it("launcher: creates a run root, sets isolation vars, returns cleanup", () => {
    const cleanup = initTestEnvironment();
    const runRoot = process.env[RUN_ROOT_VAR]!;
    const repoParent = process.env[REPO_PARENT_VAR]!;

    expect(runRoot).toBeTruthy();
    expect(existsSync(runRoot)).toBe(true);
    expect(process.env[INITIALIZED_MARKER]).toBe(INITIALIZED_VALUE);
    expect(repoParent).toBeTruthy();

    // Cleanup should delete the run root.
    cleanup();
    expect(existsSync(runRoot)).toBe(false);
  });

  it("launcher: rejects pre-existing RIS_E2E_REPOSITORY_PARENT without internal marker", () => {
    const foreign = mkdtempSync(join(tmpdir(), "foreign-"));
    try {
      process.env[REPO_PARENT_VAR] = foreign;
      expect(() => initTestEnvironment()).toThrow(
        /Refusing to bypass the isolated WDIO test environment/,
      );
    } finally {
      removeIfExists(foreign);
    }
  });

  it("worker: valid inherited state returns a no-op cleanup", () => {
    // Set up a real owned run root as a launcher would.
    const root = makeSentinelRoot();
    const repoParent = join(root, "repositories");
    mkdirSync(repoParent, { recursive: true });

    try {
      process.env[INITIALIZED_MARKER] = INITIALIZED_VALUE;
      process.env[RUN_ROOT_VAR] = root;
      process.env[REPO_PARENT_VAR] = repoParent;

      const cleanup = initTestEnvironment();

      // Returned cleanup is a no-op — root should survive.
      cleanup();
      expect(existsSync(root)).toBe(true);
    } finally {
      removeIfExists(root);
    }
  });

  it("worker: rejects inherited state when sentinel is missing", () => {
    const root = mkdtempSync(join(tmpdir(), PREFIX));
    // No sentinel — validation should throw.
    const repoParent = join(root, "repositories");
    mkdirSync(repoParent, { recursive: true });

    try {
      process.env[INITIALIZED_MARKER] = INITIALIZED_VALUE;
      process.env[RUN_ROOT_VAR] = root;
      process.env[REPO_PARENT_VAR] = repoParent;

      expect(() => initTestEnvironment()).toThrow(
        /ownership sentinel not found/,
      );
    } finally {
      removeIfExists(root);
    }
  });

  it("worker: throws when RIS_E2E_RUN_ROOT is missing", () => {
    process.env[INITIALIZED_MARKER] = INITIALIZED_VALUE;
    // RUN_ROOT_VAR not set
    expect(() => initTestEnvironment()).toThrow(/RIS_E2E_RUN_ROOT is missing/);
  });

  it("worker: throws when RIS_E2E_REPOSITORY_PARENT is missing", () => {
    const root = makeSentinelRoot();
    try {
      process.env[INITIALIZED_MARKER] = INITIALIZED_VALUE;
      process.env[RUN_ROOT_VAR] = root;
      // REPO_PARENT_VAR not set
      expect(() => initTestEnvironment()).toThrow(
        /RIS_E2E_REPOSITORY_PARENT is missing/,
      );
    } finally {
      removeIfExists(root);
    }
  });
});
