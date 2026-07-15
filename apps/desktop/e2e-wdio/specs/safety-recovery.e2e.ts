/**
 * Safety and recovery E2E — Stage 2A.
 *
 * Covers two areas without any network access or real clone operation:
 *
 * 1. Clone URL safety: verifies that unsafe git transport helpers (ext::, fd::,
 *    file://) are rejected in the frontend before any clone operation begins.
 *    The Tauri binary is running; the validation is pure React-state logic.
 *    A valid-looking HTTPS URL is included as a control to confirm the safety
 *    check does not over-block.
 *
 * 2. Repository-open recovery: verifies that submitting a missing path or an
 *    existing directory that is not a RIS repository through the "Open by path"
 *    UI produces a visible, non-empty error banner and leaves the app on the
 *    landing screen with no active repository.
 *
 * This spec is self-contained and does not depend on other specs running first.
 * Each WDIO spec gets a fresh Tauri binary session that starts at the landing
 * screen.
 *
 * Selector contract:
 *   repository-landing-title    — landing screen heading (present = on landing)
 *   clone-url                   — URL input in CloneRepositoryForm
 *   clone-url-error             — per-field validation error (unsafe URL)
 *   clone-submit                — Clone repository submit button
 *   repository-open-path-input  — open-by-path text input
 *   repository-open-path-submit — open-by-path submit button
 *   global-error                — global error banner in App.tsx (added for E2E)
 *   repository-active-root      — heading present only when a repo is open
 *   repository-active-path      — path present only when a repo is open
 *
 * The global-error selector was added in Stage 2A because the App.tsx error
 * banner had no stable testid before this stage.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";
import { reactSetValue } from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[safety-recovery ${ts}] ${msg}`);
}

const UNSAFE_CLONE_URLS: Array<{ label: string; url: string }> = [
  { label: "ext:: transport helper", url: "ext::sh -c echo" },
  { label: "fd:: transport helper",  url: "fd::3" },
  { label: "file:// scheme",         url: "file:///tmp/example.git" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Click the open-path submit button and wait for a non-empty global error banner
 * to appear, confirming the open attempt completed with a backend error.
 *
 * Returns the error text for logging.
 *
 * Note: the button's isBusy → disabled → enabled cycle can be shorter than
 * WDIO's 500 ms poll interval for fast filesystem errors.  Waiting for the
 * error banner is the reliable event-based alternative.
 */
