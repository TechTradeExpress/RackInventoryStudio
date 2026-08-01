// @vitest-environment node
/**
 * Unit tests for navigateToRackDetail — the shared rack-navigation helper
 * extracted from duplicated local copies in destructive-guards-inventory.e2e.ts
 * and placement-lifecycle.e2e.ts during the Stage 3C spec consolidation.
 * browser is mocked so these tests run without a WDIO session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@wdio/globals", () => ({
  browser: {
    waitUntil: vi.fn(),
    execute: vi.fn(),
    findElement: vi.fn(),
    elementClick: vi.fn(),
    $: vi.fn(),
    $$: vi.fn(),
  },
}));

import { navigateToRackDetail } from "./destructive-ui";
import { browser } from "@wdio/globals";

const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

/** A minimal WebdriverIO.Element-like stub for a row with a <strong> name. */
function makeRow(name: string) {
  return {
    $: vi.fn(async () => ({
      isExisting: vi.fn(async () => true),
      getText: vi.fn(async () => name),
    })),
  };
}

describe("navigateToRackDetail", () => {
  beforeEach(() => {
    // clickNav("locations"): visibility wait via execute, then protocol click.
    vi.mocked(browser.waitUntil).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (predicate: () => unknown) => {
        // Keep calling until the predicate is truthy, mirroring real waitUntil.
        let result = await predicate();
        let guard = 0;
        while (!result && guard < 5) {
          result = await predicate();
          guard++;
        }
        return undefined as any;
      },
    );
    vi.mocked(browser.findElement).mockResolvedValue({ [W3C_ELEMENT_KEY]: "nav-elem" } as any);
    vi.mocked(browser.elementClick).mockResolvedValue(undefined as never);

    // getEntityNamesInRows (used by findRowByExactName) reads names via execute.
    vi.mocked(browser.execute).mockImplementation(async (fn: unknown, ...args: unknown[]) => {
      const fnStr = String(fn);
      if (fnStr.includes("rack-add-btn")) {
        // waitForRackListOrDetail's atomic state check — report "list" so
        // ensureRackListView treats us as already on the rack list (no-op).
        return "list";
      }
      if (args.length > 0 && typeof args[0] === "string") {
        // getEntityNamesInRows(rowSelector) — return names based on which
        // selector is being queried, using the rows registered on browser.$$.
        return [];
      }
      return true;
    });

    vi.mocked(browser.$).mockReturnValue({
      waitForDisplayed: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("navigates locations -> location row -> rack list -> rack row -> rack detail", async () => {
    const locationRow = makeRow("Loc A");
    const rackRow = makeRow("Rack A");

    vi.mocked(browser.$$).mockImplementation(async (selector: string) => {
      if (selector === "[data-location-code]") return [locationRow] as any;
      if (selector === "[data-rack-code]") return [rackRow] as any;
      return [] as any;
    });

    // getEntityNamesInRows is implemented via browser.execute — make it
    // resolve using the same row fixtures so findRowByExactName's waitUntil
    // condition (names.includes(expected)) becomes true immediately.
    vi.mocked(browser.execute).mockImplementation(async (fn: unknown) => {
      const fnStr = String(fn);
      if (fnStr.includes("rack-add-btn")) return "list";
      if (fnStr.includes("querySelectorAll")) {
        // Called for both [data-location-code] and [data-rack-code] — return
        // both known names; findRowByExactName only checks .includes().
        return ["Loc A", "Rack A"];
      }
      return true;
    });

    await navigateToRackDetail("Loc A", "Rack A");

    // clickNav("locations") drove a protocol click to the nav-locations button.
    expect(browser.findElement).toHaveBeenCalledWith("css selector", '[data-testid="nav-locations"]');
    // Both rows were located and clicked (via browser.execute's synthetic click).
    expect(browser.$$).toHaveBeenCalledWith("[data-location-code]");
    expect(browser.$$).toHaveBeenCalledWith("[data-rack-code]");
    // Rack detail readiness was awaited.
    expect(browser.$).toHaveBeenCalledWith('[data-testid="palette-drop-zone"]');
  });

  it("propagates the underlying error when the location row never appears", async () => {
    vi.mocked(browser.$$).mockResolvedValue([] as any);
    vi.mocked(browser.execute).mockImplementation(async (fn: unknown) => {
      const fnStr = String(fn);
      if (fnStr.includes("rack-add-btn")) return "list";
      if (fnStr.includes("querySelectorAll")) return [];
      return true;
    });
    vi.mocked(browser.waitUntil).mockImplementation(async () => {
      throw new Error('Row with exact name "Missing Loc" via "[data-location-code]" not found within 15000 ms');
    });

    await expect(navigateToRackDetail("Missing Loc", "Rack A")).rejects.toThrow(/not found/);
  });
});
