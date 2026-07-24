/**
 * Inventory guard flows — Stage 3B.2
 *
 * Covers the two relationship guards for inventory entities (Device Model and
 * Device), verifying that the full inventory graph is intact after each
 * rejection and after a clean close + reopen.  Uses an independent isolated
 * temporary repository.
 *
 *   PART A — Create fixture: Location, Rack 14U, Device Model 1U server,
 *             Device (model assigned), Placement at front U1
 *   PART B — Save, close, reopen — verify full inventory graph persisted:
 *             Model exact row; Device exact row; Device → Model; exact badge
 *             "placed"; Location; Rack; exactly one Placement at U1
 *   PART C — Device Model guard: delete blocked (device references model)
 *             Verify model + device + device→model + placed badge + Placement U1 intact
 *   PART D — Device guard: delete blocked (device is placed in a rack)
 *             Verify device + placed badge + model in device row + Placement U1 intact
 *   PART E — Aggregate: full graph (Model, Device, Device→Model, placed badge,
 *             Location, Rack, rack count = 1, front count = 1, Placement U1)
 *   PART F — Dirty-state: close succeeds without UnsavedChangesDialog
 *   PART G — Reopen: full inventory graph verified again
 *
 * Selector contract:
 *   Delete buttons  — aria-label="Delete <name>" scoped to row (exact label comparison)
 *   ConfirmDialog   — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal           — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error    — data-testid="device-model-delete-error" / "device-delete-error"
 *   Placement card  — [data-device-code="…"][data-start-u="1"]
 *   Palette button  — button[data-testid^="place-btn-device-"][data-device-code="…"]
 *   PlacePlacementModal — place-btn, start-u-input
 *   Back button     — data-testid="rack-detail-back-btn"
 *
 * Hierarchy guard workflows (Location, Rack) are covered by
 * destructive-guards-hierarchy.e2e.ts.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
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
  waitForRackListOrDetail,
  ensureRackListView,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[guards-inv ${ts}] ${msg}`);
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

async function waitForPlacePlacementModalClose(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const btn = browser.$('[data-testid="place-btn"]');
      if (!(await btn.isExisting())) return true;
      if (!(await btn.isDisplayed())) return true;
      const errEl = browser.$(".ft-msg.err");
      if ((await errEl.isExisting()) && (await errEl.isDisplayed())) {
        const errText = await errEl.getText();
        throw new Error(`Placement failed — modal error: "${errText}"`);
      }
      return false;
    },
    { timeout: 60_000, timeoutMsg: "PlacePlacementModal did not close after placement" },
  );
}

async function navigateToRackDetail(locationName: string, rackName: string): Promise<void> {
  await clickNav("locations");
  const locationRow = await findRowByExactName("[data-location-code]", locationName);
  await browser.execute((el: HTMLElement) => el.click(), locationRow as unknown as HTMLElement);
  // selectedRack may still be set in App.tsx from a previous rack-detail visit.
  // When the racks panel loads, listRacks() resolves quickly and the panel
  // auto-switches to detail before rack-add-btn is ever visible.
  // ensureRackListView() handles this via rack-detail-back-btn.
  await ensureRackListView();
  // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
  const rackRow = await findRowByExactName("[data-rack-code]", rackName, 30_000);
  await browser.execute((el: HTMLElement) => el.click(), rackRow as unknown as HTMLElement);
  await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — inventory destructive-operation guards", () => {
  it("verifies Device Model and Device guards block deletion of referenced inventory entities", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `gri${suffix}`;
    const repoName = `WDIO Guards Inventory ${suffix}`;

    const locationName = `Guard Inventory Location ${suffix}`;
    const rackName     = `Guard Inventory Rack ${suffix}`;
    const modelName    = `Guard Inventory Model ${suffix}`;
    const deviceName   = `Guard Inventory Device ${suffix}`;

    const RACK_HEIGHT  = 14;
    const MODEL_HEIGHT = 1;
    const PLACE_U      = 1;

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
    await clickWhenEnabled("location-form-submit");
    await waitForFormClose("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" confirmed`);

    // Navigate into location and create Rack
    const locationRowA = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRowA as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part A: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", String(RACK_HEIGHT));
    await reactSetValue("field-row", `GRI-${suffix}`);
    await clickWhenEnabled("rack-form-submit");
    await waitForFormClose("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed (${RACK_HEIGHT}U)`);

    // Create Device Model
    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", String(MODEL_HEIGHT));
    await clickWhenEnabled("model-form-submit");
    await waitForFormClose("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed (${MODEL_HEIGHT}U server)`);

    // Create Device with model assigned
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
    await browser.waitUntil(
      async () => {
        const options = await browser.$$('[role="option"]');
        for (const option of options) {
          const text = await option.getText();
          if (text.includes(modelName)) {
            await option.click();
            return true;
          }
        }
        return false;
      },
      { timeout: 15_000, timeoutMsg: `Model option "${modelName}" not found in device form dropdown` },
    );

    await clickWhenEnabled("device-form-submit");
    await waitForFormClose("device-form-submit");

    const deviceRow = await findRowByExactName("[data-device-code]", deviceName);
    const deviceCode = (await deviceRow.getAttribute("data-device-code")) ?? "";
    if (!deviceCode) {
      throw new Error(`data-device-code attribute missing on row for "${deviceName}"`);
    }
    log(`part A: device "${deviceName}" confirmed, code=${deviceCode}`);

    // Place device at front U1
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
    await waitForPlacePlacementModalClose();

    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log(`part A: placement card confirmed at U${PLACE_U} — fixture complete`);

    // ── PART B: Save, close, reopen — verify full inventory graph ─────────────

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

    log("part B: verifying full inventory graph after reopen");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part B: model confirmed");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part B: device confirmed — placed, assigned to model");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    log("part B: location confirmed");

    const locRowB = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowB as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    log("part B: rack confirmed in rack list");

    // Enter rack detail and verify placement card
    const rackRowB = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowB as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part B: placement card at U1 confirmed in rack detail");

    log("part B: full inventory graph verified after reopen");

    // ── PART C: Device Model guard ────────────────────────────────────────────

    log("part C: attempting to delete device model (expected: guard — device references it)");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await clickRowDeleteAction("[data-model-code]", modelName);
    await expectDeleteDialog(modelName);
    log("part C: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "device-model-delete-error",
      "Cannot delete device model because devices or rack-object placements still reference it.",
    );
    log("part C: guard fired — verifying inventory graph intact");

    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part C: model still present");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part C: device still present — placed badge, model assigned");

    // Navigate to rack detail to verify placement card still exists
    await navigateToRackDetail(locationName, rackName);
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part C: placement card at U1 confirmed — model guard verified");

    // ── PART D: Device guard ──────────────────────────────────────────────────

    log("part D: attempting to delete device (expected: guard — device is placed)");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    log("part D: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "device-delete-error",
      "Cannot delete device because it is placed in a rack.",
    );
    log("part D: guard fired — verifying inventory graph intact");

    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part D: device still present — placed badge, model assigned");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part D: model still present");

    // Verify placement still exists
    await navigateToRackDetail(locationName, rackName);
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part D: placement card at U1 confirmed — device guard verified");

    // ── PART E: Aggregate verification ───────────────────────────────────────

    log("part E: aggregate verification — full graph intact after both guards");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part E: model intact");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part E: device intact — placed, assigned to model");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part E: location intact — rack count = 1");

    const locRowE = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowE as unknown as HTMLElement);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part E: rack intact — front = 1, rear = 0");

    // Enter rack detail and verify placement card
    const rackRowE = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowE as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part E: exactly one placement card at U1 confirmed");

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part E: ConfirmDialog is unexpectedly open after aggregate check");
    }
    log("part E: no ConfirmDialog open — aggregate verification passed");

    // ── PART F: Dirty-state assertion ─────────────────────────────────────────

    log("part F: clicking close — guard rejections must not dirty repository state");
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
        "Part F: UnsavedChangesDialog appeared after guard-only operations — " +
          "guard rejections must not mark the repository as dirty",
      );
    }
    log("part F: closed cleanly — no UnsavedChangesDialog (guard operations do not dirty state)");

    // ── PART G: Reopen — verify full inventory graph survives clean close ──────

    log(`part G: reopening repository at ${repoPath}`);
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part G: repository reopened");

    log("part G: verifying full inventory graph after clean close and reopen");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part G: model confirmed after reopen");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part G: device confirmed — placed badge, model assigned");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    log("part G: location confirmed");

    const locRowG = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowG as unknown as HTMLElement);
    await ensureRackListView();
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part G: rack confirmed — front = 1, rear = 0");

    const rackRowG = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowG as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part G: placement card at U1 confirmed — full inventory graph survives clean close");

    log("Stage 3B.2 inventory guards spec complete");
  });
});
