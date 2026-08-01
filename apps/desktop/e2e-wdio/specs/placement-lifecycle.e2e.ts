/**
 * Placement lifecycle E2E — Stage 3A.
 *
 * Full placement lifecycle through the production UI with no mocks:
 *
 *   PART 1 — Create isolated inventory and initial placement at U1
 *   PART 2 — Edit placement: move from U1 to U5 via PlacementInspectorPanel → EditPlacementModal
 *   PART 3 — Persist the moved placement: save + close + reopen → verify U5 remains
 *   PART 4 — Remove placement via PlacementInspectorPanel → ConfirmDialog
 *   PART 5 — Persist the removal: save + close + reopen → verify device/model/rack exist
 *
 * Rack geometry:
 *   Rack height  : 14U  (allows U1 and U5 without overlap)
 *   Model height : 2U   (occupies 2 rows; U1 occupies U1–U2, U5 occupies U5–U6)
 *   Initial pos  : U1   (start_u = 1)
 *   Moved pos    : U5   (start_u = 5)
 *
 * Selector contract (no new selectors added — all inherited from Stages 1 and 2):
 *   Placed card    — [data-testid^="placed-"][data-device-code="${code}"]
 *                    also [data-start-u="${u}"] for position filtering
 *   Inspector      — open-edit-modal-btn, remove-from-rack-btn
 *   Edit modal     — start-u-input, save-btn, remove-btn (not used here)
 *   Confirm dialog — scoped via modal-backdrop portal; button.btn-danger via browser.execute()
 *                    (native "button=Remove from rack" text selector avoided: DOM order
 *                    ambiguity with inspector button; backdrop closes on native mousedown)
 *   Existing       — palette-drop-zone, place-btn, start-u-input (PlacePlacementModal),
 *                    unsaved-changes-save, repository-close-action,
 *                    repository-open-path-input, repository-open-path-submit,
 *                    repository-active-path, nav-*, data-location-code, data-rack-code,
 *                    data-device-code, data-model-code
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
import { findRowByExactName, navigateToRackDetail } from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[placement ${ts}] ${msg}`);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Return the expected U-range string for a device of `heightU` rows placed at `startU`.
 * Uses the Unicode en-dash (U+2013) that the production card title uses.
 */
