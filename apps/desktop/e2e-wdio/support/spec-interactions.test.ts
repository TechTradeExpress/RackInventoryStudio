// @vitest-environment node
/**
 * Unit tests for spec-interactions helpers: clickElementProtocol and its
 * callers (clickNav, clickWhenVisible). browser is mocked so these tests run
 * without a WDIO session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wdio/globals", () => ({
  browser: {
    waitUntil: vi.fn(),
    execute: vi.fn(),
    findElement: vi.fn(),
    elementClick: vi.fn(),
  },
}));

import { clickElementProtocol, clickNav, clickWhenVisible, waitForFormCloseOrError } from "./spec-interactions";
import { browser } from "@wdio/globals";

const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

describe("clickElementProtocol", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("finds the element via the WebDriver protocol then clicks it by element id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.findElement).mockResolvedValue({ [W3C_ELEMENT_KEY]: "elem-123" } as any);
    vi.mocked(browser.elementClick).mockResolvedValue(undefined as never);

    await clickElementProtocol('[data-testid="foo"]');

    expect(browser.findElement).toHaveBeenCalledWith("css selector", '[data-testid="foo"]');
    expect(browser.elementClick).toHaveBeenCalledWith("elem-123");
  });

  it("throws a clear error and never calls elementClick when the element is not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.findElement).mockResolvedValue(null as any);

    await expect(clickElementProtocol('[data-testid="missing"]')).rejects.toThrow(/element not found/);
    expect(browser.elementClick).not.toHaveBeenCalled();
  });
});

describe("clickNav", () => {
  beforeEach(() => {
    vi.mocked(browser.execute).mockResolvedValue(true as never);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => { await predicate(); return undefined as any; },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.findElement).mockResolvedValue({ [W3C_ELEMENT_KEY]: "nav-elem" } as any);
    vi.mocked(browser.elementClick).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for visibility (isSelectorVisible via execute) then clicks via the protocol path", async () => {
    await clickNav("locations");

    expect(browser.execute).toHaveBeenCalledWith(expect.any(Function), '[data-testid="nav-locations"]');
    expect(browser.findElement).toHaveBeenCalledWith("css selector", '[data-testid="nav-locations"]');
    expect(browser.elementClick).toHaveBeenCalledWith("nav-elem");
  });

  it("does not click before the visibility wait resolves", async () => {
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
      return { [W3C_ELEMENT_KEY]: "nav-elem" } as any;
    });

    await clickNav("racks");

    expect(callOrder).toEqual(["waitUntil", "findElement"]);
  });
});

describe("clickWhenVisible", () => {
  beforeEach(() => {
    vi.mocked(browser.execute).mockResolvedValue(true as never);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => { await predicate(); return undefined as any; },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.findElement).mockResolvedValue({ [W3C_ELEMENT_KEY]: "btn-elem" } as any);
    vi.mocked(browser.elementClick).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("waits for visibility then clicks via the protocol path", async () => {
    await clickWhenVisible("location-add-btn");

    expect(browser.findElement).toHaveBeenCalledWith("css selector", '[data-testid="location-add-btn"]');
    expect(browser.elementClick).toHaveBeenCalledWith("btn-elem");
  });
});

describe("waitForFormCloseOrError", () => {
  type DomResult = { closed: boolean; errorText: string | null };

  function setupWaitUntil(returnValue: DomResult) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(browser.execute).mockResolvedValue(returnValue as any);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => { await predicate(); return undefined as any; },
    );
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves immediately when the modal button is absent from DOM (closed: true, no error)", async () => {
    setupWaitUntil({ closed: true, errorText: null });
    await expect(waitForFormCloseOrError("location-form-submit")).resolves.toBeUndefined();
    expect(browser.execute).toHaveBeenCalledOnce();
  });

  it("resolves when the modal is closed (display:none or visibility:hidden → closed: true)", async () => {
    setupWaitUntil({ closed: true, errorText: null });
    await expect(waitForFormCloseOrError("rack-form-submit")).resolves.toBeUndefined();
  });

  it("throws immediately when a visible error banner is returned (non-empty errorText)", async () => {
    setupWaitUntil({ closed: false, errorText: "Name already exists" });
    await expect(waitForFormCloseOrError("model-form-submit")).rejects.toThrow(
      /Form submit failed.*Name already exists/,
    );
  });

  it("throws immediately when error banner text is empty string", async () => {
    setupWaitUntil({ closed: false, errorText: "" });
    await expect(waitForFormCloseOrError("device-form-submit")).rejects.toThrow(
      /Form submit failed/,
    );
  });

  it("does not throw when modal is still visible but there is no error banner (closed: false, errorText: null)", async () => {
    // waitUntil mock calls predicate once and resolves; closed=false returns false from predicate.
    // No throw should happen.
    setupWaitUntil({ closed: false, errorText: null });
    // The mocked waitUntil does not actually loop — it just resolves after one call.
    // We verify that no error was thrown (the predicate returned false, not throw).
    await expect(waitForFormCloseOrError("some-submit")).resolves.toBeUndefined();
    expect(browser.execute).toHaveBeenCalledOnce();
  });

  it("uses a single browser.execute() call per poll iteration — no $() or getText()", async () => {
    setupWaitUntil({ closed: true, errorText: null });
    await waitForFormCloseOrError("location-form-submit");
    // Only execute() should have been called; $ / getText / isDisplayed not even on mock
    expect(browser.execute).toHaveBeenCalledOnce();
  });

  it("passes the correct selector to browser.execute()", async () => {
    setupWaitUntil({ closed: true, errorText: null });
    await waitForFormCloseOrError("my-submit-btn");
    expect(browser.execute).toHaveBeenCalledWith(
      expect.any(Function),
      '[data-testid="my-submit-btn"]',
    );
  });

  it("passes a 30 s timeout to waitUntil by default", async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    vi.mocked(browser.execute).mockResolvedValue({ closed: true, errorText: null } as never);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown, opts?: unknown) => {
        capturedOpts = opts as Record<string, unknown>;
        await predicate();
        return undefined as any;
      },
    );
    await waitForFormCloseOrError("form-submit");
    expect(capturedOpts?.["timeout"]).toBe(30_000);
  });

  it("includes the submitTestId in the timeout message", async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    vi.mocked(browser.execute).mockResolvedValue({ closed: true, errorText: null } as never);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown, opts?: unknown) => {
        capturedOpts = opts as Record<string, unknown>;
        await predicate();
        return undefined as any;
      },
    );
    await waitForFormCloseOrError("location-form-submit");
    expect(String(capturedOpts?.["timeoutMsg"])).toContain("location-form-submit");
  });

  it("accepts a custom timeout option", async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    vi.mocked(browser.execute).mockResolvedValue({ closed: true, errorText: null } as never);
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown, opts?: unknown) => {
        capturedOpts = opts as Record<string, unknown>;
        await predicate();
        return undefined as any;
      },
    );
    await waitForFormCloseOrError("rack-form-submit", { timeout: 60_000 });
    expect(capturedOpts?.["timeout"]).toBe(60_000);
  });
});
