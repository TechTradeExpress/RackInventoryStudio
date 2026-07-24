/**
 * Shared UI helpers for WDIO E2E specs that interact with the RIS desktop app.
 *
 * Extracted so that multiple specs can reuse common patterns without duplicating
 * the reactSetValue / canonicalPath logic.
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { browser } from "@wdio/globals";
import { isSelectorVisible } from "./dom-helpers";
import { clickElementProtocol } from "./spec-interactions";

// ── Path utilities ────────────────────────────────────────────────────────────

/**
 * Returns a canonical absolute path suitable for comparison across symlinks
 * and case differences (Windows lowercase).
 */
export function canonicalPath(value: string): string {
  const canonical = realpathSync.native(resolve(value.trim()));
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

// ── React input helpers ───────────────────────────────────────────────────────

/**
 * Set a value on a React controlled <input> via the native HTMLInputElement
 * value setter + bubbling input/change events.  This bypasses React's internal
 * tracked-value guard that otherwise prevents programmatic value changes from
 * triggering onChange.
 *
 * Waits via isSelectorVisible (a fast DOM read) rather than resolving a
 * ChainablePromiseElement + calling .waitForDisplayed() — the ChainablePromise
 * resolution path carries its own internal polling/findElement overhead on
 * top of the visibility check itself. No `$()` call is made at all; the
 * setter runs in the same execute() round trip as the final visibility read.
 */
export async function reactSetValue(testId: string, value: string, timeout = 10_000): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout,
    interval: 100,
    timeoutMsg: `[data-testid="${testId}"] never became visible (reactSetValue)`,
  });
  await browser.execute(
    (sel: string, val: string) => {
      const inputEl = document.querySelector(sel) as HTMLInputElement | null;
      if (!inputEl) throw new Error(`reactSetValue: element not found for selector "${sel}"`);
      const proto = Object.getPrototypeOf(inputEl);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(inputEl, val);
      } else {
        inputEl.value = val;
      }
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

/**
 * Set a value on a React controlled <select> by triggering a native change
 * event. Same rationale as reactSetValue: isSelectorVisible instead of
 * $()+waitForDisplayed(), setter dispatched via a single execute() call.
 */
export async function reactSelectValue(testId: string, value: string, timeout = 10_000): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(() => browser.execute(isSelectorVisible, selector), {
    timeout,
    interval: 100,
    timeoutMsg: `[data-testid="${testId}"] never became visible (reactSelectValue)`,
  });
  await browser.execute(
    (sel: string, val: string) => {
      const selectEl = document.querySelector(sel) as HTMLSelectElement | null;
      if (!selectEl) throw new Error(`reactSelectValue: element not found for selector "${sel}"`);
      const proto = Object.getPrototypeOf(selectEl);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(selectEl, val);
      } else {
        selectEl.value = val;
      }
      selectEl.dispatchEvent(new Event("input", { bubbles: true }));
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

// ── Wait helpers ──────────────────────────────────────────────────────────────

/**
 * Waits until the button/element with the given testId is enabled, then returns
 * a fresh element reference fetched after the wait.
 *
 * The element reference is re-fetched after waitUntil rather than before to
 * avoid returning a stale reference if React replaces the DOM node during the
 * wait.
 */
export async function waitForEnabled(testId: string, timeout = 10_000): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    () =>
      browser.execute((tid: string) => {
        const btn = document.querySelector<HTMLButtonElement | HTMLInputElement>(
          `[data-testid="${tid}"]`,
        );
        return !!btn && !btn.disabled;
      }, testId),
    { timeout, interval: 100, timeoutMsg: `[data-testid="${testId}"] never became enabled` },
  );
  // ChainablePromiseElement has all Element methods at runtime; cast to
  // satisfy the declared return type.
  return browser.$(`[data-testid="${testId}"]`) as unknown as WebdriverIO.Element;
}

/**
 * Waits for the button/element with the given testId to be enabled, then
 * clicks it via the WebDriver protocol click (clickElementProtocol) instead
 * of resolving a ChainablePromiseElement and calling .click() on it — see
 * clickElementProtocol for why this avoids WDIO's client-side retry-loop
 * overhead. Prefer this over `(await waitForEnabled(id)).click()`, which
 * still pays that cost (and which the returned element reference from
 * waitForEnabled is otherwise unused for).
 */
