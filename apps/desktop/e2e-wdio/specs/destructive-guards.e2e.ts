/**
 * Destructive-operation guard flows — Stage 3B.2, consolidated (Stage 3C).
 *
 * Covers all four relationship guards (Location, Rack, Device Model, Device),
 * verifying that the full graph is intact after each rejection and after a
 * clean close + reopen. Uses a single independent isolated temporary
 * repository shared across all four guard checks.
 *
 * Consolidated from destructive-guards-hierarchy.e2e.ts and
 * destructive-guards-inventory.e2e.ts (Stage 3C spec-consolidation audit):
 * both specs built the exact same fixture (Location, Rack 14U, Device Model
 * 1U server, Device with model assigned, Placement at front U1) independently
 * before testing a different guard pair against it. Since every guard check
 * in both original specs only *attempts* a blocked delete — none of them
 * ever mutates the graph — running all four guard checks against one shared
 * fixture carries no order-dependency or isolation risk: whichever guard
 * runs first, the graph is unchanged for the next one. See
 * docs/E2E_WDIO_PLAN.md's "E2E spec consolidation" section for the full
 * rationale and before/after timing.
 *
 *   PART A — Create fixture: Location, Rack 14U, Device Model 1U server,
 *             Device (model assigned), Placement at front U1
 *   PART B — Save, close, reopen — verify full graph persisted (hierarchy
 *             *and* inventory facets in one pass): Location rack count = 1;
 *             Rack front = 1, rear = 0; exactly one Placement at U1; Device
 *             placed and assigned to Model; Model row present
 *   PART C — Location guard: delete blocked (rack still references location)
 *   PART D — Rack guard: delete blocked (placement references rack)
 *   PART E — Device Model guard: delete blocked (device references model)
 *   PART F — Device guard: delete blocked (device is placed in a rack)
 *   PART G — Aggregate: full graph intact after all four guards
 *   PART H — Dirty-state: close succeeds without UnsavedChangesDialog
 *   PART I — Reopen: full graph verified again including rack detail
 *
 * Selector contract:
 *   Delete buttons  — aria-label="Delete <name>" scoped to row (exact label comparison)
 *   ConfirmDialog   — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal           — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error    — data-testid="location-delete-error" / "rack-delete-error" /
 *                      "device-model-delete-error" / "device-delete-error"
 *   Placement card  — [data-device-code="…"][data-start-u="1"]
 *   Palette button  — button[data-testid^="place-btn-device-"][data-device-code="…"]
 *   PlacePlacementModal — place-btn, start-u-input
 *   Back button     — data-testid="rack-detail-back-btn"
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav, waitForFormCloseOrError, selectSearchableOption } from "../support/spec-interactions";
import {
  findRowByExactName,
  expectExactlyOneRowByName,
  clickRowDeleteAction,
  expectDeleteDialog,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  expectDeleteError,
  expectDeviceRowState,
  expectExactlyOnePlacement,
  expectLocationRackCount,
  expectRackPlacementCounts,
  ensureRackListView,
  navigateToRackDetail,
  clickLocationRowAndEnterRacks,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[guards ${ts}] ${msg}`);
}

/** Verifies the full graph (hierarchy + inventory facets) from the locations panel onward. */
async function expectFullGraph(
  locationName: string,
  rackName: string,
  modelName: string,
  deviceName: string,
  deviceCode: string,
): Promise<void> {
  await clickNav("locations");
  await findRowByExactName("[data-location-code]", locationName);
  await expectExactlyOneRowByName("[data-location-code]", locationName);
  await expectLocationRackCount("[data-location-code]", locationName, 1);

  await clickLocationRowAndEnterRacks(locationName);
  await ensureRackListView();
  // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
  await findRowByExactName("[data-rack-code]", rackName, 30_000);
  await expectExactlyOneRowByName("[data-rack-code]", rackName);
  await expectRackPlacementCounts(rackName, 1, 0);

  const rackRow = await findRowByExactName("[data-rack-code]", rackName);
  await browser.execute((el: HTMLElement) => el.click(), rackRow as unknown as HTMLElement);
  await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
  await expectExactlyOnePlacement(deviceCode, 1);

  await clickNav("devices");
  await findRowByExactName("[data-device-code]", deviceName);
  await expectExactlyOneRowByName("[data-device-code]", deviceName);
  await expectDeviceRowState(deviceName, modelName, "placed");

  await clickNav("device_models");
  await findRowByExactName("[data-model-code]", modelName);
  await expectExactlyOneRowByName("[data-model-code]", modelName);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — destructive-operation guards", () => {
  it("verifies Location, Rack, Device Model, and Device guards block deletion of referenced entities", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `grd${suffix}`;
    const repoName = `WDIO Guards ${suffix}`;

    const locationName = `Guard Location ${suffix}`;
    const rackName     = `Guard Rack ${suffix}`;
    const modelName    = `Guard Model ${suffix}`;
    const deviceName   = `Guard Device ${suffix}`;

    const RACK_HEIGHT  = 14;
    const MODEL_HEIGHT = 1;
    const PLACE_U      = 1;

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

    log("part A: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", String(RACK_HEIGHT));
    await reactSetValue("field-row", `GRD-${suffix}`);
    await clickWhenEnabled("rack-form-submit");
    await waitForFormCloseOrError("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed (${RACK_HEIGHT}U)`);

    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", String(MODEL_HEIGHT));
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed (${MODEL_HEIGHT}U server)`);

    log("part A: creating device with model assigned");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);

    await browser.$('[data-testid="field-device-model-trigger"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="field-device-model-trigger"]').click();
    await browser.$('[data-testid="field-device-model-search"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="field-device-model-search"]').addValue(modelName);
    await selectSearchableOption(modelName);

    await clickWhenEnabled("device-form-submit");
    await waitForFormCloseOrError("device-form-submit");

    const deviceRow = await findRowByExactName("[data-device-code]", deviceName);
    const deviceCode = (await deviceRow.getAttribute("data-device-code")) ?? "";
    if (!deviceCode) {
      throw new Error(`data-device-code attribute missing on row for "${deviceName}"`);
    }
    log(`part A: device "${deviceName}" confirmed, code=${deviceCode}`);

    log("part A: navigating to rack detail for placement");
    await navigateToRackDetail(locationName, rackName);

    log(`part A: clicking palette Place button for device ${deviceCode}`);
    const paletteBtnSel = `button[data-testid^="place-btn-device-"][data-device-code="${deviceCode}"]`;
    await browser.waitUntil(
      async () => browser.$(paletteBtnSel).isDisplayed(),
      { timeout: 15_000, timeoutMsg: `Palette Place button for device "${deviceCode}" not displayed` },
    );
    await browser.$(paletteBtnSel).click();

    log("part A: waiting for PlacePlacementModal");
    await browser.waitUntil(
      async () => browser.$('[data-testid="place-btn"]').isEnabled(),
      { timeout: 30_000, timeoutMsg: "PlacePlacementModal place-btn never became enabled" },
    );

    log(`part A: filling start U = ${PLACE_U}`);
    await browser.$('[data-testid="start-u-input"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="start-u-input"]').addValue(String(PLACE_U));

    log("part A: submitting placement");
    await clickWhenEnabled("place-btn");
    await waitForFormCloseOrError("place-btn", {
      timeout: 60_000,
      errorLabel: "Placement failed",
      timeoutLabel: "Placement modal",
    });

    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log(`part A: placement card confirmed at U${PLACE_U} — fixture complete`);

    // ── PART B: Save, close, reopen — verify full graph ───────────────────────

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

    log("part B: verifying full graph after reopen");
    await expectFullGraph(locationName, rackName, modelName, deviceName, deviceCode);
    log("part B: full graph verified after reopen");

    // ── PART C: Location guard ────────────────────────────────────────────────

    log("part C: attempting to delete location (expected: guard — rack still references it)");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await clickRowDeleteAction("[data-location-code]", locationName);
    await expectDeleteDialog(locationName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "location-delete-error",
      "Cannot delete location because racks still reference it.",
    );
    await findRowByExactName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part C: location guard verified — location intact, rack count = 1");

    // ── PART D: Rack guard ────────────────────────────────────────────────────

    log("part D: attempting to delete rack (expected: guard — placement references it)");
    await clickLocationRowAndEnterRacks(locationName);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await clickRowDeleteAction("[data-rack-code]", rackName);
    await expectDeleteDialog(rackName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "rack-delete-error",
      "Cannot delete rack because placements still reference it.",
    );
    await findRowByExactName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part D: rack guard verified — rack intact, front = 1, rear = 0");

    // ── PART E: Device Model guard ────────────────────────────────────────────

    log("part E: attempting to delete device model (expected: guard — device references it)");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await clickRowDeleteAction("[data-model-code]", modelName);
    await expectDeleteDialog(modelName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "device-model-delete-error",
      "Cannot delete device model because devices or rack-object placements still reference it.",
    );
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part E: device model guard verified — model intact");

    // ── PART F: Device guard ──────────────────────────────────────────────────

    log("part F: attempting to delete device (expected: guard — device is placed)");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "device-delete-error",
      "Cannot delete device because it is placed in a rack.",
    );
    await findRowByExactName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part F: device guard verified — device intact, placed, model assigned");

    // ── PART G: Aggregate verification ───────────────────────────────────────

    log("part G: aggregate verification — full graph intact after all four guards");
    await expectFullGraph(locationName, rackName, modelName, deviceName, deviceCode);
    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part G: ConfirmDialog is unexpectedly open after aggregate check");
    }
    log("part G: no ConfirmDialog open — aggregate verification passed");

    // ── PART H: Dirty-state assertion ─────────────────────────────────────────

    log("part H: clicking close — guard rejections must not dirty repository state");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();

    let hitUnsavedDialog = false;
    await browser.waitUntil(
      async () => {
        if (await browser.$('[data-testid="repository-landing-title"]').isDisplayed()) return true;
        if (await browser.$('[data-testid="unsaved-changes-save"]').isExisting()) {
          hitUnsavedDialog = true;
          return true;
        }
        return false;
      },
      {
        timeout: 30_000,
        timeoutMsg: "Neither repository-landing-title nor unsaved-changes-save appeared after Close",
      },
    );

    if (hitUnsavedDialog) {
      throw new Error(
        "Part H: UnsavedChangesDialog appeared after guard-only operations — " +
          "guard rejections must not mark the repository as dirty",
      );
    }
    log("part H: closed cleanly — no UnsavedChangesDialog (guard operations do not dirty state)");

    // ── PART I: Reopen — verify full graph survives clean close ──────────────

    log(`part I: reopening repository at ${repoPath}`);
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part I: repository reopened");

    log("part I: verifying full graph after clean close and reopen");
    await expectFullGraph(locationName, rackName, modelName, deviceName, deviceCode);
    log("part I: full graph survives clean close — all four guards verified end to end");

    log("Stage 3C consolidated guards spec complete");
  });
});
