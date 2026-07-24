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
 */
export async function reactSetValue(testId: string, value: string): Promise<void> {
  const el = await browser.$(`[data-testid="${testId}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await browser.execute(
    function (inputEl: HTMLInputElement, val: string) {
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
    el as unknown as HTMLInputElement,
    value,
  );
}

/**
 * Set a value on a React controlled <select> by triggering a native change event.
 */
export async function reactSelectValue(testId: string, value: string): Promise<void> {
  const el = await browser.$(`[data-testid="${testId}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await browser.execute(
    function (selectEl: HTMLSelectElement, val: string) {
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
    el as unknown as HTMLSelectElement,
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
        lastDisplayed = canonicalPath(raw.trim());
        return lastDisplayed === expected;
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

  await (await waitForEnabled("repository-create-submit")).click();

  await browser
    .$('[data-testid="repository-active-root"]')
    .waitForDisplayed({ timeout: 30_000 });

  const { join } = await import("node:path");
  return join(repoParent, repoCode);
}
