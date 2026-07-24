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

import { clickElementProtocol, clickNav, clickWhenVisible } from "./spec-interactions";
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