export async function clickWhenEnabled(testId: string, timeout = 10_000): Promise<void> {
  const selector = `[data-testid="${testId}"]`;
  await browser.waitUntil(
    () =>
      browser.execute((sel: string) => {
        const btn = document.querySelector<HTMLButtonElement | HTMLInputElement>(sel);
        return !!btn && !btn.disabled;
      }, selector),
    { timeout, interval: 100, timeoutMsg: `[data-testid="${testId}"] never became enabled` },
  );
  await clickElementProtocol(selector);
}

/**
 * Waits until the repository-active-path element is visible AND its text
 * content — after full canonicalisation on both sides (realpathSync symlink
 * resolution + Windows lowercase) — matches expectedPath.
 *
 * This polls: a visible element whose text has not yet caught up with a
 * just-completed navigation (stale text from the previous path, or an
 * empty/partial render) must not fail the check on the first read. Each
 * waitUntil iteration re-reads visibility and textContent from the DOM and
 * only succeeds once both hold. The textContent is fetched in browser
 * context and compared in Node context so that canonicalPath() — which
 * calls realpathSync — never runs inside browser.execute().
 *
 * canonicalPath() calls realpathSync.native(), which throws for a path that
 * does not exist on disk — and a displayed value can transiently be empty,
 * a partial render, or a stale/incomplete path while React is still
 * catching up. A thrown canonicalPath() must not abort the poll: it is
 * treated exactly like a non-matching read (return false, keep polling),
 * not a hard failure.
 */
export async function expectActiveRepositoryPath(
  expectedPath: string,
  timeout = 30_000,
): Promise<void> {
  const testId = "repository-active-path";
  const selector = `[data-testid="${testId}"]`;
  const expected = canonicalPath(expectedPath);
  let lastDisplayed: string | null = null;

  try {
    await browser.waitUntil(
      async () => {
        // Visibility semantics: isSelectorVisible (see dom-helpers.ts) —
        // returns false if the element does not exist or is not visible.
        const visible = await browser.execute(isSelectorVisible, selector);
        if (!visible) return false;
        const raw = await browser.execute(
          (sel: string) => document.querySelector(sel)?.textContent ?? "",
          selector,
        );
        const trimmed = raw.trim();
        if (!trimmed) {
          lastDisplayed = trimmed;
          return false;
        }
        try {
          lastDisplayed = canonicalPath(trimmed);
          return lastDisplayed === expected;
        } catch {
          // Not yet a resolvable path on disk (empty/partial/stale render).
          // Keep polling rather than letting canonicalPath's exception
          // abort the whole waitUntil.
          lastDisplayed = trimmed;
          return false;
        }
      },
      { timeout, interval: 100 },
    );
  } catch {
    throw new Error(
      `Active repository path never matched: last displayed "${lastDisplayed ?? "(element never visible)"}", ` +
        `expected "${expected}" (input: "${expectedPath}")`,
    );
  }
}

// ── Repository creation helper ────────────────────────────────────────────────

export interface CreateRepositoryOptions {
  repoParent: string;
  repoCode: string;
  repoName: string;
}

/**
 * Fills and submits the create-repository wizard on the landing screen, then
 * waits for the app to transition to the open-repository view.
 *
 * Precondition: the app must be showing the landing screen
 * (repository-landing-title is displayed).
 *
 * Returns the expected on-disk path for the new repository.
 */
export async function createRepositoryThroughUi(
  opts: CreateRepositoryOptions,
): Promise<string> {
  const { repoParent, repoCode, repoName } = opts;

  await reactSetValue("repository-create-parent-input", repoParent);
  await reactSetValue("repository-create-code-input", repoCode);
  await reactSetValue("repository-create-name-input", repoName);

  await clickWhenEnabled("repository-create-submit");

  await browser.waitUntil(
    () => browser.execute(isSelectorVisible, '[data-testid="repository-active-root"]'),
    { timeout: 30_000, interval: 100, timeoutMsg: "repository-active-root not visible after create" },
  );

  const { join } = await import("node:path");
  return join(repoParent, repoCode);
}
