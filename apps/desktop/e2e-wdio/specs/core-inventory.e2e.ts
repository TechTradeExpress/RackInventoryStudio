/**
 * Core inventory E2E
 *
 * Creates its own isolated repository and exercises the full end-to-end
 * inventory flow through the real UI (no direct YAML manipulation, no Tauri
 * command injection):
 *
 *   Repository → Location → Rack → Device Model → Device
 *   → Placement at U1 → Save and close → Reopen by path → Persistence verification
 *
 * Stage 1 assertions: each created entity appears in the corresponding panel
 * list; the device row carries an "unplaced" badge.
 *
 * Stage 2 assertions: the device is placed at rack U1 via PlacePlacementModal;
 * the placed card's title attribute references the device model name; after
 * saving, closing, and reopening the repository the placement is still present
 * at U1 with the correct model title.
 *
 * Isolation:
 *   RIS_E2E_REPOSITORY_PARENT — set by test-environment in wdio.conf.ts
 *
 * Running this suite requires the same prerequisites as repository-lifecycle.e2e.ts.
 */
import { browser, expect } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  waitForEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[inventory ${ts}] ${msg}`);
}

// ── Selector helpers ──────────────────────────────────────────────────────────

async function clickNav(tab: string): Promise<void> {
  const el = await browser.$(`[data-testid="nav-${tab}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await el.click();
}

/**
 * Waits for a modal to appear by looking for a visible submit button with the
 * given testId; used to confirm the form dialog has opened.
 */
async function waitForModal(submitTestId: string): Promise<void> {
  await browser
    .$(`[data-testid="${submitTestId}"]`)
    .waitForDisplayed({ timeout: 10_000 });
}

