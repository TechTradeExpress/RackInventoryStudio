/**
 * Recent repositories workflow (Stage 3E).
 *
 * Covers the landing screen's "Recent repositories" panel: it appears
 * after closing a repository that was just created, its path-cell click
 * fills the open-path field without opening, and its Open button actually
 * reopens the same repository — the one landing-screen affordance no
 * existing spec exercises (every other spec reopens via the plain path
 * text field only).
 *
 *   PART A — Create a repository, close it with no unsaved changes
 *   PART B — Recent repositories panel shows exactly the closed repo's
 *             path
 *   PART C — Clicking the path cell fills the open-path input without
 *             opening the repository
 *   PART D — Clicking the row's Open button opens that exact repository
 *
 * Selector contract: `recent-repo-row` / `data-recent-repo-path` (new —
 * this stage), plus the pre-existing `Open <path>` aria-label (already an
 * established selector pattern in this codebase — see
 * `destructive-guards.e2e.ts`'s `aria-label="Delete <name>"` convention)
 * and `repository-open-path-input`.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[recent-repos ${ts}] ${msg}`);
}

describe("Rack Inventory Studio — recent repositories", () => {
  it("lists a just-closed repository and reopens it via the recent-repos row", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `rct${suffix}`;
    const repoName = `WDIO Recent ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Create, close (no unsaved changes) ────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    log("part A: closing repository (no unsaved changes)");
    await browser.$('[data-testid="repository-close-action"]').click();
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 15_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part A: repository closed");

    // ── PART B: Recent repositories row appears ───────────────────────────────

    log("part B: waiting for recent-repo-row");
    const rowSelector = `[data-testid="recent-repo-row"][data-recent-repo-path="${repoPath}"]`;
    await browser.$(rowSelector).waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: `recent-repo-row for "${repoPath}" did not appear on the landing screen`,
    });
    log(`part B: recent-repo-row for "${repoPath}" confirmed`);

    // ── PART C: Clicking the path cell fills the open-path field only ────────

    log("part C: clicking the path cell (fill, not open)");
    await browser.$(`${rowSelector} td.tbl-mono`).click();
    await browser.waitUntil(
      async () => (await browser.$('[data-testid="repository-open-path-input"]').getValue()) === repoPath,
      {
        timeout: 5_000,
        timeoutMsg: "repository-open-path-input was not filled by clicking the recent-repo path cell",
      },
    );
    // Must not have opened as a side effect of filling the field.
    const stillOnLanding = await browser.$('[data-testid="repository-landing-title"]').isDisplayed();
    if (!stillOnLanding) {
      throw new Error("part C: clicking the recent-repo path cell opened the repository — it should only fill the field");
    }
    log("part C: confirmed — path cell click fills the field without opening");

    // Clear the field so PART D exercises the Open button itself, not a
    // leftover fill from this part.
    await reactSetValue("repository-open-path-input", "");

    // ── PART D: Open button reopens the exact repository ──────────────────────

    log("part D: clicking the row's Open button");
    await browser.$(`${rowSelector} button[aria-label="Open ${repoPath}"]`).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part D: confirmed — Open button reopened the correct repository");
  });
});
