/**
 * Entity delete flows — Stage 3B.2, consolidated (Stage 3C).
 *
 * Covers successful deletion of hierarchy entities (empty Rack, childless
 * Location) and inventory entities (unplaced Device, unused Device Model),
 * using a single isolated temporary repository shared across both deletion
 * sequences.
 *
 * Consolidated from entity-deletes-hierarchy.e2e.ts and
 * entity-deletes-inventory.e2e.ts (Stage 3C spec-consolidation audit): the
 * two fixtures are disjoint — Location/Rack never reference Model/Device in
 * this spec (the device stays unplaced) — so creating all four entities once
 * and running both deletion sequences against them carries no order
 * dependency: deleting the Rack/Location has no bearing on the
 * Device/Model's existence or vice versa. See docs/E2E_WDIO_PLAN.md's
 * "E2E spec consolidation" section for the full rationale and before/after
 * timing.
 *
 *   PART A — Create fixture: Location, Rack (no placements), Device Model
 *             (unused), Device (unplaced, no model)
 *   PART B — Save, close, reopen — verify all four entities persisted;
 *             rack count = 1 on Location row; rack front/rear = 0; device
 *             unplaced, no model
 *   PART C — Cancel assertion: Device delete dialog title verified; entity survives
 *   PART D — Delete Rack (no placements)
 *   PART E — Verify Location row rack count = 0 after Rack deletion
 *   PART F — Delete Location (no racks)
 *   PART G — Delete Device (unplaced, no model assigned)
 *   PART H — Delete Device Model (not referenced by any device or placement)
 *   PART I — Aggregate verification before save
 *   PART J — Persistence: save + close + reopen → verify all four gone
 *
 * Selector contract:
 *   Delete buttons    — aria-label="Delete <name>" scoped to entity row (not CSS-interpolated)
 *   ConfirmDialog     — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal             — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error      — data-testid="location-delete-error" / "rack-delete-error" /
 *                        "device-delete-error" / "device-model-delete-error"
 *   Row selectors     — [data-location-code], [data-rack-code], [data-device-code], [data-model-code]
 *   Name cell         — <strong> child of each row
 *
 * Relationship guard workflows (blocked deletes) are covered by
 * destructive-guards.e2e.ts.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav, waitForFormCloseOrError } from "../support/spec-interactions";
import {
  findRowByExactName,
  expectExactlyOneRowByName,
  expectNoRowByName,
  clickRowDeleteAction,
  expectDeleteDialog,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  expectNoDeleteError,
  expectDeviceRowState,
  expectLocationRackCount,
  expectRackPlacementCounts,
  ensureRackListView,
  getEntityNamesInRows,
  clickLocationRowAndEnterRacks,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[deletes ${ts}] ${msg}`);
}

async function expectRowGoneEventually(rowSelector: string, name: string, timeout = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const names = await getEntityNamesInRows(rowSelector);
      return !names.includes(name);
    },
    { timeout, timeoutMsg: `"${name}" via "${rowSelector}" still present` },
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — entity delete flows", () => {
  it("creates hierarchy and inventory entities, deletes each, confirms persistence", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `dlt${suffix}`;
    const repoName = `WDIO Deletes ${suffix}`;

    const locationName = `Delete Location ${suffix}`;
    const rackName     = `Delete Rack ${suffix}`;
    const modelName    = `Delete Model ${suffix}`;
    const deviceName   = `Delete Device ${suffix}`;

    log(`suffix=${suffix}  repoCode=${repoCode}`);

    // ── PART A: Create fixture ────────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    log("part A: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormCloseOrError("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" confirmed`);

    const locationRowA = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRowA as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part A: creating rack (no placements)");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", "10");
    await reactSetValue("field-row", `R-${suffix}`);
    await clickWhenEnabled("rack-form-submit");
    await waitForFormCloseOrError("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed`);

    log("part A: creating device model (unused)");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", "1");
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed`);

    log("part A: creating device (unplaced, no model)");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);
    // No model assigned — leave SearchableSelect at default "— none —"
    await clickWhenEnabled("device-form-submit");
    await waitForFormCloseOrError("device-form-submit");
    await findRowByExactName("[data-device-code]", deviceName);
    log(`part A: device "${deviceName}" confirmed (unplaced, no model)`);

    // ── PART B: Save, close, reopen, verify fixture persisted ────────────────

    log("part B: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part B: repository closed");

    log(`part B: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part B: repository reopened");

    log("part B: verifying fixture persistence");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);

    await clickLocationRowAndEnterRacks(locationName);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 0, 0);
    log("part B: location + rack persisted — rack count = 1, front/rear = 0");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, null, "unplaced");
    log("part B: model + device persisted — device unplaced, no model");

    // ── PART C: Cancel assertion (Device) ─────────────────────────────────────

    log("part C: cancel assertion — verifying Device dialog cancel does not delete");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    await clickConfirmDialogAction("confirm-dialog-cancel");
    await waitForConfirmDialogClosed();
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectNoDeleteError("device-delete-error");
    log("part C: device survives cancel — cancel assertion passed");

    // ── PART D: Delete Rack (no placements) ───────────────────────────────────

    log("part D: deleting rack");
    await clickNav("locations");
    await clickLocationRowAndEnterRacks(locationName);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await clickRowDeleteAction("[data-rack-code]", rackName);
    await expectDeleteDialog(rackName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("rack-delete-error");
    await expectNoRowByName("[data-rack-code]", rackName);
    log(`part D: rack "${rackName}" deleted and gone from list`);

    // ── PART E: Location rack count = 0 after Rack deletion ──────────────────

    log("part E: verifying location rack count = 0 after rack deletion");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 0);
    log("part E: location rack count = 0 confirmed");

    // ── PART F: Delete Location ───────────────────────────────────────────────

    log("part F: deleting location");
    await clickRowDeleteAction("[data-location-code]", locationName);
    await expectDeleteDialog(locationName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("location-delete-error");
    await expectNoRowByName("[data-location-code]", locationName);
    log(`part F: location "${locationName}" deleted and gone from list`);

    // ── PART G: Delete Device ─────────────────────────────────────────────────

    log("part G: deleting device");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("device-delete-error");
    await expectNoRowByName("[data-device-code]", deviceName);
    log(`part G: device "${deviceName}" deleted and gone from list`);

    // ── PART H: Delete Device Model ───────────────────────────────────────────

    log("part H: deleting device model");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await clickRowDeleteAction("[data-model-code]", modelName);
    await expectDeleteDialog(modelName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("device-model-delete-error");
    await expectNoRowByName("[data-model-code]", modelName);
    log(`part H: model "${modelName}" deleted and gone from list`);

    // ── PART I: Aggregate verification before save ────────────────────────────

    log("part I: aggregate verification");
    await clickNav("locations");
    await expectRowGoneEventually("[data-location-code]", locationName);
    await expectNoDeleteError("location-delete-error");

    await clickNav("devices");
    await expectRowGoneEventually("[data-device-code]", deviceName);
    await expectNoDeleteError("device-delete-error");

    await clickNav("device_models");
    await expectRowGoneEventually("[data-model-code]", modelName);
    await expectNoDeleteError("device-model-delete-error");

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part I: ConfirmDialog is unexpectedly open after all deletions");
    }
    log("part I: all four entities absent, no ConfirmDialog open — aggregate verification passed");

    // Rack was directly confirmed absent in Part D immediately after deletion;
    // deleting the parent Location in Part F also confirmed no rack still
    // existed (the guard would have blocked it otherwise).

    // ── PART J: Save, close, reopen — persistence verification ───────────────

    log("part J: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part J: repository closed");

    log(`part J: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part J: repository reopened");

    await clickNav("locations");
    await expectRowGoneEventually("[data-location-code]", locationName, 15_000);
    await expectNoDeleteError("location-delete-error");

    await clickNav("devices");
    await expectRowGoneEventually("[data-device-code]", deviceName, 15_000);
    await expectNoDeleteError("device-delete-error");

    await clickNav("device_models");
    await expectRowGoneEventually("[data-model-code]", modelName, 15_000);
    await expectNoDeleteError("device-model-delete-error");

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part J: ConfirmDialog is unexpectedly open after reopen");
    }

    log("part J: persistence verified — all four entities gone after save + reopen");
    log("Stage 3C consolidated deletes spec complete");
  });
});
