/**
 * Shared UI helpers for WDIO E2E specs that interact with the RIS desktop app.
 *
 * Extracted so that multiple specs can reuse common patterns without duplicating
 * the reactSetValue / canonicalPath logic.
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { browser } from "@wdio/globals";

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
 * the element reference.
 */
export async function waitForEnabled(testId: string, timeout = 10_000): Promise<WebdriverIO.Element> {
  const el = await browser.$(`[data-testid="${testId}"]`);
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
  return el;
}

/**
 * Waits until the repository-active-path element is displayed and its text
 * matches the canonical form of expectedPath.
 */
export async function expectActiveRepositoryPath(expectedPath: string): Promise<void> {
  const expected = canonicalPath(expectedPath);
  await browser.waitUntil(
    () =>
      browser.execute((testId: string, exp: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        try {
          // Normalise separators for comparison (Windows paths may have \ or /)
          const text = (el.textContent ?? "").trim().replace(/\\/g, "/");
          return text === exp.replace(/\\/g, "/");
        } catch {
          return false;
        }
      }, "repository-active-path", expected),
    {
      timeout: 30_000,
      interval: 100,
      timeoutMsg: `Active repository path did not become "${expectedPath}"`,
    },
  );
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
