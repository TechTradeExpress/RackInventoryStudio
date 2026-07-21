/**
 * Entity delete flows — Stage 3B.2 (part 1 of 2)
 *
 * Covers four successful delete workflows through the production UI with an
 * isolated temporary repository:
 *
 *   PART A — Create fixture (Location, Rack, Device Model, Device)
 *   PART B — Save, close, reopen — verify all four entities persisted
 *   PART C — Cancel assertion (Device): dialog title verified; entity survives
 *   PART D — Delete Device (unplaced, no model)
 *   PART E — Delete Device Model (not referenced by any device)
 *   PART F — Delete Rack (no placements) + verify Location still present
 *   PART G — Delete Location (no racks)
 *   PART H — Aggregate verification before save
 *   PART I — Persistence: save + close + reopen → verify all four gone
 *
 * Selector contract:
 *   Delete buttons    — button[aria-label="Delete <name>"] scoped to entity row
 *   ConfirmDialog     — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal             — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error      — data-testid="location-delete-error|rack-delete-error|
 *                        device-model-delete-error|device-delete-error"
 *   Row selectors     — [data-location-code], [data-rack-code],
 *                        [data-model-code], [data-device-code]
 *   Name cell         — <strong> child of each row
 *
 * Relationship-guard workflows (workflows 5–8) are covered by the separate
 * entity-delete-guards.e2e.ts spec (Stage 3B.2 part 2).
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
  expectNoRowByName,
  clickRowDeleteAction,
  expectDeleteDialog,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  expectNoDeleteError,
  getEntityNamesInRows,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[entity-deletes ${ts}] ${msg}`);
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

describe("Rack Inventory Studio — entity delete flows", () => {
  it("creates fixture, deletes four entity types leaf-to-parent, and confirms persistence", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `del${suffix}`;
    const repoName = `WDIO Deletes ${suffix}`;

    const locationName  = `Delete Location ${suffix}`;
    const rackName      = `Delete Rack ${suffix}`;
    const modelName     = `Delete Model ${suffix}`;
    const deviceName    = `Delete Device ${suffix}`;

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

    // Navigate to location's racks via row click
    log("part A: clicking location row to navigate to Racks");
    const locationRowForRack = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForRack as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    // Create Rack (no placements — we never place any device here)
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

    // Create Device Model (not referenced by any device)
    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", "1");
    await (await waitForEnabled("model-form-submit")).click();
    await waitForFormClose("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed`);

    // Create Device (unplaced, no assigned model, status planned)
    log("part A: creating device");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);
    // No model assigned — leave SearchableSelect at default "— none —"
    await (await waitForEnabled("device-form-submit")).click();
    await waitForFormClose("device-form-submit");
    await findRowByExactName("[data-device-code]", deviceName);
    log(`part A: device "${deviceName}" confirmed (unplaced, no model)`);

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

    // Verify all four fixture entities exist after reopen
    log("part B: verifying fixture persistence");

    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    log("part B: location persisted");

    const locationRowForVerify = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForVerify as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await findRowByExactName("[data-rack-code]", rackName);
    await expectExactlyOneRowByName("[data-rack-code]", rackName);
    log("part B: rack persisted");

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part B: device model persisted");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    log("part B: device persisted");

    log("part B: all four fixture entities confirmed after reopen");

    // ── PART C: Cancel assertion ──────────────────────────────────────────────

    log("part C: cancel assertion — verifying Device dialog cancel does not delete");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    log("part C: dialog confirmed — clicking cancel");
    await clickConfirmDialogAction("confirm-dialog-cancel");
    await waitForConfirmDialogClosed();
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectNoDeleteError("device-delete-error");
    log("part C: device survives cancel — cancel assertion passed");

    // ── PART D: Delete Device ─────────────────────────────────────────────────

    log("part D: deleting device");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickRowDeleteAction("[data-device-code]", deviceName);
    await expectDeleteDialog(deviceName);
    log("part D: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("device-delete-error");
    await expectNoRowByName("[data-device-code]", deviceName);
    log(`part D: device "${deviceName}" deleted and gone from list`);

    // ── PART E: Delete Device Model ───────────────────────────────────────────

    log("part E: deleting device model");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await clickRowDeleteAction("[data-model-code]", modelName);
    await expectDeleteDialog(modelName);
    log("part E: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("device-model-delete-error");
    await expectNoRowByName("[data-model-code]", modelName);
    log(`part E: model "${modelName}" deleted and gone from list`);

    // ── PART F: Delete Rack + verify Location still present ───────────────────

    log("part F: navigating to location's racks to delete rack");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    const locationRowForRackDelete = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForRackDelete as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await findRowByExactName("[data-rack-code]", rackName);

    log("part F: deleting rack");
    await clickRowDeleteAction("[data-rack-code]", rackName);
    await expectDeleteDialog(rackName);
    log("part F: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("rack-delete-error");
    await expectNoRowByName("[data-rack-code]", rackName);
    log(`part F: rack "${rackName}" deleted and gone from list`);

    // Verify Location still exists and has no remaining racks
    log("part F: verifying location still exists after rack deletion");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await expectExactlyOneRowByName("[data-location-code]", locationName);
    log("part F: location still present");

    // Navigate into location and confirm racks panel is empty
    const locationRowAfterRackDelete = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowAfterRackDelete as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const remainingRackNames = await getEntityNamesInRows("[data-rack-code]");
    if (remainingRackNames.length > 0) {
      throw new Error(
        `Part F: expected 0 racks after deletion, found: ${remainingRackNames.join(", ")}`,
      );
    }
    log("part F: rack count = 0 confirmed");

    // ── PART G: Delete Location ───────────────────────────────────────────────

    log("part G: deleting location");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await clickRowDeleteAction("[data-location-code]", locationName);
    await expectDeleteDialog(locationName);
    log("part G: dialog confirmed — clicking confirm");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();
    await expectNoDeleteError("location-delete-error");
    await expectNoRowByName("[data-location-code]", locationName);
    log(`part G: location "${locationName}" deleted and gone from list`);

    // ── PART H: Aggregate verification before save ────────────────────────────

    log("part H: aggregate verification");

    await clickNav("devices");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-device-code]");
        return !names.includes(deviceName);
      },
      { timeout: 10_000, timeoutMsg: `Device "${deviceName}" still present in aggregate check` },
    );
    await expectNoDeleteError("device-delete-error");
    log("part H: device absent");

    await clickNav("device_models");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-model-code]");
        return !names.includes(modelName);
      },
      { timeout: 10_000, timeoutMsg: `Model "${modelName}" still present in aggregate check` },
    );
    await expectNoDeleteError("device-model-delete-error");
    log("part H: device model absent");

    await clickNav("locations");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-location-code]");
        return !names.includes(locationName);
      },
      { timeout: 10_000, timeoutMsg: `Location "${locationName}" still present in aggregate check` },
    );
    await expectNoDeleteError("location-delete-error");
    log("part H: location absent");

    // Confirm no ConfirmDialog is open
    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part H: ConfirmDialog is unexpectedly open after all deletions");
    }
    log("part H: no ConfirmDialog open — aggregate verification passed");

    // ── PART I: Save, close, reopen — persistence verification ───────────────

    log("part I: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await (await waitForEnabled("unsaved-changes-save")).click();
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part I: repository closed");

    log(`part I: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part I: repository reopened");

    // Device — navigate and confirm absent
    log("part I: verifying device is gone after reopen");
    await clickNav("devices");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-device-code]");
        return !names.includes(deviceName);
      },
      { timeout: 15_000, timeoutMsg: `Device "${deviceName}" still present after reopen` },
    );
    await expectNoDeleteError("device-delete-error");
    log("part I: device absent after reopen");

    // Device Model — navigate and confirm absent
    log("part I: verifying device model is gone after reopen");
    await clickNav("device_models");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-model-code]");
        return !names.includes(modelName);
      },
      { timeout: 15_000, timeoutMsg: `Model "${modelName}" still present after reopen` },
    );
    await expectNoDeleteError("device-model-delete-error");
    log("part I: device model absent after reopen");

    // Location — navigate and confirm absent (implies Rack is also gone)
    log("part I: verifying location is gone after reopen");
    await clickNav("locations");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-location-code]");
        return !names.includes(locationName);
      },
      { timeout: 15_000, timeoutMsg: `Location "${locationName}" still present after reopen` },
    );
    await expectNoDeleteError("location-delete-error");
    log("part I: location absent after reopen");

    // Confirm no stale ConfirmDialog
    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part I: ConfirmDialog is unexpectedly open after reopen");
    }

    log("part I: persistence verified — all four entities gone after save + reopen");
    log("Stage 3B.2 part 1 complete: entity-deletes spec passed");
  });
});
