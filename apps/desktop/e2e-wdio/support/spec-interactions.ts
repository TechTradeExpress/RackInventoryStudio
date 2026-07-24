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
 * dispatches. The difference is entirely client-side: WDIO's own .click()
 * wraps the protocol call in an interactability-retry loop, and — because
 * @wdio/tauri-service's beforeCommand hook re-checks plugin availability on
 * every single command (this app does not have tauri-plugin-wdio installed,
 * so that check always resolves false at ~70-100ms per call) — each retry
 * iteration re-pays that hook cost. A single ordinary, already-visible
 * button does not need that retry loop at all; going straight to one
 * findElement + one elementClick call avoids paying for it.
 *
 * Do not use this for SearchableSelect option elements (see clickRowViaDom
 * and the SearchableSelect notes elsewhere) — those still require WDIO's
 * own .click() semantics for onMouseDown handling, which this bypasses.
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
