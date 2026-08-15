/**
 * Placement inspector workflows E2E — Stage 3C.
 *
 * Covers the four placement workflows Stage 3C scoped as MISSING in
 * docs/E2E_WDIO_COVERAGE_GAPS.md's gap analysis (all selectors already
 * present in application source — no production code changed to enable
 * this spec):
 *
 *   PART A — Create fixture: Location, Rack, Device Model (2U server), Device
 *   PART B — Place device at U1
 *   PART C — Edit placement height U via EditPlacementModal (height-u-input)
 *             — a distinct IPC path from the start-U move already covered by
 *             placement-lifecycle.e2e.ts
 *   PART D — Remove placement via EditPlacementModal's own remove button
 *             (distinct confirm label "Remove placement" — not the same
 *             control as PlacementInspectorPanel's "remove-from-rack-btn",
 *             already covered by placement-lifecycle.e2e.ts)
 *   PART E — Re-place the device (fresh placement for the inspector-nav checks)
 *   PART F — PlacementInspectorPanel → edit-target-device-btn: opens
 *             DeviceFormModal pre-filled with the placed device; rename and
 *             verify the change is reflected in the placed card title
 *   PART G — Create a rack-object Device Model (device_type="rack_object")
 *             and place it directly from the palette (rack objects are
 *             placed straight from their Model — no separate Device record)
 *   PART H — PlacementInspectorPanel → edit-target-model-btn: opens
 *             DeviceModelFormModal pre-filled with the rack object's model;
 *             rename and verify the change is reflected in the placed card
 *   PART I — Aggregate + persistence: save, close, reopen — verify both
 *             renamed placements survive
 *
 * Selector contract (no new selectors — all already present in application source):
 *   EditPlacementModal    — open-edit-modal-btn, height-u-input, save-btn, remove-btn
 *   Remove confirm dialog — title "Remove placement?", confirmLabel "Remove placement"
 *   PlacementInspector    — edit-target-device-btn, edit-target-model-btn
 *   Rack-object palette   — button[data-testid^="place-btn-model-"]
 *   Rack-object model     — field-device-type value "rack_object"
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
  navigateToRackDetail,
  clickConfirmDialogAction,
  waitForConfirmDialogClosed,
  placeDeviceAtU,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[inspector ${ts}] ${msg}`);
}

/**
 * Click a placed card (scoped by CSS selector) and wait for the inspector.
 *
 * RackDetailPanel.refreshAfterMutation auto-selects a card immediately after
 * it is placed (or after some edits), so the inspector can already be open
 * — clicking an already-selected card toggles it OFF (deselect), hiding the
 * inspector instead of opening it. Check first and skip the click when the
 * inspector is already showing what we're waiting for — the same guard
 * placement-lifecycle.e2e.ts uses for its own post-placement inspector check.
 */
