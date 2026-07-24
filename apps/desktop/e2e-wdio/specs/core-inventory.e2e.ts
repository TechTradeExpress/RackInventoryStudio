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
import { measureStep } from "../support/command-timing";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[inventory ${ts}] ${msg}`);
}

// ── Selector helpers ──────────────────────────────────────────────────────────

async function clickNav(tab: string): Promise<void> {
  const testId = `nav-${tab}`;
  await browser.waitUntil(
    () =>
      browser.execute((tid: string) => {
        const el = document.querySelector(`[data-testid="${tid}"]`);
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, testId),
    { timeout: 10_000, interval: 100, timeoutMsg: `nav-${tab} not visible` },
  );
  await browser.execute((tid: string) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${tid}"]`);
    if (el) el.click();
  }, testId);
}

/**
 * Waits for a modal to appear by looking for a visible submit button with the
 * given testId; used to confirm the form dialog has opened.
 */
async function waitForModal(submitTestId: string): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute((testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, submitTestId),
    { timeout: 10_000, interval: 100, timeoutMsg: `Modal with submit "${submitTestId}" did not appear` },
  );
}

/**
 * Waits for a modal to close by looking for its submit button to no longer
 * be displayed; a stale element reference (DOM node removed) also counts as
 * closed.
 */
async function waitForModalClose(submitTestId: string): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute((testId: string) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        if (!el) return true; // removed from DOM → closed
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width === 0 && rect.height === 0;
      }, submitTestId),
    { timeout: 15_000, interval: 100, timeoutMsg: `Modal with submit "${submitTestId}" did not close` },
  );
}

/**
 * Wait for a button/element to be visible then click it via execute() — avoids
 * two separate WebDriver round-trips (findElement + click protocol calls).
 */
