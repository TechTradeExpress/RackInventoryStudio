/**
 * Shared WDIO interaction helpers used by both core-inventory.e2e.ts and the
 * representative-latency benchmark. Extracted here so both consumers share
 * the exact same click/wait/visibility semantics instead of maintaining
 * independently copied equivalents.
 */
import { browser } from "@wdio/globals";
import { isSelectorVisible } from "./dom-helpers";

// W3C WebDriver element reference key (see the WebDriver spec's "web element
// identifier"). browser.findElement()/elementClick() are raw protocol
// commands exposed by webdriverio.
const W3C_ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

/**
 * Clicks an element via direct WebDriver protocol commands (findElement +
 * elementClick), bypassing WDIO's higher-level browser.$(selector).click()
 * convenience wrapper.
 *
 * This still performs the standards-compliant WebDriver "Element Click"
 * algorithm — an occluded element still fails with an interceptability
 * error, a disabled/non-interactable element still fails, and the resulting
 * DOM event sequence is identical to what browser.$().click() eventually
 * dispatches.
 *
 * Current architecture (see docs/E2E_WDIO_LATENCY_OPTIMIZATION.md §11 for
 * the full history): the production app never ships tauri-plugin-wdio — it
 * only exists behind the opt-in `wdio-plugin` Cargo feature, built via
 * scripts/build-wdio-plugin-binary.mjs into target-wdio-plugin/, and is the
 * binary every E2E run in this repository now uses. Earlier in this
 * program, WITHOUT that plugin, @wdio/tauri-service's beforeCommand hook
 * retried a plugin-availability probe up to 100 times (~7-8s) on every
 * findElement/elementClick/getTitle/$/$$ command — that historical baseline
 * is why this helper was originally introduced. With the plugin now always
 * present for E2E runs, that specific multi-second cost is gone. A residual
 * gap remains regardless: browser.$(selector).click() still resolves a
 * ChainablePromiseElement (its own findElement round trip) before issuing
 * .click() (which does its own interactability checks, then elementClick) —
 * two protocol round trips plus WDIO's own bookkeeping vs. this helper's
 * one findElement + one elementClick. Measured on the plugin binary: median
 * 200ms (browser.$().click()) vs 120ms (clickElementProtocol) over 5 tries
 * — a stable ~40%/80ms difference, above the threshold for keeping a
 * dedicated helper. Re-measure before removing this helper if the
 * WebdriverIO/@wdio/tauri-service dependency versions change materially.
 *
 * Do not use this for SearchableSelect option elements — see
 * selectSearchableOption below, which requires WDIO's Actions-routed
 * element.click({}) for correct onMouseDown dispatch in the SearchableSelect
 * dropdown (this raw elementClick protocol command does not provide that).
 */
export async function clickElementProtocol(selector: string): Promise<void> {
  const ref = await browser.findElement("css selector", selector);
  const elementId = (ref as Record<string, string> | null)?.[W3C_ELEMENT_KEY];
  if (!elementId) {
    throw new Error(`clickElementProtocol: element not found for selector "${selector}"`);
  }
  await browser.elementClick(elementId);
}

/**
 * Selects a SearchableSelect (apps/desktop/src/components/ui/SearchableSelect.tsx)
 * dropdown option by visible text.
 *
 * SearchableSelect's option elements are plain <div role="option"> nodes that
 * rely on a real onMouseDown listener (not onClick) to select a value before
 * the trigger's own outside-click handler can close the dropdown first. WDIO's
 * bare element.click() — and the raw elementClick protocol command used by
 * clickElementProtocol — issue the WebDriver classic "Element Click" command,
 * which on the embedded Tauri WebDriver driver (tauri-plugin-wdio-webdriver)
 * resolves to a plain JS `el.click()`: this synthesizes a `click` event but
 * never a `mousedown`, so the option is never selected under the embedded
 * provider. Passing a (possibly empty) options object — element.click({}) —
 * routes WDIO through the W3C Actions API instead (pointerMove + pointerDown
 * + pointerUp), which both providers implement with real mousedown/mouseup
 * dispatch. This is the correct, provider-agnostic way to interact with
 * SearchableSelect options; do not substitute HTMLElement.click() executed
 * via browser.execute() as a workaround for the missing mousedown — that
 * bypasses the same pointer-event sequence real user input produces.
 */
export async function selectSearchableOption(matchText: string, timeout = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const options = await browser.$$('[role="option"]');
        for (const option of options) {
          const text = await option.getText();
          if (text.includes(matchText)) {
            await option.click({});
            return true;
          }
        }
        return false;
      } catch {
        // A poll iteration can race a re-render (e.g. the dropdown's option
        // list refreshing as the search query updates) and hit a stale
        // element reference — retry on the next waitUntil tick instead of
        // failing the whole selection.
        return false;
      }
    },
    { timeout, interval: 100, timeoutMsg: `SearchableSelect option "${matchText}" not found` },
  );
}

/**
 * Waits for a nav tab to be visible then clicks it via the WebDriver
 * protocol click (see clickElementProtocol) to preserve the full
 * pointer-event sequence without WDIO's client-side retry-loop overhead.
 */
export async function clickNav(tab: string): Promise<void> {
  const testId = `nav-${tab}`;
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: `nav-${tab} not visible`,
  });
  await clickElementProtocol(selector);
}

/**
 * Waits for a modal to appear by looking for a visible submit button with the
 * given testId; used to confirm the form dialog has opened.
 */