async function openPathAndWaitForError(
  path: string,
  timeoutMsg: string,
): Promise<string> {
  await reactSetValue("repository-open-path-input", path);
  await browser.waitUntil(
    async () => {
      try {
        return await browser.$('[data-testid="repository-open-path-submit"]').isEnabled();
      } catch { return false; }
    },
    { timeout: 5_000, timeoutMsg: "Open-path submit never enabled after setting path" },
  );

  await browser.$('[data-testid="repository-open-path-submit"]').click();

  let errorText = "";
  await browser.waitUntil(
    async () => {
      try {
        const el = browser.$('[data-testid="global-error"]');
        if (!await el.isDisplayed()) return false;
        errorText = await el.getText();
        return errorText.trim().length > 0;
      } catch { return false; }
    },
    { timeout: 30_000, timeoutMsg },
  );
  return errorText;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — safety and recovery", () => {

  // ── 1. Clone URL safety ──────────────────────────────────────────────────────

  describe("clone URL safety", () => {

    it("rejects unsafe transport URLs and does not start a network request", async () => {
      log("step 1: waiting for landing screen");
      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "Landing screen did not appear at spec start",
      });
      log("step 1: landing screen visible");

      // ── Unsafe URL cases ──────────────────────────────────────────────────

      for (const { label, url } of UNSAFE_CLONE_URLS) {
        log(`step 2: checking unsafe URL — ${label}`);

        await reactSetValue("clone-url", url);

        // Validation error must appear for an unsafe URL.
        await browser.$('[data-testid="clone-url-error"]').waitForDisplayed({
          timeout: 5_000,
          timeoutMsg: `No validation error appeared for "${label}"`,
        });

        const errorText = await browser.$('[data-testid="clone-url-error"]').getText();
        if (!errorText || errorText.trim().length === 0) {
          throw new Error(`Validation error text for "${label}" was empty`);
        }
        log(`  error: "${errorText.trim().substring(0, 80)}"`);

        // Submit button must be disabled — no clone can start.
        const submitEnabled = await browser.$('[data-testid="clone-submit"]').isEnabled();
        if (submitEnabled) {
          throw new Error(`clone-submit is still enabled for unsafe URL: ${label}`);
        }
        log("  submit disabled — correct");

        // No repository must have been opened.
        await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({
          timeout: 2_000,
          reverse: true,
          timeoutMsg: `repository-active-root appeared after unsafe URL "${label}" — should not happen`,
        });
        log("  no active repository — correct");
      }

      // ── Control: valid-looking HTTPS URL ──────────────────────────────────

      log("step 3: checking control URL — https://example.invalid/repository.git");
      await reactSetValue("clone-url", "https://example.invalid/repository.git");

      // The URL-safety error must NOT appear for a valid-looking HTTPS URL.
      await browser.$('[data-testid="clone-url-error"]').waitForDisplayed({
        timeout: 5_000,
        reverse: true,
        timeoutMsg: "URL safety error appeared for a valid HTTPS URL — over-blocking",
      });
      log("  no URL safety error — correct");

      // Do NOT click submit — no network request is made.
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({
        timeout: 2_000,
        reverse: true,
        timeoutMsg: "repository-active-root appeared without submitting the form",
      });
      log("  no active repository — correct");

      log("clone URL safety: all cases passed");
    });
  });

  // ── 2. Repository-open recovery ───────────────────────────────────────────────

  describe("repository-open recovery", () => {

    before(() => {
      if (!process.env["RIS_E2E_RUN_ROOT"]) {
        throw new Error(
          "RIS_E2E_RUN_ROOT is not set. " +
            "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
        );
      }
    });

    it("shows a visible error and stays on the landing screen when the path does not exist", async () => {
      const runRoot = process.env["RIS_E2E_RUN_ROOT"] as string;
      const missingPath = join(runRoot, "missing-repository");

      if (existsSync(missingPath)) {
        throw new Error(`Expected path to not exist before test: ${missingPath}`);
      }

      log(`step 4: opening missing path: ${missingPath}`);
      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "Landing screen not visible at start of recovery test",
      });

      const errorText = await openPathAndWaitForError(
        missingPath,
        "No global error banner appeared after opening a missing path",
      );
      log(`  error: "${errorText.substring(0, 80)}"`);

      // Landing screen must remain.
      await expect(browser.$('[data-testid="repository-landing-title"]')).toBeDisplayed();

      // No repository must have been opened.
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({
        timeout: 3_000,
        reverse: true,
        timeoutMsg: "repository-active-root appeared after opening a missing path",
      });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 3_000,
        reverse: true,
        timeoutMsg: "repository-active-path appeared after opening a missing path",
      });

      log("missing-path recovery: OK");
    });

    it("shows a visible error and stays on the landing screen when the directory is not a RIS repository", async () => {
      const runRoot = process.env["RIS_E2E_RUN_ROOT"] as string;
      const notRisDir = join(runRoot, "not-a-ris-repository");

      mkdirSync(notRisDir, { recursive: true });
      // Harmless marker — confirms the directory exists but contains no RIS structure.
      writeFileSync(join(notRisDir, "marker.txt"), "This is not a RIS repository.\n");

      log(`step 5: opening non-RIS directory: ${notRisDir}`);
      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "Landing screen not visible at start of non-RIS-directory test",
      });

      const errorText = await openPathAndWaitForError(
        notRisDir,
        "No global error banner appeared after opening a non-RIS directory",
      );
      log(`  error: "${errorText.substring(0, 80)}"`);

      // Landing screen must remain.
      await expect(browser.$('[data-testid="repository-landing-title"]')).toBeDisplayed();

      // No repository must have been opened.
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({
        timeout: 3_000,
        reverse: true,
        timeoutMsg: "repository-active-root appeared after opening a non-RIS directory",
      });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 3_000,
        reverse: true,
        timeoutMsg: "repository-active-path appeared after opening a non-RIS directory",
      });

      // The not-a-ris-repository directory is inside runRoot and will be removed
      // by the guarded WDIO onComplete cleanup hook — no extra cleanup needed here.
      log("non-RIS-directory recovery: OK");
    });
  });
});
