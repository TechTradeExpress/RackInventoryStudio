/**
 * Shared WDIO interaction helpers used by both core-inventory.e2e.ts and the
 * representative-latency benchmark. Extracted here so both consumers share
 * the exact same click/wait/visibility semantics instead of maintaining
 * independently copied equivalents.
 */
import { browser } from "@wdio/globals";
import { isSelectorVisible } from "./dom-helpers";

/**
 * Waits for a nav tab to be visible then clicks it via WebDriver .click()
 * to preserve the full pointer-event sequence.
 */
export async function clickNav(tab: string): Promise<void> {
  const testId = `nav-${tab}`;
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: `nav-${tab} not visible`,
  });
  await browser.$(selector).click();
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
 * WebDriver .click() to preserve the full pointer-event sequence and
 * interactability checks.
 */
export async function clickWhenVisible(testId: string, timeout = 10_000): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout,
    interval: 100,
    timeoutMsg: `[data-testid="${testId}"] not visible`,
  });
  await browser.$(selector).click();
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