async function openInspectorForCard(cardSel: string, waitTestId: string): Promise<void> {
  const alreadyOpen = await browser.$(`[data-testid="${waitTestId}"]`).isDisplayed().catch(() => false);
  if (!alreadyOpen) {
    const card = await browser.$(cardSel);
    await browser.execute((el: HTMLElement) => el.click(), card as unknown as HTMLElement);
    try {
      await browser.$(`[data-testid="${waitTestId}"]`).waitForDisplayed({
        timeout: 10_000,
        timeoutMsg: `${waitTestId} did not appear in inspector after clicking placed card`,
      });
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const diag: any = await browser.execute(() => ({
        openEditModalBtn: !!document.querySelector('[data-testid="open-edit-modal-btn"]'),
        editDeviceBtn: !!document.querySelector('[data-testid="edit-target-device-btn"]'),
        editModelBtn: !!document.querySelector('[data-testid="edit-target-model-btn"]'),
        removeFromRackBtn: !!document.querySelector('[data-testid="remove-from-rack-btn"]'),
        emptyState: document.body.textContent?.includes("No placement selected") ?? false,
      }));
      log(`openInspectorForCard DIAG (waiting for ${waitTestId}): ${JSON.stringify(diag)}`);
      throw e;
    }
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — placement inspector workflows", () => {
  it("edits placement height, removes via edit modal, and navigates to target device/model from the inspector", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `pin${suffix}`;
    const repoName = `WDIO Inspector ${suffix}`;

    const locationName = `Inspector Location ${suffix}`;
    const rackName     = `Inspector Rack ${suffix}`;
    const modelName    = `Inspector Model ${suffix}`;
    const deviceName   = `Inspector Device ${suffix}`;
    const deviceRenamed = `Inspector Device Renamed ${suffix}`;
    const rackObjectName = `Inspector RackObj ${suffix}`;
    const rackObjectRenamed = `Inspector RackObj Renamed ${suffix}`;

    const RACK_HEIGHT = 20;
    const MODEL_HEIGHT = 2;
    const DEVICE_U = 1;
    const HEIGHT_OVERRIDE = 3;
    const RACK_OBJECT_U = 10;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Create fixture ────────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });

    log("part A: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormCloseOrError("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);

    const locationRow = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRow as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part A: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", String(RACK_HEIGHT));
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
    if (!deviceCode) throw new Error(`data-device-code attribute missing on row for "${deviceName}"`);
    log(`part A: device "${deviceName}" confirmed, code=${deviceCode}`);

    // ── PART B: Place device at U1 ────────────────────────────────────────────

    log("part B: navigating to rack detail and placing device");
    await navigateToRackDetail(locationName, rackName);
    await placeDeviceAtU(deviceCode, DEVICE_U);
    await browser.waitUntil(
      async () => (await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`)).length > 0,
      { timeout: 15_000, timeoutMsg: `Placed card at U${DEVICE_U} for device "${deviceCode}" never appeared` },
    );
    log(`part B: device placed at U${DEVICE_U}`);

    // ── PART C: Edit placement height U via EditPlacementModal ───────────────

    log("part C: opening inspector for placed device card");
    await openInspectorForCard(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`, "open-edit-modal-btn");

    log("part C: opening EditPlacementModal");
    await browser.$('[data-testid="open-edit-modal-btn"]').click();
    await browser.$('[data-testid="height-u-input"]').waitForDisplayed({ timeout: 10_000 });

    log(`part C: setting height override to ${HEIGHT_OVERRIDE}`);
    await reactSetValue("height-u-input", String(HEIGHT_OVERRIDE));
    await clickWhenEnabled("save-btn");
    await waitForFormCloseOrError("save-btn");

    log("part C: verifying placed card reflects the height override");
    const expectedRangeAfterOverride = `U${DEVICE_U}–U${DEVICE_U + HEIGHT_OVERRIDE - 1}`;
    await browser.waitUntil(
      async () => {
        const card = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`);
        if (!(await card.isExisting())) return false;
        const title = await card.getAttribute("title");
        return title?.includes(expectedRangeAfterOverride) ?? false;
      },
      {
        timeout: 15_000,
        timeoutMsg: `Placed card never showed the overridden range "${expectedRangeAfterOverride}"`,
      },
    );
    log(`part C: height override verified — card shows range "${expectedRangeAfterOverride}"`);

    // ── PART D: Remove via EditPlacementModal's remove button ────────────────

    log("part D: opening inspector to remove via EditPlacementModal");
    await openInspectorForCard(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`, "open-edit-modal-btn");
    await browser.$('[data-testid="open-edit-modal-btn"]').click();
    await browser.$('[data-testid="remove-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part D: clicking remove-btn (distinct from PlacementInspectorPanel's remove-from-rack-btn)");
    // EditPlacementModal is itself a Modal, and its nested ConfirmDialog is
    // also a Modal — two [data-testid="modal-backdrop"] elements exist in the
    // DOM at once while the confirm dialog is open, so a bare backdrop-scoped
    // query can resolve to the wrong one. confirm-dialog-confirm/-cancel are
    // unique testids on the dialog's own buttons regardless of nesting — use
    // the existing clickConfirmDialogAction helper (browser.execute()
    // synthetic click; native click's mousedown can be intercepted by the
    // dialog's own backdrop before it reaches the button).
    const removeBtn = await browser.$('[data-testid="remove-btn"]');
    await browser.execute((el: HTMLElement) => el.click(), removeBtn as unknown as HTMLElement);

    await browser.$('[data-testid="confirm-dialog-confirm"]').waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: 'ConfirmDialog ("Remove placement?") did not appear after clicking remove-btn',
    });
    log("part D: confirming removal (ConfirmDialog title \"Remove placement?\")");
    await clickConfirmDialogAction("confirm-dialog-confirm");
    await waitForConfirmDialogClosed();

    await browser.waitUntil(
      async () => (await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`)).length === 0,
      { timeout: 15_000, timeoutMsg: "Placed card still present after remove-btn confirmation" },
    );
    log("part D: placement removed via EditPlacementModal's remove button");

    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    const deviceRowAfterRemoval = await findRowByExactName("[data-device-code]", deviceName);
    const textAfterRemoval = await deviceRowAfterRemoval.getText();
    if (!textAfterRemoval.toLowerCase().includes("unplaced")) {
      throw new Error(`Expected device to show "unplaced" after remove-btn removal, got: "${textAfterRemoval}"`);
    }
    log("part D: device is unplaced after removal");

    // ── PART E: Re-place the device for the inspector-nav checks ─────────────

    log("part E: re-placing device for inspector navigation checks");
    await navigateToRackDetail(locationName, rackName);
    await placeDeviceAtU(deviceCode, DEVICE_U);
    await browser.waitUntil(
      async () => (await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`)).length > 0,
      { timeout: 15_000, timeoutMsg: `Re-placed card at U${DEVICE_U} never appeared` },
    );
    log("part E: device re-placed");

    // ── PART F: PlacementInspectorPanel → edit-target-device-btn ─────────────

    log("part F: opening inspector and navigating to target device");
    await openInspectorForCard(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`, "edit-target-device-btn");
    await browser.$('[data-testid="edit-target-device-btn"]').click();

    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: "DeviceFormModal did not open after clicking edit-target-device-btn",
    });
    const nameFieldValue = await browser.$('[data-testid="field-name"]').getValue();
    if (nameFieldValue !== deviceName) {
      throw new Error(`Expected DeviceFormModal to be pre-filled with "${deviceName}", got "${nameFieldValue}"`);
    }
    log("part F: DeviceFormModal opened pre-filled with the placed device");

    await reactSetValue("field-name", deviceRenamed);
    await clickWhenEnabled("device-form-submit");
    await waitForFormCloseOrError("device-form-submit");

    log("part F: verifying placed card reflects the renamed device");
    await browser.waitUntil(
      async () => {
        const card = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`);
        if (!(await card.isExisting())) return false;
        const title = await card.getAttribute("title");
        return title?.includes(deviceRenamed) ?? false;
      },
      { timeout: 15_000, timeoutMsg: `Placed card title never reflected the renamed device "${deviceRenamed}"` },
    );
    log(`part F: placed card title now reflects "${deviceRenamed}"`);

    // ── PART G: Create + place a rack-object model ────────────────────────────

    log("part G: creating rack-object device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "rack_object");
    await reactSetValue("field-name", rackObjectName);
    await reactSetValue("field-height-u", "1");
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");
    await findRowByExactName("[data-model-code]", rackObjectName);
    log(`part G: rack-object model "${rackObjectName}" confirmed`);

    log("part G: placing rack object directly from the palette");
    await navigateToRackDetail(locationName, rackName);
    // Rack objects are placed straight from their Device Model — no separate
    // Device record exists for them (see PlacementPalettePanel's rackObjectModels).
    // The palette button's data-testid is keyed by the model's internal id
    // (place-btn-model-${m.id}), not its human-readable code
    // (data-model-code) — match by aria-label ("Place <name>") instead, which
    // PlacementPalettePanel derives from the same model name we just set.
    const rackObjectBtnSel = `button[aria-label="Place ${rackObjectName}"]`;
    await browser.waitUntil(() => browser.$(rackObjectBtnSel).isDisplayed(), {
      timeout: 15_000,
      timeoutMsg: `Palette place button for rack object "${rackObjectName}" never appeared`,
    });
    await browser.$(rackObjectBtnSel).click();

    await browser.waitUntil(() => browser.$('[data-testid="place-btn"]').isEnabled(), {
      timeout: 30_000,
      timeoutMsg: "PlacePlacementModal place-btn never became enabled for rack object",
    });
    await browser.$('[data-testid="start-u-input"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="start-u-input"]').addValue(String(RACK_OBJECT_U));
    await clickWhenEnabled("place-btn");
    await waitForFormCloseOrError("place-btn", {
      timeout: 60_000,
      errorLabel: "Placement failed",
      timeoutLabel: "Rack object placement modal",
    });

    await browser.waitUntil(
      async () => (await browser.$$(`[data-testid^="placed-"][data-start-u="${RACK_OBJECT_U}"]`)).length > 0,
      { timeout: 15_000, timeoutMsg: `Rack object placed card at U${RACK_OBJECT_U} never appeared` },
    );
    log(`part G: rack object placed at U${RACK_OBJECT_U}`);

    // ── PART H: PlacementInspectorPanel → edit-target-model-btn ──────────────

    log("part H: opening inspector and navigating to target model");
    await openInspectorForCard(`[data-testid^="placed-"][data-start-u="${RACK_OBJECT_U}"]`, "edit-target-model-btn");
    await browser.$('[data-testid="edit-target-model-btn"]').click();

    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: "DeviceModelFormModal did not open after clicking edit-target-model-btn",
    });
    const modelNameFieldValue = await browser.$('[data-testid="field-name"]').getValue();
    if (modelNameFieldValue !== rackObjectName) {
      throw new Error(
        `Expected DeviceModelFormModal to be pre-filled with "${rackObjectName}", got "${modelNameFieldValue}"`,
      );
    }
    log("part H: DeviceModelFormModal opened pre-filled with the rack object's model");

    await reactSetValue("field-name", rackObjectRenamed);
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");

    log("part H: verifying rack-object placed card reflects the renamed model");
    await browser.waitUntil(
      async () => {
        const card = await browser.$(`[data-testid^="placed-"][data-start-u="${RACK_OBJECT_U}"]`);
        if (!(await card.isExisting())) return false;
        const title = await card.getAttribute("title");
        return title?.includes(rackObjectRenamed) ?? false;
      },
      { timeout: 15_000, timeoutMsg: `Rack object card title never reflected "${rackObjectRenamed}"` },
    );
    log(`part H: rack-object card title now reflects "${rackObjectRenamed}"`);

    // ── PART I: Aggregate + persistence ───────────────────────────────────────

    log("part I: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part I: repository closed");

    log(`part I: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part I: repository reopened");

    log("part I: verifying both renamed placements survive reopen");
    await navigateToRackDetail(locationName, rackName);

    await browser.waitUntil(
      async () => {
        const card = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${DEVICE_U}"]`);
        if (!(await card.isExisting())) return false;
        const title = await card.getAttribute("title");
        return title?.includes(deviceRenamed) ?? false;
      },
      { timeout: 15_000, timeoutMsg: `Renamed device placement did not persist after reopen` },
    );
    log(`part I: renamed device "${deviceRenamed}" persisted at U${DEVICE_U}`);

    await browser.waitUntil(
      async () => {
        const card = await browser.$(`[data-testid^="placed-"][data-start-u="${RACK_OBJECT_U}"]`);
        if (!(await card.isExisting())) return false;
        const title = await card.getAttribute("title");
        return title?.includes(rackObjectRenamed) ?? false;
      },
      { timeout: 15_000, timeoutMsg: `Renamed rack-object placement did not persist after reopen` },
    );
    log(`part I: renamed rack object "${rackObjectRenamed}" persisted at U${RACK_OBJECT_U}`);

    log("Stage 3C placement inspector workflows spec complete");
  });
});
