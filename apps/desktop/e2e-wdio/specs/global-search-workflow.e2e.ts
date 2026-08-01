/**
 * Global search workflow (Stage 3E).
 *
 * Covers `GlobalSearch` (the sidebar search box, visible on every panel
 * once a repository is open): typing a query surfaces matching results,
 * and selecting a result navigates to the correct panel and entity.
 *
 *   PART A — Create a repository with one Location
 *   PART B — Type the location's name into global search; a matching
 *             result appears
 *   PART C — Select the result; the Locations tab becomes active and the
 *             location's row is present there
 *
 * Selector contract: `global-search-input` (new — this stage).
 *
 * Result selection does NOT reuse `selectSearchableOption()` despite
 * `GlobalSearch`'s result `<li role="option">` using the same
 * `onMouseDown`-based selection pattern as `SearchableSelect`'s own
 * options — confirmed by direct debugging (not assumed) that it cannot:
 * `selectSearchableOption()` matches via WebdriverIO's `getText()`, and
 * WebKitWebDriver's `getText()` implementation excludes the result label
 * span's text entirely (it only returns the "Location"/"Rack"/… kind
 * badge — a driver-level quirk of that span's `text-overflow: ellipsis`
 * styling, verified by comparing `getText()` output against the same
 * element's raw `textContent` in the same run, which *does* contain the
 * full label). `selectAndVerifySearchResult()` below is a spec-local
 * helper — not moved to shared support/ since GlobalSearch's result
 * markup is the only place this specific `getText()` quirk has been
 * found — using `browser.execute()` to read `textContent` instead, with
 * the same stale-element-tolerant retry loop and Actions-routed click
 * `selectSearchableOption()` already established as correct.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  clickWhenEnabled,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav, waitForFormCloseOrError } from "../support/spec-interactions";
import { findRowByExactName } from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[global-search ${ts}] ${msg}`);
}

/**
 * Waits for a `[role="option"]` whose raw textContent includes matchText,
 * then clicks it via the Actions API (never a bare `.click()` — GlobalSearch
 * results rely on a real `mousedown`, same reason as `selectSearchableOption()`).
 */
async function selectSearchResult(matchText: string, timeout = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const options = await browser.$$('[role="option"]');
        for (const option of options) {
          const text = await browser.execute((el: Element) => el.textContent ?? "", option as unknown as Element);
          if (text.includes(matchText)) {
            await option.click({});
            return true;
          }
        }
        return false;
      } catch {
        // Tolerate a stale-element race from the debounced result list
        // re-rendering mid-poll — retry on the next tick instead of failing.
        return false;
      }
    },
    { timeout, interval: 100, timeoutMsg: `Search result "${matchText}" not found` },
  );
}

describe("Rack Inventory Studio — global search", () => {
  it("finds a location by name and navigates to it", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `srch${suffix}`;
    const repoName = `WDIO Search ${suffix}`;
    const locationName = `Findable Location ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Create repository, create a location ──────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log("part A: repository created");

    log("part A: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormCloseOrError("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" confirmed`);

    // Navigate away first so PART C's navigation-to-locations assertion is
    // meaningful (proves the search result click actually switched tabs,
    // not that we were already there).
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    // ── PART B/C: Search surfaces a result; selecting it navigates ───────────

    log(`part B: typing "${locationName}" into global search`);
    await reactSetValue("global-search-input", locationName);

    log("part C: waiting for and selecting the matching search result");
    await selectSearchResult(locationName);

    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: "Locations panel (location-add-btn) did not become visible after selecting the search result",
    });
    await findRowByExactName("[data-location-code]", locationName);
    log("part C: confirmed — search navigated to the Locations panel and the location is present");
  });
});
