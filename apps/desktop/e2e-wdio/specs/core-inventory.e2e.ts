/**
 * Core inventory E2E — Stage 1
 *
 * Creates its own isolated repository, then exercises the end-to-end
 * creation flow for each core inventory entity:
 *
 *   Repository → Location → Rack → Device Model → Device (unplaced)
 *
 * Each entity is created through the real UI (no direct YAML manipulation,
 * no Tauri command injection).  The test asserts that each created record
 * appears in the corresponding panel list after creation.
 *
 * Stage 2 (placement + close/reopen persistence) is deferred to a follow-up.
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

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — core inventory creation (Stage 1)", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("creates repository, location, rack, device model, and unplaced device", async () => {
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
    await createRepositoryThroughUi({ repoParent, repoCode, repoName });
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

    log("all Stage 1 assertions passed");
  });
});