export async function waitForModal(submitTestId: string): Promise<void> {
  const selector = `[data-testid="${submitTestId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: `Modal with submit "${submitTestId}" did not appear`,
  });
}

/**
 * Waits for a modal to close: the submit button either no longer exists or
 * no longer satisfies the shared visibility definition (isSelectorVisible).
 * Not limited to a zero bounding rect — display:none / visibility:hidden
 * also count as closed.
 */
export async function waitForModalClose(submitTestId: string): Promise<void> {
  const selector = `[data-testid="${submitTestId}"]`;
  await browser.waitUntil(async () => !(await browser.execute(isSelectorVisible, selector)), {
    timeout: 15_000,
    interval: 100,
    timeoutMsg: `Modal with submit "${submitTestId}" did not close`,
  });
}

/**
 * Waits for a form modal to close after submission, while simultaneously
 * watching for a visible `.ft-msg.err` error banner in the same poll.
 *
 * Combines the two concerns that the local `waitForFormClose` copies in each
 * spec used to address separately: waiting for the submit button to
 * disappear AND surfacing any modal footer error immediately instead of
 * timing out.
 *
 * Each poll iteration performs exactly one browser.execute() round trip that
 * atomically reads both the submit-button visibility and the error-banner state.
 * No `$()`, `getText()`, or `isDisplayed()` calls inside the poll — those each
 * cost their own findElement/getProperty round trip.
 *
 * Visibility definition (matches isSelectorVisible/isDomElementVisible):
 *   width > 0 AND height > 0 AND display !== "none" AND visibility !== "hidden"
 *
 * errorLabel/timeoutLabel let each caller keep its own diagnostic wording
 * (e.g. the placement modal's "Placement failed" instead of the generic
 * "Form submit failed") without duplicating the polling logic itself.
 *
 * Return:   resolves when the submit button is absent or not visible (modal closed)
 * Throws:   immediately when a visible .ft-msg.err banner is found, with its text
 *           (an empty-string banner still counts as an error — only a `null`
 *           errorText, meaning no visible banner at all, is not an error)
 * Timeout:  after `timeout` ms with the standard message (default 30 s)
 */
export async function waitForFormCloseOrError(
  submitTestId: string,
  options?: { timeout?: number; errorLabel?: string; timeoutLabel?: string },
): Promise<void> {
  const selector = `[data-testid="${submitTestId}"]`;
  const timeout = options?.timeout ?? 30_000;
  const errorLabel = options?.errorLabel ?? "Form submit failed";
  const timeoutLabel = options?.timeoutLabel ?? `Form "[data-testid="${submitTestId}"]"`;
  const timeoutMsg = `${timeoutLabel} did not close within ${Math.round(timeout / 1000)} s`;

  await browser.waitUntil(
    async () => {
      const result = await browser.execute(
        (sel: string): { closed: boolean; errorText: string | null } => {
          const btn = document.querySelector(sel);
          if (!btn) return { closed: true, errorText: null };

          // Visibility — same definition as isSelectorVisible / isDomElementVisible.
          // Inlined here because browser.execute() serialises only this function's own
          // source: calling isSelectorVisible() from here would resolve to undefined.
          const rect = (btn as HTMLElement).getBoundingClientRect();
          const style = window.getComputedStyle(btn as HTMLElement);
          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden";
          if (!visible) return { closed: true, errorText: null };

          // Check for a visible error banner
          const errEl = document.querySelector(".ft-msg.err");
          if (errEl) {
            const errRect = (errEl as HTMLElement).getBoundingClientRect();
            const errStyle = window.getComputedStyle(errEl as HTMLElement);
            const errVisible =
              errRect.width > 0 &&
              errRect.height > 0 &&
              errStyle.display !== "none" &&
              errStyle.visibility !== "hidden";
            if (errVisible) {
              return { closed: false, errorText: errEl.textContent ?? "" };
            }
          }

          return { closed: false, errorText: null };
        },
        selector,
      );

      if (result.errorText !== null) {
        throw new Error(`${errorLabel} — modal error: "${result.errorText}"`);
      }
      return result.closed;
    },
    { timeout, interval: 100, timeoutMsg },
  );
}

/**
 * Waits for an interactive button/element to be visible then clicks it via
 * the WebDriver protocol click (see clickElementProtocol) — full
 * interactability checks and pointer-event sequence, without WDIO's
 * client-side retry-loop overhead.
 */
export async function clickWhenVisible(testId: string, timeout = 10_000): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout,
    interval: 100,
    timeoutMsg: `[data-testid="${testId}"] not visible`,
  });
  await clickElementProtocol(selector);
}

/**
 * Finds a table row matching the given CSS selector and text, then fires
 * HTMLElement.click() via execute().
 *
 * WebKit marks <tr> elements as not-interactable for WebDriver .click(),
 * which causes elementClick to fail or spin. HTMLElement.click() bypasses
 * the interactability check and is the documented exception for this specific
 * case. It must NOT be used for ordinary buttons or nav elements, which rely
 * on the full WebDriver pointer-event sequence.
 */
export async function clickRowViaDom(
  selector: string,
  matchText: string,
  errorLabel: string,
): Promise<void> {
  const clicked: boolean = await browser.execute(
    (sel: string, name: string) => {
      const row = Array.from(document.querySelectorAll(sel)).find((r) =>
        r.textContent?.includes(name),
      );
      if (!row) return false;
      (row as HTMLElement).click();
      return true;
    },
    selector,
    matchText,
  );
  if (!clicked) throw new Error(`${errorLabel} not found for click`);
}