function expectedRange(startU: number, heightU: number): string {
  return `U${startU}–U${startU + heightU - 1}`;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — placement lifecycle", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it(
    "places, moves, persists, removes and verifies the full placement lifecycle",
    async () => {
      const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
      const suffix = Date.now().toString(36);
      const repoCode = `plc${suffix}`;
      const repoName  = `WDIO Placement ${suffix}`;

      // Entity names: unique per run to prevent cross-run collisions.
      const locationName = `E2E Loc ${suffix}`;
      const rackName     = `E2E Rack ${suffix}`;
      const modelName    = `E2E Model ${suffix}`;
      const deviceName   = `E2E Device ${suffix}`;

      // Rack geometry — deterministic; no overlap between initial and moved positions.
      const RACK_HEIGHT  = 14; // U
      const MODEL_HEIGHT =  2; // U (device occupies 2 U rows)
      const INITIAL_U    =  1; // placed first at U1 (occupies U1–U2)
      const MOVED_U      =  5; // moved to U5 (occupies U5–U6)

      // Pre-computed expected title ranges for both positions.
      const RANGE_AT_INITIAL = expectedRange(INITIAL_U, MODEL_HEIGHT); // "U1–U2"
      const RANGE_AT_MOVED   = expectedRange(MOVED_U, MODEL_HEIGHT);   // "U5–U6"

      log(`suffix=${suffix} repoCode=${repoCode}`);

      // ── PART 1: Create inventory and place at U1 ───────────────────────────

      log("part 1: waiting for landing screen");
      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "Landing screen did not appear at spec start",
      });

      log("part 1: creating isolated repository");
      const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
      await expectActiveRepositoryPath(repoPath);
      log(`part 1: repository active at ${repoPath}`);

      // Location
      log("part 1: adding location");
      await clickNav("locations");
      await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="location-add-btn"]').click();
      await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
      await reactSetValue("field-name", locationName);
      await clickWhenEnabled("location-form-submit");
      await findRowByExactName("[data-location-code]", locationName);
      log("part 1: location created");

      // Rack (click location row → Racks tab opens automatically)
      log("part 1: clicking location row to go to Racks");
      const locRow = await findRowByExactName("[data-location-code]", locationName);
      await browser.execute((el: HTMLElement) => el.click(), locRow as unknown as HTMLElement);
      await browser.$('[data-testid="nav-racks"]').waitForDisplayed({ timeout: 10_000 });

      log("part 1: adding rack");
      await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="rack-add-btn"]').click();
      await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
      await reactSetValue("field-name", rackName);
      await reactSetValue("field-height-u", String(RACK_HEIGHT));
      await clickWhenEnabled("rack-form-submit");
      await findRowByExactName("[data-rack-code]", rackName);
      log("part 1: rack created");

      // Device Model
      log("part 1: adding device model");
      await clickNav("device_models");
      await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="model-add-btn"]').click();
      await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
      await reactSelectValue("field-device-type", "server");
      await reactSetValue("field-name", modelName);
      await reactSetValue("field-height-u", String(MODEL_HEIGHT));
      await clickWhenEnabled("model-form-submit");
      await findRowByExactName("[data-model-code]", modelName);
      log("part 1: device model created (2U server)");

      // Device
      log("part 1: adding device");
      await clickNav("devices");
      await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="device-add-btn"]').click();
      await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
      await reactSelectValue("field-device-type", "server");
      await reactSetValue("field-name", deviceName);

      // Assign device model so effective_height_u is resolved from the model.
      await browser.$('[data-testid="field-device-model-trigger"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="field-device-model-trigger"]').click();
      await browser.$('[data-testid="field-device-model-search"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="field-device-model-search"]').addValue(modelName);
      await selectSearchableOption(modelName);
      await clickWhenEnabled("device-form-submit");

      // Capture device code from the device row.
      let deviceCode = "";
      await browser.waitUntil(
        async () => {
          try {
            const rows = await browser.$$("[data-device-code]");
            for (const row of rows) {
              const text = await row.getText();
              if (text.includes(deviceName)) {
                deviceCode = (await row.getAttribute("data-device-code")) ?? "";
                return deviceCode !== "";
              }
            }
            return false;
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Device row for "${deviceName}" never appeared` },
      );
      log(`part 1: device created, code=${deviceCode}`);

      // Verify unplaced badge.
      {
        const deviceRow = await findRowByExactName("[data-device-code]", deviceName);
        const rowText = await deviceRow.getText();
        if (!rowText.toLowerCase().includes("unplaced")) {
          throw new Error(
            `Expected device row to contain "unplaced" badge before placement, got: "${rowText}"`,
          );
        }
        log("part 1: unplaced badge confirmed before placement");
      }

      // Navigate to rack detail and place at U1 via palette Place button.
      log("part 1: navigating to rack detail");
      await navigateToRackDetail(locationName, rackName);

      log(`part 1: clicking Place button for device ${deviceCode} in palette`);
      const paletteBtnSel = `button[data-testid^="place-btn-device-"][data-device-code="${deviceCode}"]`;
      await browser.waitUntil(
        async () => {
          try {
            return await browser.$(paletteBtnSel).isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Palette Place button for device "${deviceCode}" never appeared` },
      );
      await browser.$(paletteBtnSel).click();

      log("part 1: waiting for PlacePlacementModal");
      await browser.waitUntil(
        async () => {
          try {
            return await browser.$('[data-testid="place-btn"]').isEnabled();
          } catch {
            return false;
          }
        },
        { timeout: 30_000, timeoutMsg: "PlacePlacementModal place-btn never became enabled" },
      );

      log(`part 1: filling start U = ${INITIAL_U}`);
      const suInput = browser.$('[data-testid="start-u-input"]');
      await suInput.waitForDisplayed({ timeout: 10_000 });
      await suInput.addValue(String(INITIAL_U));

      log("part 1: submitting placement");
      await clickWhenEnabled("place-btn");

      // Wait for PlacePlacementModal to close.
      // Uses isExisting() for DOM-removal detection — no false-positive catch on errors.
      await browser.waitUntil(
        async () => {
          const btn = browser.$('[data-testid="place-btn"]');
          if (!(await btn.isExisting())) return true; // modal removed from DOM
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

      // Verify initial placement:
      //   • exactly 1 card for this device (scoped to rack diagram via data-testid^="placed-")
      //   • card is at U1 (data-start-u="1")
      //   • title references the model name
      //   • title contains the effective 2U range (RANGE_AT_INITIAL = "U1–U2")
      log(`part 1: verifying placed card at U${INITIAL_U}`);
      await browser.waitUntil(
        async () => {
          const cards = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
          return cards.length > 0;
        },
        { timeout: 30_000, timeoutMsg: `Placed card at U${INITIAL_U} for device "${deviceCode}" never appeared` },
      );

      const allCardsAfterPlace = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`);
      if (allCardsAfterPlace.length !== 1) {
        throw new Error(
          `Expected exactly 1 placed card for device ${deviceCode} after placement, found ${allCardsAfterPlace.length}`,
        );
      }
      const cardPlaceStartU = await allCardsAfterPlace[0].getAttribute("data-start-u");
      if (cardPlaceStartU !== String(INITIAL_U)) {
        throw new Error(`Expected placed card at U${INITIAL_U}, found data-start-u="${cardPlaceStartU}"`);
      }

      const placedCardU1 = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
      const titleAtU1 = await placedCardU1.getAttribute("title");
      if (!titleAtU1?.includes(modelName)) {
        throw new Error(`Placed card title does not reference model "${modelName}". Got: "${titleAtU1}"`);
      }
      if (!titleAtU1?.includes(RANGE_AT_INITIAL)) {
        throw new Error(`Placed card title missing expected 2U range "${RANGE_AT_INITIAL}". Got: "${titleAtU1}"`);
      }
      log(`part 1: 1 card at U${INITIAL_U}, model "${modelName}", range "${RANGE_AT_INITIAL}" — title="${titleAtU1}"`);

      // ── PART 2: Edit placement — move from U1 to U5 ───────────────────────

      // After PlacePlacementModal closes, RackDetailPanel.refreshAfterMutation auto-selects
      // the newly placed card.  The PlacementInspectorPanel is therefore already visible.
      // Clicking the already-selected card would TOGGLE it OFF (deselect), hiding the
      // inspector.  Check first and skip the click when the inspector is already open.
      log(`part 2: checking if inspector already open from post-placement auto-selection`);
      const editModalBtnEl = browser.$('[data-testid="open-edit-modal-btn"]');
      const inspectorAlreadyOpenP2 = await editModalBtnEl.isDisplayed().catch(() => false);
      if (!inspectorAlreadyOpenP2) {
        log(`part 2: inspector not open — clicking placed card at U${INITIAL_U}`);
        const cardToClick = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
        await browser.execute(
          (el: HTMLElement) => el.click(),
          cardToClick as unknown as HTMLElement,
        );
        log("part 2: waiting for inspector (open-edit-modal-btn)");
        await editModalBtnEl.waitForDisplayed({
          timeout: 10_000,
          timeoutMsg: "PlacementInspectorPanel open-edit-modal-btn did not appear after clicking placed card",
        });
      } else {
        log(`part 2: inspector already open (auto-selected after placement) — skipping card click`);
      }

      log("part 2: clicking open-edit-modal-btn");
      await editModalBtnEl.click();

      log("part 2: waiting for EditPlacementModal (start-u-input)");
      await browser.$('[data-testid="start-u-input"]').waitForDisplayed({
        timeout: 10_000,
        timeoutMsg: "EditPlacementModal start-u-input did not appear",
      });

      log(`part 2: setting start U to ${MOVED_U}`);
      // reactSetValue replaces the current value via the React native input setter.
      await reactSetValue("start-u-input", String(MOVED_U));

      log("part 2: clicking save-btn");
      await clickWhenEnabled("save-btn", 5_000);

      log("part 2: waiting for EditPlacementModal to close");
      await waitForFormCloseOrError("save-btn");

      log(`part 2: verifying placed card moved to U${MOVED_U}`);
      await browser.waitUntil(
        async () => {
          const cards = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
          return cards.length > 0;
        },
        { timeout: 30_000, timeoutMsg: `Moved placed card at U${MOVED_U} never appeared` },
      );

      // Verify post-move state:
      //   • exactly 1 card for this device in the rack diagram
      //   • that card is at U5 (data-start-u="5")
      //   • no second card remains at U1 or any other position
      const allCardsAfterMove = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`);
      if (allCardsAfterMove.length !== 1) {
        throw new Error(
          `Expected exactly 1 placed card for device ${deviceCode} after move, found ${allCardsAfterMove.length}`,
        );
      }
      const cardMoveStartU = await allCardsAfterMove[0].getAttribute("data-start-u");
      if (cardMoveStartU !== String(MOVED_U)) {
        throw new Error(`Expected single card at U${MOVED_U}, found data-start-u="${cardMoveStartU}"`);
      }

      // Verify U1 is empty — use rack-card scope to avoid false match from Devices table rows.
      log(`part 2: verifying U${INITIAL_U} is now empty`);
      const cardsAtU1AfterMove = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
      if (cardsAtU1AfterMove.length > 0) {
        throw new Error(
          `Device "${deviceCode}" has ${cardsAtU1AfterMove.length} card(s) at U${INITIAL_U} after move to U${MOVED_U}`,
        );
      }

      // Verify model association and effective 2U range in card title.
      log(`part 2: verifying model and 2U range in moved card title`);
      const movedCard = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
      const titleAtU5 = await movedCard.getAttribute("title");
      if (!titleAtU5?.includes(modelName)) {
        throw new Error(`Moved card title does not reference model "${modelName}". Got: "${titleAtU5}"`);
      }
      if (!titleAtU5?.includes(RANGE_AT_MOVED)) {
        throw new Error(`Moved card title missing expected 2U range "${RANGE_AT_MOVED}". Got: "${titleAtU5}"`);
      }
      log(`part 2: 1 card at U${MOVED_U}, model "${modelName}", range "${RANGE_AT_MOVED}" — title="${titleAtU5}"`);

      // ── PART 3: Persist the moved placement ───────────────────────────────

      log("part 3: saving and closing repository");
      await clickNav("repository");
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="repository-close-action"]').click();

      log("part 3: saving through UnsavedChangesDialog");
      await clickWhenEnabled("unsaved-changes-save", 15_000);

      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 5_000,
        reverse: true,
      });
      log("part 3: repository saved and closed");

      log(`part 3: reopening repository at ${repoPath}`);
      await reactSetValue("repository-open-path-input", repoPath);
      await clickWhenEnabled("repository-open-path-submit");
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
      await expectActiveRepositoryPath(repoPath);
      log("part 3: repository reopened, active path verified");

      log("part 3: navigating to rack detail after reopen");
      await navigateToRackDetail(locationName, rackName);

      log(`part 3: verifying placement persisted at U${MOVED_U}`);
      await browser.waitUntil(
        async () => {
          const cards = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
          return cards.length > 0;
        },
        { timeout: 15_000, timeoutMsg: `Moved placement at U${MOVED_U} not found after reopen` },
      );

      // Verify exactly one placement card persists after reopen.
      const allCardsAfterReopen = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`);
      if (allCardsAfterReopen.length !== 1) {
        throw new Error(
          `Expected exactly 1 placed card for device ${deviceCode} after reopen, found ${allCardsAfterReopen.length}`,
        );
      }

      // Verify U1 is still empty after reopen.
      log(`part 3: verifying U${INITIAL_U} is still empty after reopen`);
      const cardsAtU1AfterReopen = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
      if (cardsAtU1AfterReopen.length > 0) {
        throw new Error(
          `Device "${deviceCode}" has ${cardsAtU1AfterReopen.length} card(s) at U${INITIAL_U} after reopen (expected empty)`,
        );
      }

      // Verify model association and effective 2U range persisted in card title.
      log(`part 3: verifying model and 2U range persisted in card title`);
      const persistedCard = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
      const persistedTitle = await persistedCard.getAttribute("title");
      if (!persistedTitle?.includes(modelName)) {
        throw new Error(`Persisted card title does not reference model "${modelName}". Got: "${persistedTitle}"`);
      }
      if (!persistedTitle?.includes(RANGE_AT_MOVED)) {
        throw new Error(`Persisted card title missing expected 2U range "${RANGE_AT_MOVED}". Got: "${persistedTitle}"`);
      }
      log(`part 3: 1 card at U${MOVED_U}, model "${modelName}", range "${RANGE_AT_MOVED}" — persistence verified`);

      // ── PART 4: Remove placement ───────────────────────────────────────────

      log(`part 4: clicking placed card at U${MOVED_U} to open inspector`);
      const cardForRemoval = await browser.$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
      await browser.execute(
        (el: HTMLElement) => el.click(),
        cardForRemoval as unknown as HTMLElement,
      );

      log("part 4: waiting for inspector (remove-from-rack-btn)");
      await browser.$('[data-testid="remove-from-rack-btn"]').waitForDisplayed({
        timeout: 10_000,
        timeoutMsg: "remove-from-rack-btn did not appear in inspector after clicking placed card",
      });

      log("part 4: clicking remove-from-rack-btn");
      // JS click only fires a synthetic click event — no mousedown/mouseup.
      // Native click fires mousedown which, after the ConfirmDialog portal inserts its
      // backdrop (position:fixed; inset:0; z-index:600), lands on the backdrop and
      // triggers handleBackdrop → onCancel → dialog immediately closes.
      const removeBtn = await browser.$('[data-testid="remove-from-rack-btn"]');
      await browser.execute(
        (el: HTMLElement) => el.click(),
        removeBtn as unknown as HTMLElement,
      );

      log("part 4: waiting for ConfirmDialog (modal-backdrop)");
      await browser.$('[data-testid="modal-backdrop"]').waitForDisplayed({
        timeout: 10_000,
        timeoutMsg: "ConfirmDialog modal-backdrop did not appear after clicking remove-from-rack-btn",
      });

      log("part 4: confirming removal");
      // Use browser.execute to fire the click entirely inside the browser JS context.
      // Significant WebDriver command overhead (beforeCommand gaps) between finding the
      // backdrop element and clicking creates a staleness window with native WebDriver.
      // Doing everything synchronously inside the browser eliminates that risk.
      // button.btn-danger is scoped inside modal-backdrop to avoid DOM-order ambiguity
      // with the inspector's remove-from-rack-btn (also labelled "Remove from rack").
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
        if (!backdrop) throw new Error("modal-backdrop not found in document");
        const btn = backdrop.querySelector("button.btn-danger");
        if (!btn) throw new Error("confirm button (btn-danger) not found inside modal-backdrop");
        (btn as HTMLElement).click();
      });

      // Wait until the placed card is removed from the DOM.
      // Uses $$ count — no catch block; any WebDriver error propagates and fails the test.
      log(`part 4: waiting for placed card at U${MOVED_U} to disappear`);
      await browser.waitUntil(
        async () => {
          const cards = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
          return cards.length === 0;
        },
        {
          timeout: 15_000,
          timeoutMsg: `Placed card at U${MOVED_U} still present in DOM after remove confirmation`,
        },
      );

      // Confirm zero placement cards remain for this device.
      const allCardsAfterRemove = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`);
      if (allCardsAfterRemove.length > 0) {
        throw new Error(
          `Expected 0 placed cards for device ${deviceCode} after removal, found ${allCardsAfterRemove.length}`,
        );
      }
      log("part 4: 0 placed cards remain in rack diagram");

      log("part 4: navigating to Devices to verify unplaced state");
      await clickNav("devices");
      await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

      {
        const deviceRowAfterRemoval = await findRowByExactName("[data-device-code]", deviceName);
        const rowTextAfterRemoval = await deviceRowAfterRemoval.getText();
        if (!rowTextAfterRemoval.toLowerCase().includes("unplaced")) {
          throw new Error(
            `Expected device row to show "unplaced" after removal, got: "${rowTextAfterRemoval}"`,
          );
        }
        log("part 4: device appears as unplaced in Devices panel");
      }

      // ── PART 5: Persist the removal ───────────────────────────────────────

      log("part 5: saving and closing repository");
      await clickNav("repository");
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="repository-close-action"]').click();

      log("part 5: saving through UnsavedChangesDialog");
      await clickWhenEnabled("unsaved-changes-save", 15_000);

      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 5_000,
        reverse: true,
      });
      log("part 5: repository saved and closed");

      log(`part 5: reopening repository at ${repoPath}`);
      await reactSetValue("repository-open-path-input", repoPath);
      await clickWhenEnabled("repository-open-path-submit");
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
      await expectActiveRepositoryPath(repoPath);
      log("part 5: repository reopened");

      // Verify device is unplaced in Devices panel after removal persisted.
      log("part 5: navigating to Devices to verify removal persisted");
      await clickNav("devices");
      await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

      const deviceRowFinal = await findRowByExactName("[data-device-code]", deviceName, 15_000);
      const deviceRowFinalText = await deviceRowFinal.getText();
      if (!deviceRowFinalText.toLowerCase().includes("unplaced")) {
        throw new Error(
          `Device "${deviceName}" does not show "unplaced" after removal persisted through reopen, got: "${deviceRowFinalText}"`,
        );
      }
      log("part 5: device is unplaced in Devices panel after reopen");

      // Verify device model still exists in the Device Models list.
      log("part 5: verifying device model still exists");
      await clickNav("device_models");
      await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await findRowByExactName("[data-model-code]", modelName, 15_000);
      log(`part 5: device model "${modelName}" still exists in Device Models list`);

      // Verify rack is still accessible and no placed card persists.
      // navigateToRackDetail throws if the location or rack no longer exists.
      log("part 5: navigating to rack detail to verify no placed card persists");
      await navigateToRackDetail(locationName, rackName);

      const allCardsAfterFinalReopen = await browser.$$(`[data-testid^="placed-"][data-device-code="${deviceCode}"]`);
      if (allCardsAfterFinalReopen.length > 0) {
        throw new Error(
          `Device "${deviceCode}" still has ${allCardsAfterFinalReopen.length} placed card(s) in rack after removal persisted through reopen`,
        );
      }
      log("part 5: 0 placed cards in rack — removal persisted correctly");
      log("all 5 parts passed");
    },
  );
});
