// @vitest-environment node
/**
 * Unit tests for repository-ui helpers: canonicalPath comparison and
 * waitForEnabled stale-reference behaviour.
 *
 * browser is mocked so these tests run without a WDIO session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("@wdio/globals", () => ({
  browser: {
    waitUntil: vi.fn(),
    execute: vi.fn(),
    $: vi.fn(),
    findElement: vi.fn(),
    elementClick: vi.fn(),
  },
}));

import { canonicalPath, clickWhenEnabled, expectActiveRepositoryPath, waitForEnabled } from "./repository-ui";
import { browser } from "@wdio/globals";

const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

// ── canonicalPath comparison ──────────────────────────────────────────────────

describe("canonicalPath comparison", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ris-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("identical paths compare equal", () => {
    expect(canonicalPath(tmpDir)).toBe(canonicalPath(tmpDir));
  });

  it("trims leading and trailing whitespace before resolving", () => {
    expect(canonicalPath(`  ${tmpDir}  `)).toBe(canonicalPath(tmpDir));
  });

  it("resolves dotdot segments to canonical form", () => {
    const sub = join(tmpDir, "sub");
    mkdirSync(sub);
    expect(canonicalPath(join(sub, ".."))).toBe(canonicalPath(tmpDir));
  });

  it("distinguishes distinct directories", () => {
    const other = mkdtempSync(join(tmpdir(), "ris-test-"));
    try {
      expect(canonicalPath(tmpDir)).not.toBe(canonicalPath(other));
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

// ── waitForEnabled ─────────────────────────────────────────────────────────────

describe("waitForEnabled", () => {
  const mockElement = { _stub: "element" };

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockResolvedValue(true as any);
    vi.mocked(browser.$).mockReturnValue(mockElement as unknown as WebdriverIO.Element);
    // Default: waitUntil immediately invokes the predicate once and resolves.
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => { await predicate(); return undefined as any; },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not call browser.$ before waitUntil resolves", async () => {
    const callOrder: string[] = [];

    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => {
        callOrder.push("waitUntil");
        await predicate();
        return undefined as any;
      },
    );
    vi.mocked(browser.$).mockImplementation(() => {
      callOrder.push("$");
      return mockElement as unknown as WebdriverIO.Element;
    });

    await waitForEnabled("submit-btn");

    expect(callOrder).toEqual(["waitUntil", "$"]);
  });

  it("returns the element reference fetched after the wait", async () => {
    const result = await waitForEnabled("submit-btn");
    expect(result).toBe(mockElement);
  });

  it("passes testId to the execute predicate", async () => {
    await waitForEnabled("my-btn");
    expect(vi.mocked(browser.execute)).toHaveBeenCalledWith(
      expect.any(Function),
      "my-btn",
    );
  });

  it("queries element with the correct data-testid selector", async () => {
    await waitForEnabled("confirm-btn");
    expect(vi.mocked(browser.$)).toHaveBeenCalledWith('[data-testid="confirm-btn"]');
  });
});

// ── clickWhenEnabled ─────────────────────────────────────────────────────────

describe("clickWhenEnabled", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockResolvedValue(true as any);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => { await predicate(); return undefined as any; },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.findElement).mockResolvedValue({ [W3C_ELEMENT_KEY]: "submit-elem" } as any);
    vi.mocked(browser.elementClick).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for the element to be enabled, then clicks via the protocol path (not browser.$().click())", async () => {
    await clickWhenEnabled("submit-btn");

    expect(browser.findElement).toHaveBeenCalledWith("css selector", '[data-testid="submit-btn"]');
    expect(browser.elementClick).toHaveBeenCalledWith("submit-elem");
    expect(browser.$).not.toHaveBeenCalled();
  });

  it("does not click before the enabled-wait resolves", async () => {
    const callOrder: string[] = [];
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => {
        callOrder.push("waitUntil");
        await predicate();
        return undefined as any;
      },
    );
    vi.mocked(browser.findElement).mockImplementation(async () => {
      callOrder.push("findElement");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { [W3C_ELEMENT_KEY]: "submit-elem" } as any;
    });

    await clickWhenEnabled("submit-btn");

    expect(callOrder).toEqual(["waitUntil", "findElement"]);
  });
});

// ── expectActiveRepositoryPath ──────────────────────────────────────────────

describe("expectActiveRepositoryPath", () => {
  let oldDir: string;
  let expectedDir: string;

  beforeEach(() => {
    oldDir = mkdtempSync(join(tmpdir(), "ris-test-old-"));
    expectedDir = mkdtempSync(join(tmpdir(), "ris-test-expected-"));
  });

  afterEach(() => {
    rmSync(oldDir, { recursive: true, force: true });
    rmSync(expectedDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // Simulates real browser.waitUntil: repeatedly invokes the predicate
  // (awaiting it, since expectActiveRepositoryPath's predicate is async)
  // until it returns a truthy value, or throws after a bounded number of
  // attempts (standing in for a real timeout).
  function installLoopingWaitUntilMock(maxAttempts = 5) {
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => {
        for (let i = 0; i < maxAttempts; i++) {
          if (await predicate()) return undefined as any;
        }
        throw new Error("mock waitUntil exhausted without predicate returning true");
      },
    );
  }

  it("does not resolve on the first read of a stale path — succeeds only after a second read reflects the expected path", async () => {
    let executeCallCount = 0;
    // Call pattern per iteration: 1) visibility check (isSelectorVisible), 2) textContent read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockImplementation(async (..._args: unknown[]): Promise<any> => {
      executeCallCount++;
      const isVisibilityCall = executeCallCount % 2 === 1;
      if (isVisibilityCall) return true; // element is visible from the first iteration onward
      // First text read (call #2) returns the stale/old path; second text read
      // (call #4) returns the path that matches expectedPath.
      return executeCallCount === 2 ? oldDir : expectedDir;
    });
    installLoopingWaitUntilMock();

    await expectActiveRepositoryPath(expectedDir);

    // Two full iterations (visibility + text, twice) were required — the
    // helper did not accept the first (stale) read.
    expect(executeCallCount).toBe(4);
  });

  it("recovers from an empty read and a canonicalPath exception before succeeding on a valid read", async () => {
    let executeCallCount = 0;
    // A path string that canonicalPath() (realpathSync.native) will throw on
    // — it does not exist on disk.
    const nonExistentPath = join(tmpdir(), `ris-test-does-not-exist-${Date.now()}`);
    // Call pattern per iteration: 1) visibility check, 2) textContent read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockImplementation(async (..._args: unknown[]): Promise<any> => {
      executeCallCount++;
      const isVisibilityCall = executeCallCount % 2 === 1;
      if (isVisibilityCall) return true; // element visible throughout
      const textReadNumber = executeCallCount / 2;
      if (textReadNumber === 1) return ""; // empty/partial render
      if (textReadNumber === 2) return nonExistentPath; // canonicalPath throws
      return expectedDir; // valid, matches
    });
    installLoopingWaitUntilMock(5);

    await expectActiveRepositoryPath(expectedDir);

    // Three full iterations (visibility + text, three times) were required:
    // the empty read and the canonicalPath-throwing read both had to be
    // treated as "keep polling", not as a hard failure.
    expect(executeCallCount).toBe(6);
  });

  it("throws a clear error naming both the last-displayed and expected path on timeout", async () => {
    let call = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockImplementation(async (..._args: unknown[]): Promise<any> => {
      call++;
      if (call % 2 === 1) return true; // always "visible"
      return oldDir; // never matches expectedDir
    });
    installLoopingWaitUntilMock(3);

    await expect(expectActiveRepositoryPath(expectedDir)).rejects.toThrow(
      new RegExp(`last displayed.*expected`, "s"),
    );
  });
});
