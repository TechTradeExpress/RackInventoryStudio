/**
 * Inventory entity delete flows — Stage 3B.2
 *
 * Covers successful deletion of Device and Device Model, plus the cancel
 * assertion for Device, using an isolated temporary repository.
 *
 *   PART A — Create fixture: Device Model (unused), Device (unplaced, no model)
 *   PART B — Save, close, reopen — verify both entities persisted
 *   PART C — Cancel assertion: Device delete dialog title verified; entity survives
 *   PART D — Delete Device (unplaced, no model assigned)
 *   PART E — Delete Device Model (not referenced by any device or placement)
 *   PART F — Aggregate verification before save
 *   PART G — Persistence: save + close + reopen → verify both gone
 *
 * Selector contract:
 *   Delete buttons    — aria-label="Delete <name>" scoped to entity row (not CSS-interpolated)
 *   ConfirmDialog     — data-testid="confirm-dialog-confirm" / confirm-dialog-cancel
 *   Modal             — data-testid="modal", role="dialog", aria-label="Delete "<name>"?"
 *   Delete error      — data-testid="device-delete-error" / "device-model-delete-error"
 *   Row selectors     — [data-device-code], [data-model-code]
 *   Name cell         — <strong> child of each row
 *
 * Hierarchy delete flows (Rack, Location) are covered by entity-deletes-hierarchy.e2e.ts.
 * Relationship guard workflows are covered by:
 *   - destructive-guards-inventory.e2e.ts (Device model guard, Device guard)
 *   - destructive-guards-hierarchy.e2e.ts (Location guard, Rack guard)
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
  expectNoRowByName,
  clickRowDeleteAction,
  expectDeleteDialog,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  expectNoDeleteError,
  expectDeviceRowState,
  getEntityNamesInRows,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[deletes-inventory ${ts}] ${msg}`);
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

describe("Rack Inventory Studio — inventory entity delete flows", () => {
  it("creates Device Model and Device, exercises cancel and successful deletes, confirms persistence", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `dli${suffix}`;
    const repoName = `WDIO Deletes Inventory ${suffix}`;

    const modelName  = `Delete Model ${suffix}`;
    const deviceName = `Delete Device ${suffix}`;

    log(`suffix=${suffix}  repoCode=${repoCode}`);

    // ── PART A: Create fixture ────────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    // Create Device Model (unused — no device will reference it)
    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", "1");
    await clickWhenEnabled("model-form-submit");
    await waitForFormClose("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed`);

    // Create Device (unplaced, no model assigned, status planned)
    log("part A: creating device");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);
    // No model assigned — leave SearchableSelect at default "— none —"
    await clickWhenEnabled("device-form-submit");
    await waitForFormClose("device-form-submit");
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

    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await expectExactlyOneRowByName("[data-model-code]", modelName);
    log("part B: device model persisted");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await expectExactlyOneRowByName("[data-device-code]", deviceName);
    await expectDeviceRowState(deviceName, null, "unplaced");
    log("part B: device persisted — unplaced, no model");

    log("part B: fixture confirmed after reopen");

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

    // ── PART F: Aggregate verification before save ────────────────────────────

    log("part F: aggregate verification");

    await clickNav("devices");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-device-code]");
        return !names.includes(deviceName);
      },
      { timeout: 10_000, timeoutMsg: `Device "${deviceName}" still present in aggregate check` },
    );
    await expectNoDeleteError("device-delete-error");
    log("part F: device absent");

    await clickNav("device_models");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-model-code]");
        return !names.includes(modelName);
      },
      { timeout: 10_000, timeoutMsg: `Model "${modelName}" still present in aggregate check` },
    );
    await expectNoDeleteError("device-model-delete-error");
    log("part F: device model absent");

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part F: ConfirmDialog is unexpectedly open after all deletions");
    }
    log("part F: no ConfirmDialog open — aggregate verification passed");

    // ── PART G: Save, close, reopen — persistence verification ───────────────

    log("part G: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part G: repository closed");

    log(`part G: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part G: repository reopened");

    await clickNav("devices");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-device-code]");
        return !names.includes(deviceName);
      },
      { timeout: 15_000, timeoutMsg: `Device "${deviceName}" still present after reopen` },
    );
    await expectNoDeleteError("device-delete-error");
    log("part G: device absent after reopen");

    await clickNav("device_models");
    await browser.waitUntil(
      async () => {
        const names = await getEntityNamesInRows("[data-model-code]");
        return !names.includes(modelName);
      },
      { timeout: 15_000, timeoutMsg: `Model "${modelName}" still present after reopen` },
    );
    await expectNoDeleteError("device-model-delete-error");
    log("part G: device model absent after reopen");

    if (await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()) {
      throw new Error("Part G: ConfirmDialog is unexpectedly open after reopen");
    }

    log("part G: persistence verified — device and model gone after save + reopen");
    log("Stage 3B.2 inventory deletes spec complete");
  });
});
