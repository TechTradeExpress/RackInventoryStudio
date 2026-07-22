/**
 * Hierarchy guard flows — Stage 3B.2
 *
 * Covers the two relationship guards for hierarchy entities (Location and Rack),
 * verifying that the full hierarchy graph is intact after each rejection and
 * after a clean close + reopen.  Uses an independent isolated temporary
 * repository.
 *
 *   PART A — Create fixture: Location, Rack 14U, Device Model 1U server,
 *             Device (model assigned), Placement at front U1
 *   PART B — Save, close, reopen — verify full hierarchy graph persisted:
 *             Location exact row; rack count = 1; Rack exact row; front = 1,
 *             rear = 0; exactly one Placement at U1 in rack detail; Device placed
 *   PART C — Location guard: delete blocked (rack still references location)
 *             Verify location + rack count + Rack + Placement U1 intact
 *   PART D — Rack guard: delete blocked (placement references rack)
 *             Use rack-detail-back-btn to return to rack list (no text search).
 *             Verify rack + front count + Placement U1 + Location rack count intact
 *   PART E — Aggregate: full graph (Location, Rack, Placement U1, Device placed, Model)
 *   PART F — Dirty-state: close succeeds without UnsavedChangesDialog
 *   PART G — Reopen: full hierarchy graph verified again including rack detail
 *
 * Selector contract:
 *   Delete buttons  — aria-label="Delete <name>" scoped to row (exact label comparison)
 *   ConfirmDialog   — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal           — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error    — data-testid="location-delete-error" / "rack-delete-error"
 *   Placement card  — [data-device-code="…"][data-start-u="1"]
 *   Back button     — data-testid="rack-detail-back-btn"
 *
 * Inventory guard workflows (Device Model, Device) are covered by
 * destructive-guards-inventory.e2e.ts.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  waitForEnabled,
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
  ensureRackListView,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[guards-hier ${ts}] ${msg}`);
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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — hierarchy destructive-operation guards", () => {
  it("verifies Location and Rack guards block deletion of referenced hierarchy entities", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `grh${suffix}`;
    const repoName = `WDIO Guards Hierarchy ${suffix}`;

    const locationName = `Guard Hierarchy Location ${suffix}`;
    const rackName     = `Guard Hierarchy Rack ${suffix}`;
    const modelName    = `Guard Hierarchy Model ${suffix}`;
    const deviceName   = `Guard Hierarchy Device ${suffix}`;

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
    await (await waitForEnabled("location-form-submit")).click();
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
    await reactSetValue("field-row", `GRH-${suffix}`);
    await (await waitForEnabled("rack-form-submit")).click();
    await waitForFormClose("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed (${RACK_HEIGHT}U)`);

    // Create Device Model (supporting fixture for placement)
    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", String(MODEL_HEIGHT));
    await (await waitForEnabled("model-form-submit")).click();
    await waitForFormClose("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed`);

    // Create Device with model assigned (supporting fixture for placement)
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

    await (await waitForEnabled("device-form-submit")).click();
    await waitForFormClose("device-form-submit");

    const deviceRow = await findRowByExactName("[data-device-code]", deviceName);
    const deviceCode = (await deviceRow.getAttribute("data-device-code")) ?? "";
    if (!deviceCode) {
      throw new Error(`data-device-code attribute missing on row for "${deviceName}"`);
    }
    log(`part A: device "${deviceName}" confirmed, code=${deviceCode}`);

    // Place device at front U1 — this creates the placement that blocks Rack deletion
    log("part A: navigating to rack detail for placement");
    await clickNav("locations");
    const locationRowForDetail = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRowForDetail as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const rackRowForDetail = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowForDetail as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });

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
    await (await waitForEnabled("place-btn")).click();
    await waitForPlacePlacementModalClose();

    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log(`part A: placement card confirmed at U${PLACE_U} — fixture complete`);

    // ── PART B: Save, close, reopen — verify full hierarchy graph ─────────────

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

    log("part B: verifying full hierarchy graph after reopen");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part B: location confirmed — rack count = 1");

    const locRowB = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowB as unknown as HTMLElement);
    await ensureRackListView();
    // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part B: rack confirmed in rack list — front = 1, rear = 0");

    // Enter rack detail and verify placement card
    const rackRowB = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowB as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part B: placement card at U1 confirmed in rack detail");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part B: device confirmed — placed badge");

    log("part B: full hierarchy graph verified after reopen");

    // ── PART C: Location guard ────────────────────────────────────────────────

    log("part C: attempting to delete location (expected: guard — rack still references it)");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await clickRowDeleteAction("[data-location-code]", locationName);
    await expectDeleteDialog(locationName);
    log("part C: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "location-delete-error",
      "Cannot delete location because racks still reference it.",
    );
    log("part C: guard fired — verifying hierarchy graph intact");

    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part C: location still present — rack count = 1");

    // Navigate into location → rack list and verify Rack + Placement
    const locRowC = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowC as unknown as HTMLElement);
    await ensureRackListView();
    // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    log("part C: rack still present in rack list");

    // Enter rack detail to verify placement
    const rackRowC = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowC as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part C: placement at U1 confirmed — location guard verified");

    // ── PART D: Rack guard ────────────────────────────────────────────────────

    log("part D: attempting to delete rack (expected: guard — placement references it)");
    // After Part C's rack detail entry, we may be in rack detail or list view.
    // Use ensureRackListView (which uses rack-detail-back-btn) to reach rack list.
    await ensureRackListView();
    // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await clickRowDeleteAction("[data-rack-code]", rackName);
    await expectDeleteDialog(rackName);
    log("part D: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectDeleteError(
      "rack-delete-error",
      "Cannot delete rack because placements still reference it.",
    );
    log("part D: guard fired — verifying hierarchy graph intact");

    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part D: rack still present — front = 1, rear = 0");

    // Enter rack detail to verify placement still intact
    const rackRowD = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowD as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part D: placement at U1 confirmed");

    // Return to rack list and verify location rack count is still 1
    await ensureRackListView();
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part D: location rack count still = 1 — rack guard verified");

    // ── PART E: Aggregate verification ───────────────────────────────────────

    log("part E: aggregate verification — full hierarchy graph intact after both guards");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part E: location intact — rack count = 1");

    const locRowE = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowE as unknown as HTMLElement);
    await ensureRackListView();
    // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part E: rack intact — front = 1, rear = 0");

    const rackRowE = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowE as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part E: exactly one placement card at U1 confirmed");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part E: device intact — placed badge");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part E: model intact");

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

    // ── PART G: Reopen — verify full hierarchy graph survives clean close ──────

    log(`part G: reopening repository at ${repoPath}`);
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part G: repository reopened");

    log("part G: verifying full hierarchy graph after clean close and reopen");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    await expectLocationRackCount("[data-location-code]", locationName, 1);
    log("part G: location confirmed — rack count = 1");

    const locRowG = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locRowG as unknown as HTMLElement);
    await ensureRackListView();
    // rack-add-btn can appear before listRacks() finishes — use 30 s to allow data to load
    await findRowByExactName("[data-rack-code]", rackName, 30_000);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    await expectRackPlacementCounts(rackName, 1, 0);
    log("part G: rack confirmed — front = 1, rear = 0");

    // Enter rack detail and verify placement
    const rackRowG = await findRowByExactName("[data-rack-code]", rackName);
    await browser.execute((el: HTMLElement) => el.click(), rackRowG as unknown as HTMLElement);
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    await expectExactlyOnePlacement(deviceCode, PLACE_U);
    log("part G: placement card at U1 confirmed in rack detail");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, modelName, "placed");
    log("part G: device confirmed — placed badge");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part G: model confirmed — full hierarchy graph survives clean close");

    log("Stage 3B.2 hierarchy guards spec complete");
  });
});