async function clickWhenVisible(testId: string, timeout = 10_000): Promise<void> {
  await browser.waitUntil(
    () =>
      browser.execute((tid: string) => {
        const el = document.querySelector(`[data-testid="${tid}"]`);
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, testId),
    { timeout, interval: 100, timeoutMsg: `[data-testid="${testId}"] not visible` },
  );
  await browser.execute((tid: string) => {
    const el = document.querySelector<HTMLButtonElement>(`[data-testid="${tid}"]`);
    if (el) el.click();
  }, testId);
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
    const repoPath = await measureStep("create-repository", () =>
      createRepositoryThroughUi({ repoParent, repoCode, repoName }),
    );
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
    await measureStep("open-location-form", async () => {
      await clickWhenVisible("location-add-btn");
      await waitForModal("location-form-submit");
    });

    log("step 4: filling location name");
    await measureStep("fill-location-form", async () => {
      await reactSetValue("field-name", locationName);
    });

    log("step 4: submitting location form");
    await measureStep("submit-location-form", async () => {
      await (await waitForEnabled("location-form-submit")).click();
      await waitForModalClose("location-form-submit");
    });

    // ── 5. Verify location row ────────────────────────────────────────────────
    log("step 5: waiting for location row");
    // The backend generates the code from the name.  We match by name text rather
    // than by code, since we don't know the generated code up front.
    await measureStep("wait-for-location-row", () =>
      browser.waitUntil(
        () =>
          browser.execute(
            (sel: string, name: string) =>
              Array.from(document.querySelectorAll(sel)).some((r) =>
                r.textContent?.includes(name),
              ),
            "[data-location-code]",
            locationName,
          ),
        { timeout: 15_000, interval: 100, timeoutMsg: `Location row for "${locationName}" never appeared` },
      ),
    );
    log("step 5: location row found");

    // ── 6. Navigate to Racks via location row click ───────────────────────────
    log("step 6: clicking location row to navigate to Racks");

    // Clicking a location row triggers handleManageRacks → setActiveTab("racks").
    // The measured window covers row lookup, click, and the resulting nav
    // transition — not just the final wait — so it reflects the full
    // user-observable cost of this navigation.
    await measureStep("navigate-location-to-racks", async () => {
      // WebKit marks <tr> elements as not-interactable; find and click via execute().
      const clicked: boolean = await browser.execute(
        (sel: string, name: string) => {
          const row = Array.from(document.querySelectorAll(sel)).find((r) =>
            r.textContent?.includes(name),
          );
          if (!row) return false;
          (row as HTMLElement).click();
          return true;
        },
        "[data-location-code]",
        locationName,
      );
      if (!clicked) throw new Error(`Location row for "${locationName}" not found for click`);
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const nav = document.querySelector('[data-testid="nav-racks"]');
            if (!nav) return false;
            const rect = (nav as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        { timeout: 10_000, interval: 100, timeoutMsg: 'nav-racks did not appear after location click' },
      );
    });
    log("step 6: Racks nav appeared, app switched to Racks tab");

    // ── 7. Add rack ───────────────────────────────────────────────────────────
    log("step 7: opening Add rack modal");
    await clickWhenVisible("rack-add-btn");
    await waitForModal("rack-form-submit");

    log("step 7: filling rack name");
    await reactSetValue("field-name", rackName);
    // height_u defaults to 42 — no need to override.

    log("step 7: submitting rack form");
    await (await waitForEnabled("rack-form-submit")).click();

    // ── 8. Verify rack row ────────────────────────────────────────────────────
    log("step 8: waiting for rack row");
    await browser.waitUntil(
      () =>
        browser.execute(
          (sel: string, name: string) =>
            Array.from(document.querySelectorAll(sel)).some((r) => r.textContent?.includes(name)),
          "[data-rack-code]",
          rackName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Rack row for "${rackName}" never appeared` },
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
    await clickWhenVisible("model-add-btn");
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
      () =>
        browser.execute(
          (sel: string, name: string) =>
            Array.from(document.querySelectorAll(sel)).some((r) => r.textContent?.includes(name)),
          "[data-model-code]",
          modelName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Model row for "${modelName}" never appeared` },
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
    await clickWhenVisible("device-add-btn");
    await waitForModal("device-form-submit");

    log("step 13: selecting device type");
    await reactSelectValue("field-device-type", "server");

    log("step 13: filling device name");
    await reactSetValue("field-name", deviceName);
    // status defaults to "planned" — satisfies the required status field.

    // Assign the device model so that placeDevice can resolve effective_height_u
    // from the model's default_height_u (backend requires height_u or a model default).
    log("step 13: assigning device model");
    await clickWhenVisible("field-device-model-trigger");
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="field-device-model-search"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'field-device-model-search did not appear' },
    );
    await browser.$('[data-testid="field-device-model-search"]').addValue(modelName);
    await browser.waitUntil(
      () =>
        browser.execute(
          (name: string) =>
            Array.from(document.querySelectorAll('[role="option"]')).some((o) =>
              o.textContent?.includes(name),
            ),
          modelName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Model option "${modelName}" not found in device form dropdown` },
    );
    // Click via XPath after confirming option is present; SearchableSelect uses onMouseDown.
    await browser.$(`//*[@role='option'][contains(.,'${modelName}')]`).click();

    // Clicking the option closes the dropdown and updates the parent form's
    // React state via onChange, but that state update is not guaranteed to
    // have committed to the trigger's rendered text by the time the click
    // command resolves — submitting immediately after risks the device form
    // capturing a stale (unset) model, which later fails placement
    // validation ("no model and no explicit height_u"). Confirm the
    // trigger actually reflects the selection before proceeding.
    await browser.waitUntil(
      () =>
        browser.execute(
          (testId: string, name: string) => {
            const el = document.querySelector(`[data-testid="${testId}"]`);
            return !!el && (el.textContent?.includes(name) ?? false);
          },
          "field-device-model-trigger",
          modelName,
        ),
      { timeout: 5_000, timeoutMsg: `Device model trigger never showed selected model "${modelName}"` },
    );
    log("step 13: device model assigned");

    log("step 13: submitting device form");
    await (await waitForEnabled("device-form-submit")).click();

    // ── 14. Verify device row and unplaced status ─────────────────────────────
    log("step 14: waiting for device row");
    const deviceRowData = await (async () => {
      await browser.waitUntil(
        () =>
          browser.execute(
            (sel: string, name: string) =>
              Array.from(document.querySelectorAll(sel)).some((r) => r.textContent?.includes(name)),
            "[data-device-code]",
            deviceName,
          ),
        { timeout: 15_000, interval: 100, timeoutMsg: `Device row for "${deviceName}" never appeared` },
      );
      return browser.execute(
        (sel: string, name: string) => {
          const row = Array.from(document.querySelectorAll(sel)).find((r) =>
            r.textContent?.includes(name),
          );
          if (!row) return null;
          return {
            text: row.textContent ?? "",
            deviceCode: row.getAttribute("data-device-code") ?? "",
          };
        },
        "[data-device-code]",
        deviceName,
      );
    })();
    if (!deviceRowData) throw new Error(`Device row for "${deviceName}" disappeared after wait`);
    log("step 14: device row found");

    // The device should be unplaced — the panel renders an "unplaced" badge.
    if (!deviceRowData.text.toLowerCase().includes("unplaced")) {
      throw new Error(
        `Expected device row to contain "unplaced" badge, got: "${deviceRowData.text}"`,
      );
    }
    log("step 14: unplaced badge confirmed");
    const deviceCode = deviceRowData.deviceCode;
    if (!deviceCode) throw new Error("data-device-code attribute missing from device row");
    log(`step 14: device code = ${deviceCode}`);

    log("all Stage 1 assertions passed");

    // ── 15. Navigate back to Racks for placement ──────────────────────────────
    log("step 15: navigating to Racks for placement");
    await clickNav("racks");
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="rack-add-btn"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'rack-add-btn not visible after nav to racks' },
    );

    // ── 16. Open the Rack detail view ─────────────────────────────────────────
    log("step 16: opening rack detail view");
    // WebKit marks <tr> as not-interactable; find and click via execute().
    const rackClickedForDetail: boolean = await browser.execute(
      (sel: string, name: string) => {
        const row = Array.from(document.querySelectorAll(sel)).find((r) =>
          r.textContent?.includes(name),
        );
        if (!row) return false;
        (row as HTMLElement).click();
        return true;
      },
      "[data-rack-code]",
      rackName,
    );
    if (!rackClickedForDetail) throw new Error(`Rack row for "${rackName}" not found for detail`);
    // Palette drop zone is the reliable signal that RackDetailPanel has loaded.
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="palette-drop-zone"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 15_000, interval: 100, timeoutMsg: 'palette-drop-zone did not appear' },
    );
    log("step 16: rack detail panel loaded, palette visible");

    // ── 17. Click Place… for our device in the palette ────────────────────────
    // Scope to `button[data-testid^="place-btn-device-"]` so the selector cannot
    // collide with placed-card divs that also carry data-device-code.
    log("step 17: clicking Place… for device in palette");
    const paletteBtnSel = `button[data-testid^="place-btn-device-"][data-device-code="${deviceCode}"]`;
    await browser.waitUntil(
      () =>
        browser.execute((sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }, paletteBtnSel),
      { timeout: 15_000, interval: 100, timeoutMsg: `Palette Place button for device "${deviceCode}" never appeared` },
    );
    await browser.$(paletteBtnSel).click();
    log("step 17: Place… clicked, waiting for modal");

    // ── 18. PlacePlacementModal — device pre-selected, fill start U ───────────
    log("step 18: waiting for Place modal device preselection");
    // place-btn is disabled until PlacePlacementModal's useEffect sets deviceId from
    // initialTargetId.  Waiting for enabled confirms the initialization effect has
    // settled and startUStr is in its reset-empty state before we fill it.
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector<HTMLButtonElement>('[data-testid="place-btn"]');
          return !!el && !el.disabled;
        }),
      { timeout: 30_000, interval: 100, timeoutMsg: "PlacePlacementModal place-btn never became enabled" },
    );
    log("step 18: filling placement start U");
    // addValue() sends trusted WebDriver keyboard events that React 18 flushes
    // synchronously, avoiding the state-batching race that reactSetValue can trigger.
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="start-u-input"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'start-u-input never appeared' },
    );
    const suInput = browser.$('[data-testid="start-u-input"]');
    await suInput.addValue("1");

    // ── 19. Submit placement ───────────────────────────────────────────────────
    // The measured window covers the click, the modal-close wait, and the
    // error check that stands in for "placement was added successfully" —
    // it stops short of the separate U1-card/title assertions in step 20,
    // which are a distinct concern (DOM content, not placement success).
    log("step 19: submitting placement");
    await measureStep("submit-placement", async () => {
      await (await waitForEnabled("place-btn")).click();

      // Wait for modal to close; surface any error from the modal footer (.ft-msg.err).
      // A single execute() reads both the button and error state atomically.
      await browser.waitUntil(
        async () => {
          const state: { closed: boolean; error: string | null } = await browser.execute(() => {
            const btn = document.querySelector('[data-testid="place-btn"]');
            if (!btn) return { closed: true, error: null };
            const rect = (btn as HTMLElement).getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return { closed: true, error: null };
            const errEl = document.querySelector(".ft-msg.err");
            if (errEl) {
              const er = (errEl as HTMLElement).getBoundingClientRect();
              if (er.width > 0 && er.height > 0)
                return { closed: false, error: errEl.textContent ?? "" };
            }
            return { closed: false, error: null };
          });
          if (state.closed) return true;
          if (state.error) throw new Error(`Placement failed — modal error: "${state.error}"`);
          return false;
        },
        { timeout: 60_000, interval: 100, timeoutMsg: "place-btn still displayed after 60000ms (modal did not close)" },
      );
    });

    // ── 20. Verify placed card appears in rack diagram at U1 ──────────────────
    log("step 20: waiting for placed device card at U1");
    const placedCardTitle: string | null = await (async () => {
      const cardSel = `[data-device-code="${deviceCode}"][data-start-u="1"]`;
      await browser.waitUntil(
        () =>
          browser.execute((sel: string) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, cardSel),
        { timeout: 30_000, interval: 100, timeoutMsg: `Placed card for device "${deviceCode}" at U1 never appeared` },
      );
      // getAttribute via execute avoids a separate protocol round-trip.
      return browser.execute(
        (sel: string) => document.querySelector(sel)?.getAttribute("title") ?? null,
        cardSel,
      );
    })();
    if (!placedCardTitle?.includes(modelName)) {
      throw new Error(
        `Expected placed card title to reference model "${modelName}", got: "${placedCardTitle}"`,
      );
    }
    log(`step 20: device placed at U1, model "${modelName}" referenced — placement assertions passed`);

    // ── 21. Save and close the repository ─────────────────────────────────────
    log("step 21: navigating to Repository tab to save and close");
    await clickNav("repository");
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="repository-active-root"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'repository-active-root not visible after nav to repository tab' },
    );

    log("step 21: clicking Close");
    await measureStep("save-and-close", async () => {
      await browser.$('[data-testid="repository-close-action"]').click();

      // UnsavedChangesDialog opens (created entities + placement = unsaved changes)
      log("step 21: waiting for Save and continue in UnsavedChangesDialog");
      await (await waitForEnabled("unsaved-changes-save")).click();

      // Wait for save + close to complete: landing title appears, active-path disappears.
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const el = document.querySelector('[data-testid="repository-landing-title"]');
            if (!el) return false;
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        { timeout: 60_000, interval: 100, timeoutMsg: 'repository-landing-title never appeared after save-and-close' },
      );
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const el = document.querySelector('[data-testid="repository-active-path"]');
            if (!el) return true; // removed → gone
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width === 0 && rect.height === 0;
          }),
        { timeout: 5_000, interval: 100, timeoutMsg: 'repository-active-path still visible after save-and-close' },
      );
    });
    log("step 21: repository saved and closed, landing screen visible");

    // ── 22. Reopen repository via Open by path ────────────────────────────────
    log(`step 22: reopening repository at ${repoPath}`);
    await measureStep("reopen-repository", async () => {
      await reactSetValue("repository-open-path-input", repoPath);
      await (await waitForEnabled("repository-open-path-submit")).click();
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const el = document.querySelector('[data-testid="repository-active-root"]');
            if (!el) return false;
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }),
        { timeout: 30_000, interval: 100, timeoutMsg: 'repository-active-root not visible after reopen' },
      );
      await expectActiveRepositoryPath(repoPath);
    });
    log("step 22: repository reopened, active path verified");

    // ── 23. Navigate to Location → Rack → Rack detail after reopen ────────────
    log("step 23: verifying Location persisted after reopen");
    await clickNav("locations");
    await browser.waitUntil(
      () =>
        browser.execute(
          (sel: string, name: string) =>
            Array.from(document.querySelectorAll(sel)).some((r) => r.textContent?.includes(name)),
          "[data-location-code]",
          locationName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Location "${locationName}" not found after reopen` },
    );
    log("step 23: location still exists after reopen");

    // Click location row to navigate to Racks.  WebKit marks <tr> as not-interactable.
    const locClickedReopen: boolean = await browser.execute(
      (sel: string, name: string) => {
        const row = Array.from(document.querySelectorAll(sel)).find((r) =>
          r.textContent?.includes(name),
        );
        if (!row) return false;
        (row as HTMLElement).click();
        return true;
      },
      "[data-location-code]",
      locationName,
    );
    if (!locClickedReopen) throw new Error(`Location row not found after reopen`);
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const nav = document.querySelector('[data-testid="nav-racks"]');
          if (!nav) return false;
          const rect = (nav as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'nav-racks did not appear after location reopen click' },
    );
    log("step 23: navigated to Racks after reopen");

    // Click the rack row to open the rack detail view.
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="rack-add-btn"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 10_000, interval: 100, timeoutMsg: 'rack-add-btn not visible after reopen nav' },
    );
    const rackClickedReopen: boolean = await browser.execute(
      (sel: string, name: string) => {
        const row = Array.from(document.querySelectorAll(sel)).find((r) =>
          r.textContent?.includes(name),
        );
        if (!row) return false;
        (row as HTMLElement).click();
        return true;
      },
      "[data-rack-code]",
      rackName,
    );
    if (!rackClickedReopen) throw new Error(`Rack row "${rackName}" not found after reopen`);
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector('[data-testid="palette-drop-zone"]');
          if (!el) return false;
          const rect = (el as HTMLElement).getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }),
      { timeout: 15_000, interval: 100, timeoutMsg: 'palette-drop-zone did not appear after reopen' },
    );
    log("step 23: rack detail loaded after reopen");

    // ── 24. Verify placement persisted after close/reopen ─────────────────────
    log("step 24: verifying placement persisted at U1 after reopen");
    const persistedTitle: string | null = await (async () => {
      const cardSel = `[data-device-code="${deviceCode}"][data-start-u="1"]`;
      await browser.waitUntil(
        () =>
          browser.execute((sel: string) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, cardSel),
        { timeout: 15_000, interval: 100, timeoutMsg: `Placed device "${deviceCode}" at U1 not found after reopen` },
      );
      return browser.execute(
        (sel: string) => document.querySelector(sel)?.getAttribute("title") ?? null,
        cardSel,
      );
    })();
    if (!persistedTitle?.includes(modelName)) {
      throw new Error(
        `Model "${modelName}" not referenced in persisted placement card title after reopen; got: "${persistedTitle}"`,
      );
    }
    log(`step 24: placement persisted at U1, model "${modelName}" verified after reopen`);

    log("all Stage 2 assertions passed");
  });
});
