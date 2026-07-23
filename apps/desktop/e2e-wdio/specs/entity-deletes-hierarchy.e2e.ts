/**
 * Hierarchy entity delete flows — Stage 3B.2
 *
 * Covers successful deletion of an empty Rack and a childless Location, with
 * rack-count and placement-count verification, using an isolated temporary
 * repository.
 *
 *   PART A — Create fixture: Location, Rack (no placements)
 *   PART B — Save, close, reopen — verify both entities persisted;
 *             verify rack count = 1 on Location row; verify rack front/rear = 0
 *   PART C — Delete Rack (no placements)
 *   PART D — Verify Location row rack count = 0 after Rack deletion
 *   PART E — Delete Location (no racks)
 *   PART F — Aggregate verification before save
 *   PART G — Persistence: save + close + reopen → verify Location gone
 *             (Rack was directly confirmed absent before save in Part C)
 *
 * Selector contract:
 *   Delete buttons    — aria-label="Delete <name>" scoped to entity row (not CSS-interpolated)
 *   ConfirmDialog     — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal             — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error      — data-testid="location-delete-error" / "rack-delete-error"
 *   Row selectors     — [data-location-code], [data-rack-code]
 *   Name cell         — <strong> child of each row
 *
 * Inventory delete flows (Device Model, Device) are covered by entity-deletes-inventory.e2e.ts.
 * Relationship guard workflows are covered by:
 *   - destructive-guards-inventory.e2e.ts (Device model guard, Device guard)
 *   - destructive-guards-hierarchy.e2e.ts (Location guard, Rack guard)
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  waitForEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import {
  findRowByExactName,
  expectExactlyOneRowByName,
  expectNoRowByName,
  clickRowDeleteAction,
  expectDeleteDialog,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  expectNoDeleteError,
  expectLocationRackCount,
  expectRackPlacementCounts,
  ensureRackListView,
  getEntityNamesInRows,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[deletes-hierarchy ${ts}] ${msg}`);
}

async function clickNav(tab: string): Promise<void> {
  const el = await browser.$(`[data-testid="nav-${tab}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await el.click();
}

async function waitForFormClose(submitTestId: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const btn = browser.$(`[data-testid="${submitTestId}"]`);
      if (!(await btn.isExisting())) return true;
      if (!(await btn.isDisplayed())) return true;
      const errEl = browser.$(".ft-msg.err");
      if ((await errEl.isExisting()) && (await errEl.isDisplayed())) {
        const errText = await errEl.getText();
        throw new Error(`Form submit failed — modal error: "${errText}"`);
      }
      return false;
    },
    { timeout: 30_000, timeoutMsg: `Form "[data-testid="${submitTestId}"]" did not close within 30 s` },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — hierarchy entity delete flows", () => {
  it("creates Location and empty Rack, deletes rack then location, confirms persistence", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `dlh${suffix}`;
    const repoName = `WDIO Deletes Hierarchy ${suffix}`;

    const locationName = `Delete Location ${suffix}`;
    const rackName     = `Delete Rack ${suffix}`;

    log(`suffix=${suffix}  repoCode=${repoCode}`);

    // ── PART A: Create fixture ────────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    // Create Location
    log("part A: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await (await waitForEnabled("location-form-submit")).click();
    await waitForFormClose("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" confirmed`);

    // Navigate into location to reach rack list
    const locationRowA = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRowA as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    // Create Rack (no placements — never place any device)
    log("part A: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", "10");
    await reactSetValue("field-row", `R-${suffix}`);
    await (await waitForEnabled("rack-form-submit")).click();
    await waitForFormClose("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed`);

    // ── PART B: Save, close, reopen, verify fixture persisted ────────────────

    log("part B: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await (await waitForEnabled("unsaved-changes-save")).click();
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part B: repository closed");

    log(`part B: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part B: repository reopened");

    log("part B: verifying fixture persistence");

    // Location row — verify exists and rack count = 1
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part B: location persisted with rack count = 1");

    // Navigate into location → rack list → verify Rack row + placement counts = 0
    const locationRowB = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRowB as unknown as HTMLElement);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 0, 0);
    log("part B: rack persisted with front = 0 placed, rear = 0 placed");

    log("part B: fixture confirmed after reopen");

    // ── PART C: Delete Rack ───────────────────────────────────────────────────

    log("part C: deleting rack");
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await clickRowDeleteAction("[data-rack-code]", rackName);
    await expectDeleteDialog(rackName);
    log("part C: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("rack-delete-error");
    await expectNoRowByName("[data-rack-code]", rackName);
    log(`part C: rack "${rackName}" deleted and gone from list`);

    // ── PART D: Location rack count = 0 after Rack deletion ──────────────────

    log("part D: verifying location rack count = 0 after rack deletion");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 0);
    log("part D: location rack count = 0 confirmed");

    // ── PART E: Delete Location ───────────────────────────────────────────────

    log("part E: deleting location");
    await clickRowDeleteAction("[data-location-code]", locationName);
    await expectDeleteDialog(locationName);
    log("part E: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("location-delete-error");
    await expectNoRowByName("[data-location-code]", locationName);
    log(`part E: location "${locationName}" deleted and gone from list`);

    // ── PART F: Aggregate verification before save ────────────────────────────

    log("part F: aggregate verification");

    await clickNav("locations");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-location-code]");
        return !names.includes(locationName);
      },
      { timeout: 10_000, timeoutMsg: `Location "${locationName}" still present in aggregate check` },
    );
    await expectNoDeleteError("location-delete-error");
    log("part F: location absent");

    // Rack was directly confirmed absent in Part C immediately after deletion.
    // Deleting the parent Location also confirmed there were no remaining racks
    // (the guard would have blocked the delete if a rack still existed).

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part F: ConfirmDialog is unexpectedly open after all deletions");
    }
    log("part F: no ConfirmDialog open — aggregate verification passed");

    // ── PART G: Save, close, reopen — persistence verification ───────────────

    log("part G: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await (await waitForEnabled("unsaved-changes-save")).click();
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part G: repository closed");

    log(`part G: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part G: repository reopened");

    await clickNav("locations");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-location-code]");
        return !names.includes(locationName);
      },
      { timeout: 15_000, timeoutMsg: `Location "${locationName}" still present after reopen` },
    );
    await expectNoDeleteError("location-delete-error");
    log("part G: location absent after reopen");

    // Rack was confirmed absent in Part C; the Location (which contained it) was
    // also deleted and confirmed absent. After reopen, Location absent confirms
    // the entire hierarchy was removed and persisted correctly.

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part G: ConfirmDialog is unexpectedly open after reopen");
    }

    log("part G: persistence verified — location gone after save + reopen");
    log("Stage 3B.2 hierarchy deletes spec complete");
  });
});
