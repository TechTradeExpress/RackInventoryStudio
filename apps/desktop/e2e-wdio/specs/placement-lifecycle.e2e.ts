/**
 * Placement lifecycle E2E — Stage 3A.
 *
 * Full placement lifecycle through the production UI with no mocks:
 *
 *   PART 1 — Create isolated inventory and initial placement at U1
 *   PART 2 — Edit placement: move from U1 to U5 via PlacementInspectorPanel → EditPlacementModal
 *   PART 3 — Persist the moved placement: save + close + reopen → verify U5 remains
 *   PART 4 — Remove placement via PlacementInspectorPanel → ConfirmDialog
 *   PART 5 — Persist the removal: save + close + reopen → verify device is unplaced
 *
 * Rack geometry:
 *   Rack height  : 14U  (allows U1 and U5 without overflow)
 *   Model height : 2U   (occupies 2 rows; U1 occupies U1–U2, U5 occupies U5–U6)
 *   Initial pos  : U1   (start_u = 1)
 *   Moved pos    : U5   (start_u = 5)
 *
 * Selector contract (no new selectors added — all inherited from Stages 1 and 2):
 *   Placed card    — [data-device-code="${code}"][data-start-u="${u}"]
 *                    also data-testid="placed-front-{placementId}"
 *   Inspector      — open-edit-modal-btn, remove-from-rack-btn
 *   Edit modal     — start-u-input, save-btn, remove-btn (not used here)
 *   Confirm dialog — scoped via modal-backdrop testid; button text "Remove from rack"
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
  waitForEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[placement ${ts}] ${msg}`);
}

function isMoveFailure(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith("Move failed");
}

// ── Internal navigation helpers ───────────────────────────────────────────────

async function clickNav(tab: string): Promise<void> {
  const el = await browser.$(`[data-testid="nav-${tab}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await el.click();
}

/**
 * Find the first row matching `text` among elements with the given CSS selector.
 * Returns the matched element.  Uses JS click workaround for <tr> elements.
 */
