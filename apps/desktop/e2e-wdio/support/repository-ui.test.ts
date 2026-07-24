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
  },
}));

import { canonicalPath, waitForEnabled } from "./repository-ui";
import { browser } from "@wdio/globals";

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