function isPlacementFailure(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith("Placement failed");
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — core inventory placement", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("creates inventory, places a device, and verifies persistence after reopen", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;

    // Unique suffix per run — lowercase alphanumeric, safe for codes.
    const suffix = Date.now().toString(36);
    const repoCode = `inv${suffix}`;
    const repoName = `WDIO Inventory ${suffix}`;

    // Entity names — human-readable labels used in form fields.
    const locationName = `E2E Location ${suffix}`;
    const rackName = `E2E Rack ${suffix}`;
    const modelName = `E2E Model ${suffix}`;
    const deviceName = `E2E Device ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── 1. Landing screen ─────────────────────────────────────────────────────
    log("step 1: waiting for landing title");
    await expect(
      browser.$('[data-testid="repository-landing-title"]'),
    ).toBeDisplayed({ timeout: 30_000 });

    // ── 2. Create repository ──────────────────────────────────────────────────
    log("step 2: creating repository");
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log("step 2: repository open");

    // ── 3. Navigate to Locations ──────────────────────────────────────────────
    log("step 3: navigating to Locations");
    await clickNav("locations");
    await expect(browser.$('[data-testid="nav-locations"]')).toHaveAttribute(
      "aria-current",
      "page",
    );

    // ── 4. Add location ───────────────────────────────────────────────────────
    log("step 4: opening Add location modal");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await waitForModal("location-form-submit");

    log("step 4: filling location name");
    await reactSetValue("field-name", locationName);

    log("step 4: submitting location form");
    await (await waitForEnabled("location-form-submit")).click();

    // ── 5. Verify location row ────────────────────────────────────────────────
    log("step 5: waiting for location row");
    // The backend generates the code from the name.  We match by name text rather
    // than by code, since we don't know the generated code up front.
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-location-code]");
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes(locationName)) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Location row for "${locationName}" never appeared` },
    );
    log("step 5: location row found");

    // ── 6. Navigate to Racks via location row click ───────────────────────────
    log("step 6: clicking location row to navigate to Racks");
    const locationRows = await browser.$$("[data-location-code]");
    let targetLocationRow: WebdriverIO.Element | null = null;
    for (const row of locationRows) {
      const text = await row.getText();
      if (text.includes(locationName)) {
        targetLocationRow = row;
        break;
      }
    }
    if (!targetLocationRow) {
      throw new Error(`Location row for "${locationName}" not found for click`);
    }
    // WebKit's WebDriver marks <tr> elements as not-interactable; use JS click.
    await browser.execute(
      (el: HTMLElement) => el.click(),
      targetLocationRow as unknown as HTMLElement,
    );

    // Clicking a location row triggers handleManageRacks → setActiveTab("racks").
    await browser
      .$('[data-testid="nav-racks"]')
      .waitForDisplayed({ timeout: 10_000 });
    log("step 6: Racks nav appeared, app switched to Racks tab");

    // ── 7. Add rack ───────────────────────────────────────────────────────────
    log("step 7: opening Add rack modal");
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="rack-add-btn"]').click();
    await waitForModal("rack-form-submit");

    log("step 7: filling rack name");
    await reactSetValue("field-name", rackName);
    // height_u defaults to 42 — no need to override.

    log("step 7: submitting rack form");
    await (await waitForEnabled("rack-form-submit")).click();

    // ── 8. Verify rack row ────────────────────────────────────────────────────
    log("step 8: waiting for rack row");
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-rack-code]");
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes(rackName)) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Rack row for "${rackName}" never appeared` },
    );
    log("step 8: rack row found");

    // ── 9. Navigate to Device Models ──────────────────────────────────────────
    log("step 9: navigating to Device Models");
    await clickNav("device_models");
    await expect(browser.$('[data-testid="nav-device_models"]')).toHaveAttribute(
      "aria-current",
      "page",
    );

    // ── 10. Add device model ──────────────────────────────────────────────────
    log("step 10: opening Add model modal");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await waitForModal("model-form-submit");

    log("step 10: selecting device type");
    await reactSelectValue("field-device-type", "server");

    log("step 10: filling model name");
    await reactSetValue("field-name", modelName);

    log("step 10: filling height_u");
    await reactSetValue("field-height-u", "1");

    log("step 10: submitting model form");
    await (await waitForEnabled("model-form-submit")).click();

    // ── 11. Verify device model row ───────────────────────────────────────────
    log("step 11: waiting for model row");
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-model-code]");
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes(modelName)) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Model row for "${modelName}" never appeared` },
    );
    log("step 11: model row found");

    // ── 12. Navigate to Devices ───────────────────────────────────────────────
    log("step 12: navigating to Devices");
    await clickNav("devices");
    await expect(browser.$('[data-testid="nav-devices"]')).toHaveAttribute(
      "aria-current",
      "page",
    );

    // ── 13. Add device ────────────────────────────────────────────────────────
    log("step 13: opening Add device modal");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await waitForModal("device-form-submit");

    log("step 13: selecting device type");
    await reactSelectValue("field-device-type", "server");

    log("step 13: filling device name");
    await reactSetValue("field-name", deviceName);
    // status defaults to "planned" — satisfies the required status field.

    // Assign the device model so that placeDevice can resolve effective_height_u
    // from the model's default_height_u (backend requires height_u or a model default).
    log("step 13: assigning device model");
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
      { timeout: 15_000, timeoutMsg: `Model option "${modelName}" not found in device form dropdown` },
    );
    log("step 13: device model assigned");

    log("step 13: submitting device form");
    await (await waitForEnabled("device-form-submit")).click();

    // ── 14. Verify device row and unplaced status ─────────────────────────────
    log("step 14: waiting for device row");
    let deviceRow: WebdriverIO.Element | null = null;
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-device-code]");
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes(deviceName)) {
              deviceRow = row;
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Device row for "${deviceName}" never appeared` },
    );
    log("step 14: device row found");

    // The device should be unplaced — the panel renders an "unplaced" badge.
    if (!deviceRow) throw new Error("deviceRow reference lost");
    const rowText = await (deviceRow as WebdriverIO.Element).getText();
    if (!rowText.toLowerCase().includes("unplaced")) {
      throw new Error(
        `Expected device row to contain "unplaced" badge, got: "${rowText}"`,
      );
    }
    log("step 14: unplaced badge confirmed");
    if (!deviceRow) throw new Error("deviceRow reference lost before code extraction");
    const deviceCode = await (deviceRow as WebdriverIO.Element).getAttribute("data-device-code");
    if (!deviceCode) throw new Error("data-device-code attribute missing from device row");
    log(`step 14: device code = ${deviceCode}`);

    log("all Stage 1 assertions passed");

    // ── 15. Navigate back to Racks for placement ──────────────────────────────
    log("step 15: navigating to Racks for placement");
    await clickNav("racks");
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    // ── 16. Open the Rack detail view ─────────────────────────────────────────
    log("step 16: opening rack detail view");
    const rackRowsForDetail = await browser.$$("[data-rack-code]");
    let targetRackRowForDetail: WebdriverIO.Element | null = null;
    for (const row of rackRowsForDetail) {
      const text = await row.getText();
      if (text.includes(rackName)) {
        targetRackRowForDetail = row;
        break;
      }
    }
    if (!targetRackRowForDetail) throw new Error(`Rack row for "${rackName}" not found for detail`);
    // WebKit's WebDriver marks <tr> elements as not-interactable; use JS click.
    await browser.execute(
      (el: HTMLElement) => el.click(),
      targetRackRowForDetail as unknown as HTMLElement,
    );
    // Palette drop zone is the reliable signal that RackDetailPanel has loaded.
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    log("step 16: rack detail panel loaded, palette visible");

    // ── 17. Click Place… for our device in the palette ────────────────────────
    // Scope to `button[data-testid^="place-btn-device-"]` so the selector cannot
    // collide with placed-card divs that also carry data-device-code.
    log("step 17: clicking Place… for device in palette");
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
    log("step 17: Place… clicked, waiting for modal");

    // ── 18. PlacePlacementModal — device pre-selected, fill start U ───────────
    log("step 18: waiting for Place modal device preselection");
    // place-btn is disabled until PlacePlacementModal's useEffect sets deviceId from
    // initialTargetId.  Waiting for enabled confirms the initialization effect has
    // settled and startUStr is in its reset-empty state before we fill it.
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
    log("step 18: filling placement start U");
    // addValue() sends trusted WebDriver keyboard events that React 18 flushes
    // synchronously, avoiding the state-batching race that reactSetValue can trigger.
    const suInput = browser.$('[data-testid="start-u-input"]');
    await suInput.waitForDisplayed({ timeout: 10_000 });
    await suInput.addValue("1");

    // ── 19. Submit placement ───────────────────────────────────────────────────
    log("step 19: submitting placement");
    await (await waitForEnabled("place-btn")).click();

    // Wait for modal to close; surface any error from the modal footer (.ft-msg.err)
    // so failures produce a meaningful message instead of a generic timeout.
    // Stale element reference means the modal DOM node was removed → success.
    await browser.waitUntil(
      async () => {
        try {
          const btn = browser.$('[data-testid="place-btn"]');
          let isShown: boolean;
          try {
            isShown = await btn.isDisplayed();
          } catch {
            // Stale element reference or element not found → modal is gone → success
            return true;
          }
          if (!isShown) return true; // modal closed → success
          // Check for placement error shown in the modal footer
          const errEl = browser.$('.ft-msg.err');
          try {
            if (await errEl.isDisplayed()) {
              const errText = await errEl.getText();
              throw new Error(`Placement failed — modal error: "${errText}"`);
            }
          } catch (inner) {
            if (isPlacementFailure(inner)) throw inner;
          }
          return false;
        } catch (e) {
          if (isPlacementFailure(e)) throw e;
          return false;
        }
      },
      { timeout: 60_000, timeoutMsg: "place-btn still displayed after 60000ms (modal did not close)" },
    );

    // ── 20. Verify placed card appears in rack diagram at U1 ──────────────────
    log("step 20: waiting for placed device card at U1");
    await browser.waitUntil(
      async () => {
        try {
          return await browser
            .$(`[data-device-code="${deviceCode}"][data-start-u="1"]`)
            .isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: 30_000, timeoutMsg: `Placed card for device "${deviceCode}" at U1 never appeared` },
    );
    const placedCard = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="1"]`);
    // Use getAttribute("title") — the card div's title attribute contains the full label
    // (primary · model · uRange). WebKit's innerText algorithm returns "" for flex children
    // with overflow:hidden, so getText() is unreliable here.
    const placedCardTitle = await placedCard.getAttribute("title");
    if (!placedCardTitle?.includes(modelName)) {
      throw new Error(
        `Expected placed card title to reference model "${modelName}", got: "${placedCardTitle}"`,
      );
    }
    log(`step 20: device placed at U1, model "${modelName}" referenced — placement assertions passed`);

    // ── 21. Save and close the repository ─────────────────────────────────────
    log("step 21: navigating to Repository tab to save and close");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });

    log("step 21: clicking Close");
    await browser.$('[data-testid="repository-close-action"]').click();

    // UnsavedChangesDialog opens (created entities + placement = unsaved changes)
    log("step 21: waiting for Save and continue in UnsavedChangesDialog");
    await (await waitForEnabled("unsaved-changes-save")).click();

    // Wait for save + close to complete and landing screen to appear
    await browser
      .$('[data-testid="repository-landing-title"]')
      .waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("step 21: repository saved and closed, landing screen visible");

    // ── 22. Reopen repository via Open by path ────────────────────────────────
    log(`step 22: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser
      .$('[data-testid="repository-active-root"]')
      .waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("step 22: repository reopened, active path verified");

    // ── 23. Navigate to Location → Rack → Rack detail after reopen ────────────
    log("step 23: verifying Location persisted after reopen");
    await clickNav("locations");
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-location-code]");
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes(locationName)) return true;
          }
          return false;
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Location "${locationName}" not found after reopen` },
    );
    log("step 23: location still exists after reopen");

    // Click location row to navigate to Racks
    const locationRowsReopen = await browser.$$("[data-location-code]");
    let locationRowForReopen: WebdriverIO.Element | null = null;
    for (const row of locationRowsReopen) {
      const text = await row.getText();
      if (text.includes(locationName)) {
        locationRowForReopen = row;
        break;
      }
    }
    if (!locationRowForReopen) throw new Error(`Location row not found after reopen`);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForReopen as unknown as HTMLElement,
    );
    await browser.$('[data-testid="nav-racks"]').waitForDisplayed({ timeout: 10_000 });
    log("step 23: navigated to Racks after reopen");

    // Click the rack row to open the rack detail view
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const rackRowsReopen = await browser.$$("[data-rack-code]");
    let rackRowForReopen: WebdriverIO.Element | null = null;
    for (const row of rackRowsReopen) {
      const text = await row.getText();
      if (text.includes(rackName)) {
        rackRowForReopen = row;
        break;
      }
    }
    if (!rackRowForReopen) throw new Error(`Rack row "${rackName}" not found after reopen`);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      rackRowForReopen as unknown as HTMLElement,
    );
    await browser.$('[data-testid="palette-drop-zone"]').waitForDisplayed({ timeout: 15_000 });
    log("step 23: rack detail loaded after reopen");

    // ── 24. Verify placement persisted after close/reopen ─────────────────────
    log("step 24: verifying placement persisted at U1 after reopen");
    await browser.waitUntil(
      async () => {
        try {
          return await browser
            .$(`[data-device-code="${deviceCode}"][data-start-u="1"]`)
            .isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: 15_000, timeoutMsg: `Placed device "${deviceCode}" at U1 not found after reopen` },
    );
    const persistedCard = await browser.$(`[data-device-code="${deviceCode}"][data-start-u="1"]`);
    const persistedTitle = await persistedCard.getAttribute("title");
    if (!persistedTitle?.includes(modelName)) {
      throw new Error(
        `Model "${modelName}" not referenced in persisted placement card title after reopen; got: "${persistedTitle}"`,
      );
    }
    log(`step 24: placement persisted at U1, model "${modelName}" verified after reopen`);

    log("all Stage 2 assertions passed");
  });
});
