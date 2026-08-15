/**
 * Unsaved-changes discard workflow (Stage 3E).
 *
 * Covers the one UnsavedChangesDialog path no existing spec exercises:
 * choosing "Continue without saving" instead of "Save and continue" when
 * closing a repository with unsaved changes. Every other spec that closes
 * a repository always saves first (`unsaved-changes-save`).
 *
 *   PART A — Create repository, create a location (in-memory dirty state,
 *             never saved)
 *   PART B — Attempt close; UnsavedChangesDialog appears; click
 *             "Continue without saving" (`unsaved-changes-discard`)
 *   PART C — Repository closes without error; reopen by exact path;
 *             confirm the location does NOT exist on disk — the discard
 *             genuinely skipped the save, it isn't just a dialog dismiss
 *
 * Selector contract: `unsaved-changes-discard` (new — this stage), plus
 * pre-existing `repository-close-action`, `location-add-btn`,
 * `location-form-submit`, `field-name`, `repository-landing-title`,
 * `repository-open-path-input`, `repository-open-path-submit`,
 * `repository-active-root`.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav, waitForFormCloseOrError } from "../support/spec-interactions";
import { findRowByExactName } from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[unsaved-discard ${ts}] ${msg}`);
}

describe("Rack Inventory Studio — unsaved-changes discard", () => {
  it("discards an unsaved location instead of persisting it", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `disc${suffix}`;
    const repoName = `WDIO Discard ${suffix}`;
    const locationName = `Discard Location ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Create repository, create an unsaved location ────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    log("part A: creating location (never saved)");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormCloseOrError("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" created in-memory, not saved`);

    // ── PART B: Close, choose discard ─────────────────────────────────────────

    log("part B: attempting close");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();

    log("part B: waiting for UnsavedChangesDialog, clicking discard");
    await browser.$('[data-testid="unsaved-changes-discard"]').waitForDisplayed({ timeout: 10_000 });
    await clickWhenEnabled("unsaved-changes-discard");

    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part B: repository closed via discard, no save error");

    // ── PART C: Reopen — location must not exist ──────────────────────────────

    log(`part C: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part C: repository reopened");

    log("part C: verifying discarded location does not exist");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const rows = await browser.$$(`[data-location-code]`);
    for (const row of rows) {
      const strong = await row.$("strong");
      const text = (await strong.isExisting()) ? (await strong.getText()).trim() : "";
      if (text === locationName) {
        throw new Error(
          `part C: discarded location "${locationName}" was found after reopen — discard did not skip the save`,
        );
      }
    }
    log("part C: confirmed — discarded location does not exist on disk");
  });
});