async function findRowByText(
  rowSelector: string,
  text: string,
  timeout = 15_000,
): Promise<WebdriverIO.Element> {
  let found: WebdriverIO.Element | null = null;
  await browser.waitUntil(
    async () => {
      try {
        const rows = await browser.$$(rowSelector);
        for (const row of rows) {
          const rowText = await row.getText();
          if (rowText.includes(text)) {
            found = row;
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    },
    { timeout, timeoutMsg: `Row matching "${text}" via "${rowSelector}" not found` },
  );
  return found!;
}

/**
 * Navigate to a rack detail panel: Locations tab → click location row →
 * wait for Racks tab → find and click rack row → wait for rack detail.
 *
 * Used in Parts 3 and 5 (after reopen) and in Part 4 (from within the same session).
 */
async function navigateToRackDetail(
  locationName: string,
  rackName: string,
): Promise<void> {
  await clickNav("locations");
  const locationRow = await findRowByText("[data-location-code]", locationName);
  // WebKitGTK marks <tr> as non-interactable — use JS click.
  await browser.execute(
    (el: HTMLElement) => el.click(),
    locationRow as unknown as HTMLElement,
  );
  await browser.$('[data-testid="nav-racks"]').waitForDisplayed({ timeout: 10_000 });
  await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

  const rackRow = await findRowByText("[data-rack-code]", rackName);
  await browser.execute(
    (el: HTMLElement) => el.click(),
    rackRow as unknown as HTMLElement,
  );
  await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
}

/**
 * Wait for EditPlacementModal to close after clicking save-btn.
 * Surfaces any error message from the modal footer.
 */
async function waitForEditModalClose(): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const btn = browser.$('[data-testid="save-btn"]');
        let isShown: boolean;
        try {
          isShown = await btn.isDisplayed();
        } catch {
          return true; // stale element reference → modal gone → success
        }
        if (!isShown) return true;
        // Surface footer error instead of swallowing it.
        try {
          const errEl = browser.$(".ft-msg.err");
          if (await errEl.isDisplayed()) {
            const errText = await errEl.getText();
            throw new Error(`Move failed — modal error: "${errText}"`);
          }
        } catch (inner) {
          if (isMoveFailure(inner)) throw inner;
        }
        return false;
      } catch (e) {
        if (isMoveFailure(e)) throw e;
        return false;
      }
    },
    {
      timeout: 30_000,
      timeoutMsg: "EditPlacementModal did not close after Save move (30 s timeout)",
    },
  );
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
      const locationName  = `E2E Loc ${suffix}`;
      const rackName      = `E2E Rack ${suffix}`;
      const modelName     = `E2E Model ${suffix}`;
      const deviceName    = `E2E Device ${suffix}`;

      // Rack geometry — deterministic; no overlap between initial and moved positions.
      const RACK_HEIGHT  = 14; // U
      const MODEL_HEIGHT =  2; // U (device occupies 2 U rows)
      const INITIAL_U    =  1; // placed first at U1 (occupies U1–U2)
      const MOVED_U      =  5; // moved to U5 (occupies U5–U6)

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
      await (await waitForEnabled("location-form-submit")).click();
      await findRowByText("[data-location-code]", locationName);
      log("part 1: location created");

      // Rack (click location row → Racks tab opens automatically)
      log("part 1: clicking location row to go to Racks");
      const locRow = await findRowByText("[data-location-code]", locationName);
      await browser.execute((el: HTMLElement) => el.click(), locRow as unknown as HTMLElement);
      await browser.$('[data-testid="nav-racks"]').waitForDisplayed({ timeout: 10_000 });

      log("part 1: adding rack");
      await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="rack-add-btn"]').click();
      await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
      await reactSetValue("field-name", rackName);
      await reactSetValue("field-height-u", String(RACK_HEIGHT));
      await (await waitForEnabled("rack-form-submit")).click();
      await findRowByText("[data-rack-code]", rackName);
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
      await (await waitForEnabled("model-form-submit")).click();
      await findRowByText("[data-model-code]", modelName);
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
      await browser.waitUntil(
        async () => {
          try {
            const opts = await browser.$$('[role="option"]');
            for (const opt of opts) {
              const text = await opt.getText();
              if (text.includes(modelName)) {
                await opt.click();
                return true;
              }
            }
            return false;
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Model option "${modelName}" not found in device form` },
      );
      await (await waitForEnabled("device-form-submit")).click();

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
        const deviceRow = await findRowByText("[data-device-code]", deviceName);
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
      await (await waitForEnabled("place-btn")).click();

      // Wait for PlacePlacementModal to close.
      await browser.waitUntil(
        async () => {
          try {
            const btn = browser.$('[data-testid="place-btn"]');
            let isShown: boolean;
            try {
              isShown = await btn.isDisplayed();
            } catch {
              return true;
            }
            if (!isShown) return true;
            // Surface placement errors immediately.
            try {
              const errEl = browser.$(".ft-msg.err");
              if (await errEl.isDisplayed()) {
                const errText = await errEl.getText();
                throw new Error(`Placement failed — modal error: "${errText}"`);
              }
            } catch (inner) {
              if (inner instanceof Error && inner.message.startsWith("Placement failed")) throw inner;
            }
            return false;
          } catch (e) {
            if (e instanceof Error && e.message.startsWith("Placement failed")) throw e;
            return false;
          }
        },
        { timeout: 60_000, timeoutMsg: "PlacePlacementModal did not close after placement" },
      );

      // Verify placed card at U1.
      log(`part 1: verifying placed card at U${INITIAL_U}`);
      await browser.waitUntil(
        async () => {
          try {
            return await browser
              .$(`[data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`)
              .isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 30_000, timeoutMsg: `Placed card at U${INITIAL_U} for device "${deviceCode}" never appeared` },
      );
      const placedCardU1 = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`);
      const titleAtU1 = await placedCardU1.getAttribute("title");
      if (!titleAtU1?.includes(modelName)) {
        throw new Error(
          `Placed card at U${INITIAL_U} title does not reference model "${modelName}". Got: "${titleAtU1}"`,
        );
      }
      log(`part 1: placed card at U${INITIAL_U}, model "${modelName}" confirmed — title="${titleAtU1}"`);

      // ── PART 2: Edit placement — move from U1 to U5 ───────────────────────

      // After PlacePlacementModal closes, RackDetailPanel.handleAddSuccess calls
      // refreshAfterMutation({ selectId: newPlacementId }), which auto-selects the
      // newly placed card.  The PlacementInspectorPanel is therefore already visible.
      // Clicking the already-selected card would TOGGLE it OFF (deselect), hiding the
      // inspector.  Check first and skip the click when the inspector is already open.
      log(`part 2: checking if inspector already open from post-placement auto-selection`);
      const editModalBtnEl = browser.$('[data-testid="open-edit-modal-btn"]');
      const inspectorAlreadyOpenP2 = await editModalBtnEl.isDisplayed().catch(() => false);
      if (!inspectorAlreadyOpenP2) {
        log(`part 2: inspector not open — clicking placed card at U${INITIAL_U}`);
        // The placed card is a <div> with onClick.  Use JS click to ensure WebKit picks it up.
        await browser.execute(
          (el: HTMLElement) => el.click(),
          placedCardU1 as unknown as HTMLElement,
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
      // reactSetValue replaces the current value ("1") with "5" via the native setter.
      await reactSetValue("start-u-input", String(MOVED_U));

      log("part 2: clicking save-btn");
      await (await waitForEnabled("save-btn", 5_000)).click();

      log("part 2: waiting for EditPlacementModal to close");
      await waitForEditModalClose();

      log(`part 2: verifying placed card moved to U${MOVED_U}`);
      await browser.waitUntil(
        async () => {
          try {
            return await browser
              .$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`)
              .isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 30_000, timeoutMsg: `Moved placed card at U${MOVED_U} never appeared` },
      );

      log(`part 2: verifying U${INITIAL_U} is now empty for device ${deviceCode}`);
      const stillAtU1 = await browser
        .$(`[data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`)
        .isDisplayed()
        .catch(() => false);
      if (stillAtU1) {
        throw new Error(
          `Device "${deviceCode}" card still shows at U${INITIAL_U} after move to U${MOVED_U}`,
        );
      }

      log(`part 2: verifying model still referenced in moved card title`);
      const movedCard = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
      const titleAtU5 = await movedCard.getAttribute("title");
      if (!titleAtU5?.includes(modelName)) {
        throw new Error(
          `Moved card at U${MOVED_U} title does not reference model "${modelName}". Got: "${titleAtU5}"`,
        );
      }
      log(`part 2: moved card at U${MOVED_U} verified — title="${titleAtU5}"`);

      // ── PART 3: Persist the moved placement ───────────────────────────────

      log("part 3: saving and closing repository");
      await clickNav("repository");
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
      await browser.$('[data-testid="repository-close-action"]').click();

      log("part 3: saving through UnsavedChangesDialog");
      await (await waitForEnabled("unsaved-changes-save", 15_000)).click();

      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 5_000,
        reverse: true,
      });
      log("part 3: repository saved and closed");

      log(`part 3: reopening repository at ${repoPath}`);
      await reactSetValue("repository-open-path-input", repoPath);
      await (await waitForEnabled("repository-open-path-submit")).click();
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
      await expectActiveRepositoryPath(repoPath);
      log("part 3: repository reopened, active path verified");

      log("part 3: navigating to rack detail after reopen");
      await navigateToRackDetail(locationName, rackName);

      log(`part 3: verifying placement persisted at U${MOVED_U}`);
      await browser.waitUntil(
        async () => {
          try {
            return await browser
              .$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`)
              .isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Moved placement at U${MOVED_U} not found after reopen` },
      );

      log(`part 3: verifying U${INITIAL_U} is still empty after reopen`);
      const u1AfterReopen = await browser
        .$(`[data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`)
        .isDisplayed()
        .catch(() => false);
      if (u1AfterReopen) {
        throw new Error(
          `Device "${deviceCode}" incorrectly shows at U${INITIAL_U} after reopen (should be at U${MOVED_U})`,
        );
      }

      log(`part 3: verifying model persisted in card title after reopen`);
      const persistedCard = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
      const persistedTitle = await persistedCard.getAttribute("title");
      if (!persistedTitle?.includes(modelName)) {
        throw new Error(
          `Persisted card at U${MOVED_U} title does not reference model "${modelName}". Got: "${persistedTitle}"`,
        );
      }
      log(`part 3: persistence verified — U${MOVED_U}, model "${modelName}"`);

      // ── PART 4: Remove placement ───────────────────────────────────────────

      log(`part 4: clicking moved placed card at U${MOVED_U} to open inspector`);
      const cardForRemoval = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`);
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
      // Wait for the modal-backdrop portal to appear; it has data-testid="modal-backdrop".
      await browser.$('[data-testid="modal-backdrop"]').waitForDisplayed({
        timeout: 10_000,
        timeoutMsg: 'ConfirmDialog modal-backdrop did not appear after clicking remove-from-rack-btn',
      });

      log("part 4: confirming removal");
      // Use browser.execute to fire the click entirely inside the browser JS context.
      // The ~48-second WebDriver command overhead (two beforeCommand gaps) between finding
      // the backdrop element and clicking the confirm button creates a staleness window.
      // Doing everything synchronously inside the browser eliminates that risk.
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
        if (!backdrop) throw new Error("modal-backdrop not found in document");
        const btn = backdrop.querySelector("button.btn-danger");
        if (!btn) throw new Error("confirm button (btn-danger) not found inside modal-backdrop");
        (btn as HTMLElement).click();
      });

      log(`part 4: waiting for placed card at U${MOVED_U} to disappear`);
      await browser.waitUntil(
        async () => {
          try {
            const isDisplayed = await browser
              .$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`)
              .isDisplayed();
            return !isDisplayed;
          } catch {
            return true; // element gone → removal confirmed
          }
        },
        {
          timeout: 15_000,
          timeoutMsg: `Placed card at U${MOVED_U} still visible after remove confirmation`,
        },
      );
      log("part 4: placed card removed from rack diagram");

      log("part 4: navigating to Devices to verify unplaced state");
      await clickNav("devices");
      await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

      await browser.waitUntil(
        async () => {
          try {
            const rows = await browser.$$("[data-device-code]");
            for (const row of rows) {
              const text = await row.getText();
              if (text.includes(deviceName)) return true;
            }
            return false;
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Device "${deviceName}" not found in Devices panel after removal` },
      );

      {
        const deviceRowAfterRemoval = await findRowByText("[data-device-code]", deviceName);
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
      await (await waitForEnabled("unsaved-changes-save", 15_000)).click();

      await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
      await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
        timeout: 5_000,
        reverse: true,
      });
      log("part 5: repository saved and closed");

      log(`part 5: reopening repository at ${repoPath}`);
      await reactSetValue("repository-open-path-input", repoPath);
      await (await waitForEnabled("repository-open-path-submit")).click();
      await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
      await expectActiveRepositoryPath(repoPath);
      log("part 5: repository reopened");

      // Verify device is unplaced in Devices panel.
      log("part 5: navigating to Devices to verify removal persisted");
      await clickNav("devices");
      await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

      let foundDeviceAfterRemovalReopen = false;
      let deviceIsUnplacedAfterReopen = false;
      await browser.waitUntil(
        async () => {
          try {
            const rows = await browser.$$("[data-device-code]");
            for (const row of rows) {
              const text = await row.getText();
              if (text.includes(deviceName)) {
                foundDeviceAfterRemovalReopen = true;
                deviceIsUnplacedAfterReopen = text.toLowerCase().includes("unplaced");
                return true;
              }
            }
            return false;
          } catch {
            return false;
          }
        },
        { timeout: 15_000, timeoutMsg: `Device "${deviceName}" not found in Devices panel after removal reopen` },
      );

      if (!foundDeviceAfterRemovalReopen) {
        throw new Error(`Device "${deviceName}" was not found after removal reopen — device was deleted unexpectedly`);
      }
      if (!deviceIsUnplacedAfterReopen) {
        throw new Error(`Device "${deviceName}" does not show "unplaced" after removal reopen`);
      }
      log("part 5: device is unplaced in Devices panel after reopen");

      // Verify no placed card in rack diagram.
      log("part 5: navigating to rack detail to verify no placed card persists");
      await navigateToRackDetail(locationName, rackName);

      const cardAtU5AfterReopen = await browser
        .$(`[data-device-code="${deviceCode}"][data-start-u="${MOVED_U}"]`)
        .isDisplayed()
        .catch(() => false);
      if (cardAtU5AfterReopen) {
        throw new Error(
          `Device "${deviceCode}" still shows a placed card at U${MOVED_U} after removal reopen`,
        );
      }

      const cardAtU1AfterReopen = await browser
        .$(`[data-device-code="${deviceCode}"][data-start-u="${INITIAL_U}"]`)
        .isDisplayed()
        .catch(() => false);
      if (cardAtU1AfterReopen) {
        throw new Error(
          `Device "${deviceCode}" unexpectedly shows a placed card at U${INITIAL_U} after removal reopen`,
        );
      }

      log("part 5: no placed card for device in rack — removal persisted correctly");
      log("all 5 parts passed");
    },
  );
});
