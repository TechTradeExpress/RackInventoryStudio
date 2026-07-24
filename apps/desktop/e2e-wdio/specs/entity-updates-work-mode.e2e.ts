/**
 * Entity updates and work mode — Stage 3B.1
 *
 * Exercises six MISSING workflows against the real compiled Tauri binary:
 *
 *   PART A — Work mode: toggle Planning → On-site → Planning
 *   PART B — Create one isolated repository with Location, Rack, DeviceModel, Device
 *   PART C — Edit Device (name, status planned→installed, serial)
 *   PART D — Edit Device Model (name, height 2→3, SKU); verify Device reflects rename
 *   PART E — Edit Rack (name, height 14→18, row A→B)
 *   PART F — Edit Location (name)
 *   PART G — Immediate aggregate verification of all four updated entities
 *   PART H — Save, close, reopen (one cycle)
 *   PART I — Final persistence verification of all four updated entities
 *
 * Selector contract (no new selectors added to application source):
 *   Edit buttons — button[aria-label="Edit <name>"] (scoped to the entity's own row)
 *   Work mode   — work-mode-toggle, work-mode-planning, work-mode-onsite (aria-pressed)
 *   Forms       — location-form-submit, rack-form-submit, model-form-submit, device-form-submit
 *   Fields      — field-name, field-height-u, field-row, field-model-sku, field-status, field-serial
 *   Rows        — [data-location-code], [data-rack-code], [data-model-code], [data-device-code]
 *   Name cell   — <strong> child of each row (confirmed in all four panel components)
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav } from "../support/spec-interactions";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[entity-updates ${ts}] ${msg}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for a form modal to close after submission.
 * Uses isExisting() for DOM-removal detection.
 * Surfaces modal footer error text immediately instead of timing out.
 * Any unexpected WebDriver error propagates and fails the test.
 */
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
    { timeout: 30_000, timeoutMsg: `Form with submit "[data-testid="${submitTestId}"]" did not close within 30 s` },
  );
}

/**
 * Read entity names from all rows matching rowSelector by querying the <strong> child of each row.
 * Runs as a single atomic browser.execute() call — no inter-call stale-element risk.
 */
async function getEntityNamesInRows(rowSelector: string): Promise<string[]> {
  return browser.execute((selector: string) => {
    const rows = document.querySelectorAll(selector);
    return Array.from(rows)
      .map((row) => {
        const strong = row.querySelector("strong");
        return strong ? (strong.textContent ?? "").trim() : null;
      })
      .filter((name): name is string => name !== null && name.length > 0);
  }, rowSelector);
}

/**
 * Wait until at least one row matching rowSelector has a <strong> that exactly equals expectedName.
 * The wait condition uses getEntityNamesInRows() (atomic browser.execute) — no stale-element risk.
 * Returns the matched WebdriverIO.Element (re-fetched after the wait) for further interactions.
 * No broad catch — only stale-element references on the post-wait re-fetch are handled specifically;
 * all other WebDriver errors propagate and fail the test.
 */
async function findRowByExactName(
  rowSelector: string,
  expectedName: string,
  timeout = 15_000,
): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const names = await getEntityNamesInRows(rowSelector);
      return names.includes(expectedName);
    },
    {
      timeout,
      timeoutMsg:
        `Row with exact name "${expectedName}" via "${rowSelector}" ` +
        `not found within ${timeout} ms`,
    },
  );

  // Re-fetch element references after the wait.  A brief stale-element on the child
  // query is possible if React commits a re-render between $$ and $("strong"); skip and
  // continue iterating — the matching row will be found in the next iteration.
  const rows = await browser.$$(rowSelector);
  for (const row of rows) {
    try {
      const nameEl = await row.$("strong");
      if ((await nameEl.isExisting()) && (await nameEl.getText()).trim() === expectedName) {
        return row;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("stale element")) throw e;
    }
  }

  throw new Error(`Row with exact name "${expectedName}" disappeared after wait`);
}

/**
 * Assert exactly one row matching rowSelector has a <strong> that exactly equals expectedName.
 * Uses getEntityNamesInRows() (atomic) — no stale-element risk.
 */
async function expectExactlyOneRowByName(rowSelector: string, expectedName: string): Promise<void> {
  const names = await getEntityNamesInRows(rowSelector);
  const count = names.filter((n) => n === expectedName).length;
  if (count !== 1) {
    throw new Error(
      `Expected exactly one row with name "${expectedName}" via "${rowSelector}", found ${count}`,
    );
  }
}

/**
 * Assert no row matching rowSelector has a <strong> that exactly equals unexpectedName.
 * Uses getEntityNamesInRows() (atomic) — no stale-element risk.
 */
async function expectNoRowByName(rowSelector: string, unexpectedName: string): Promise<void> {
  const names = await getEntityNamesInRows(rowSelector);
  const count = names.filter((n) => n === unexpectedName).length;
  if (count > 0) {
    throw new Error(
      `Unexpected row still present — exact name "${unexpectedName}" found via "${rowSelector}"`,
    );
  }
}

/**
 * Click the Edit button for the named entity, scoped to its exact row.
 * Uses native WebDriver .click() — not browser.execute().
 */
async function clickEditAction(rowSelector: string, entityName: string): Promise<void> {
  const row = await findRowByExactName(rowSelector, entityName);
  const button = await row.$(`button[aria-label="Edit ${entityName}"]`);
  await button.waitForDisplayed({ timeout: 10_000 });
  await button.waitForEnabled({ timeout: 10_000 });
  await button.click();
}

/**
 * Assert the current value of an input or select with the given testId.
 */
async function expectInputValue(testId: string, expected: string): Promise<void> {
  const el = await browser.$(`[data-testid="${testId}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  const value = await el.getValue();
  if (value !== expected) {
    throw new Error(`Expected [data-testid="${testId}"] value "${expected}", got "${value}"`);
  }
}

/**
 * Assert the aria-pressed attribute of a toggle button with the given testId.
 */
async function expectAriaPressed(testId: string, expected: boolean): Promise<void> {
  const el = await browser.$(`[data-testid="${testId}"]`);
  await el.waitForExist({ timeout: 10_000 });
  const pressed = await el.getAttribute("aria-pressed");
  const actual = pressed === "true";
  if (actual !== expected) {
    throw new Error(`Expected [data-testid="${testId}"] aria-pressed=${expected}, got "${pressed}"`);
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — entity updates and work mode", () => {
  after(async () => {
    // Restore work mode to planning so subsequent specs see a clean initial state.
    // If the WebDriver session is already gone (test crashed hard), log and return
    // rather than adding a second confusing exception on top of the original failure.
    try {
      const planningBtn = browser.$('[data-testid="work-mode-planning"]');
      if (!(await planningBtn.isExisting())) {
        throw new Error("[entity-updates cleanup] work-mode-planning button not found in DOM");
      }
      const pressed = await planningBtn.getAttribute("aria-pressed");
      if (pressed !== "true") {
        await planningBtn.click();
        await browser.waitUntil(
          async () => (await planningBtn.getAttribute("aria-pressed")) === "true",
          { timeout: 5_000, timeoutMsg: "Work mode did not return to planning during cleanup" },
        );
      }
      const onsitePressed = await browser
        .$('[data-testid="work-mode-onsite"]')
        .getAttribute("aria-pressed");
      if (onsitePressed !== "false") {
        throw new Error(
          `[entity-updates cleanup] work-mode-onsite expected aria-pressed="false", got "${onsitePressed}"`,
        );
      }
      log("after: work mode planning confirmed (planning=true, onsite=false)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("invalid session id") || msg.includes("session not found")) {
        console.error(
          "[entity-updates cleanup] WebDriver session already closed; skipping work mode restore",
        );
        return;
      }
      console.error("[entity-updates cleanup] Work mode restore failed:", e);
      throw e;
    }
  });

  it("edits four entity types, verifies work mode toggle, and confirms persistence", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `upd${suffix}`;
    const repoName = `WDIO Updates ${suffix}`;

    // Initial entity names
    const locationName = `E2E Location ${suffix}`;
    const rackName     = `E2E Rack ${suffix}`;
    const modelName    = `E2E Model ${suffix}`;
    const deviceName   = `E2E Device ${suffix}`;

    // Updated names — do not contain initial names as substrings
    const updatedLocationName = `Updated Location ${suffix}`;
    const updatedRackName     = `Updated Rack ${suffix}`;
    const updatedModelName    = `Updated Model ${suffix}`;
    const updatedDeviceName   = `Updated Device ${suffix}`;

    // Rack values
    const initialRackHeight = "14";
    const initialRackRow    = `A-${suffix}`;
    const updatedRackHeight = "18";
    const updatedRackRow    = `B-${suffix}`;

    // Device Model values
    const initialModelHeight = "2";
    const initialModelSku    = `SKU-OLD-${suffix}`;
    const updatedModelHeight = "3";
    const updatedModelSku    = `SKU-NEW-${suffix}`;

    // Device values
    const initialDeviceSerial = `SER-OLD-${suffix}`;
    const updatedDeviceSerial = `SER-NEW-${suffix}`;

    log(`suffix=${suffix}  repoCode=${repoCode}`);

    // ── PART A: Work mode ─────────────────────────────────────────────────────

    log("part A: waiting for work mode toggle");
    await browser.$('[data-testid="work-mode-toggle"]').waitForDisplayed({ timeout: 30_000 });

    log("part A: setting initial planning mode");
    await browser.$('[data-testid="work-mode-planning"]').click();
    await browser.waitUntil(
      async () =>
        (await browser.$('[data-testid="work-mode-planning"]').getAttribute("aria-pressed")) === "true",
      { timeout: 5_000, timeoutMsg: "Work mode did not switch to planning" },
    );
    await expectAriaPressed("work-mode-planning", true);
    await expectAriaPressed("work-mode-onsite", false);
    log("part A: planning mode confirmed");

    log("part A: toggling to on-site mode");
    await browser.$('[data-testid="work-mode-onsite"]').click();
    await browser.waitUntil(
      async () =>
        (await browser.$('[data-testid="work-mode-onsite"]').getAttribute("aria-pressed")) === "true",
      { timeout: 5_000, timeoutMsg: "Work mode did not switch to on-site" },
    );
    await expectAriaPressed("work-mode-onsite", true);
    await expectAriaPressed("work-mode-planning", false);
    log("part A: on-site mode confirmed");

    log("part A: toggling back to planning mode");
    await browser.$('[data-testid="work-mode-planning"]').click();
    await browser.waitUntil(
      async () =>
        (await browser.$('[data-testid="work-mode-planning"]').getAttribute("aria-pressed")) === "true",
      { timeout: 5_000, timeoutMsg: "Work mode did not return to planning" },
    );
    await expectAriaPressed("work-mode-planning", true);
    await expectAriaPressed("work-mode-onsite", false);
    log("part A: planning mode restored — work mode coverage complete");

    // ── PART B: Create repository and fixture entities ────────────────────────

    log("part B: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part B: repository created at ${repoPath}`);

    // Create Location
    log("part B: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormClose("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part B: location "${locationName}" confirmed`);

    // Navigate to Racks via location row click
    log("part B: clicking location row to navigate to Racks");
    const locationRowForRack = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForRack as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    // Create Rack
    log("part B: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", initialRackHeight);
    await reactSetValue("field-row", initialRackRow);
    await clickWhenEnabled("rack-form-submit");
    await waitForFormClose("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part B: rack "${rackName}" (${initialRackHeight}U, row=${initialRackRow}) confirmed`);

    // Create Device Model
    log("part B: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", initialModelHeight);
    await reactSetValue("field-model-sku", initialModelSku);
    await clickWhenEnabled("model-form-submit");
    await waitForFormClose("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part B: model "${modelName}" (${initialModelHeight}U, SKU=${initialModelSku}) confirmed`);

    // Create Device
    log("part B: creating device");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="device-add-btn"]').click();
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);
    // Assign device model via combobox
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
    await reactSetValue("field-serial", initialDeviceSerial);
    await clickWhenEnabled("device-form-submit");
    await waitForFormClose("device-form-submit");
    await findRowByExactName("[data-device-code]", deviceName);
    log(`part B: device "${deviceName}" (serial=${initialDeviceSerial}) confirmed`);

    // ── PART C: Edit Device ───────────────────────────────────────────────────

    log("part C: editing device");
    await clickNav("devices");
    await findRowByExactName("[data-device-code]", deviceName);
    await clickEditAction("[data-device-code]", deviceName);
    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });

    await expectInputValue("field-name", deviceName);
    await expectInputValue("field-status", "planned");
    await expectInputValue("field-serial", initialDeviceSerial);
    log("part C: initial device values confirmed");

    await reactSetValue("field-name", updatedDeviceName);
    await reactSelectValue("field-status", "installed");
    await reactSetValue("field-serial", updatedDeviceSerial);

    await clickWhenEnabled("device-form-submit");
    await waitForFormClose("device-form-submit");
    log("part C: device form closed");

    await findRowByExactName("[data-device-code]", updatedDeviceName);
    await expectExactlyOneRowByName("[data-device-code]", updatedDeviceName);
    await expectNoRowByName("[data-device-code]", deviceName);

    const updatedDeviceRow = await findRowByExactName("[data-device-code]", updatedDeviceName);
    const updatedDeviceText = await updatedDeviceRow.getText();
    if (!updatedDeviceText.includes("installed")) {
      throw new Error(`Device row: expected "installed" status, got: "${updatedDeviceText}"`);
    }
    if (!updatedDeviceText.includes(updatedDeviceSerial)) {
      throw new Error(`Device row: expected serial "${updatedDeviceSerial}", got: "${updatedDeviceText}"`);
    }
    if (!updatedDeviceText.includes(modelName)) {
      throw new Error(`Device row: expected model "${modelName}" still referenced, got: "${updatedDeviceText}"`);
    }
    log(`part C: device → "${updatedDeviceName}", status=installed, serial=${updatedDeviceSerial}`);

    // ── PART D: Edit Device Model ─────────────────────────────────────────────

    log("part D: editing device model");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelName);
    await clickEditAction("[data-model-code]", modelName);
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });

    await expectInputValue("field-name", modelName);
    await expectInputValue("field-height-u", initialModelHeight);
    await expectInputValue("field-model-sku", initialModelSku);
    log("part D: initial model values confirmed");

    await reactSetValue("field-name", updatedModelName);
    await reactSetValue("field-height-u", updatedModelHeight);
    await reactSetValue("field-model-sku", updatedModelSku);

    await clickWhenEnabled("model-form-submit");
    await waitForFormClose("model-form-submit");
    log("part D: model form closed");

    await findRowByExactName("[data-model-code]", updatedModelName);
    await expectExactlyOneRowByName("[data-model-code]", updatedModelName);
    await expectNoRowByName("[data-model-code]", modelName);

    const updatedModelRow = await findRowByExactName("[data-model-code]", updatedModelName);
    const updatedModelText = await updatedModelRow.getText();
    if (!updatedModelText.includes("3U")) {
      throw new Error(`Model row: expected "3U", got: "${updatedModelText}"`);
    }
    if (!updatedModelText.includes(updatedModelSku)) {
      throw new Error(`Model row: expected SKU "${updatedModelSku}", got: "${updatedModelText}"`);
    }
    log(`part D: model → "${updatedModelName}", height=3U, SKU=${updatedModelSku}`);

    // Verify device row reflects updated model name
    log("part D: verifying device row shows updated model name");
    await clickNav("devices");
    const deviceRowAfterModelEdit = await findRowByExactName("[data-device-code]", updatedDeviceName);
    const deviceTextAfterModelEdit = await deviceRowAfterModelEdit.getText();
    if (!deviceTextAfterModelEdit.includes(updatedModelName)) {
      throw new Error(
        `Device row: expected updated model name "${updatedModelName}", got: "${deviceTextAfterModelEdit}"`,
      );
    }
    log(`part D: device row references updated model name "${updatedModelName}"`);

    // ── PART E: Edit Rack ─────────────────────────────────────────────────────

    log("part E: navigating to Location → Rack for edit");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    const locationRowForRackEdit = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForRackEdit as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part E: clicking edit button for rack");
    await findRowByExactName("[data-rack-code]", rackName);
    await clickEditAction("[data-rack-code]", rackName);
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });

    await expectInputValue("field-name", rackName);
    await expectInputValue("field-height-u", initialRackHeight);
    await expectInputValue("field-row", initialRackRow);
    log("part E: initial rack values confirmed");

    await reactSetValue("field-name", updatedRackName);
    await reactSetValue("field-height-u", updatedRackHeight);
    await reactSetValue("field-row", updatedRackRow);

    await clickWhenEnabled("rack-form-submit");
    await waitForFormClose("rack-form-submit");
    log("part E: rack form closed");

    await findRowByExactName("[data-rack-code]", updatedRackName);
    await expectExactlyOneRowByName("[data-rack-code]", updatedRackName);
    await expectNoRowByName("[data-rack-code]", rackName);

    const verifyRackRowE = await findRowByExactName("[data-rack-code]", updatedRackName);
    const verifyRackTextE = await verifyRackRowE.getText();
    if (!verifyRackTextE.includes("18U")) {
      throw new Error(`Rack row: expected "18U", got: "${verifyRackTextE}"`);
    }
    if (!verifyRackTextE.includes(updatedRackRow)) {
      throw new Error(`Rack row: expected row "${updatedRackRow}", got: "${verifyRackTextE}"`);
    }
    log(`part E: rack → "${updatedRackName}", height=18U, row=${updatedRackRow}`);

    // ── PART F: Edit Location ─────────────────────────────────────────────────

    log("part F: editing location");
    await clickNav("locations");
    await findRowByExactName("[data-location-code]", locationName);
    await clickEditAction("[data-location-code]", locationName);
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });

    await expectInputValue("field-name", locationName);
    log("part F: initial location name confirmed");

    await reactSetValue("field-name", updatedLocationName);

    await clickWhenEnabled("location-form-submit");
    await waitForFormClose("location-form-submit");
    log("part F: location form closed");

    await findRowByExactName("[data-location-code]", updatedLocationName);
    await expectExactlyOneRowByName("[data-location-code]", updatedLocationName);
    await expectNoRowByName("[data-location-code]", locationName);
    log(`part F: location → "${updatedLocationName}"`);

    // ── PART G: Immediate aggregate verification ───────────────────────────────

    log("part G: immediate aggregate verification");

    // Location — findRowByExactName waits for the panel to render before asserting counts
    await clickNav("locations");
    const locationRowForVerify = await findRowByExactName("[data-location-code]", updatedLocationName);
    await expectExactlyOneRowByName("[data-location-code]", updatedLocationName);
    await expectNoRowByName("[data-location-code]", locationName);
    log("part G: location verified");

    // Rack under updated location
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowForVerify as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const verifyRackRow = await findRowByExactName("[data-rack-code]", updatedRackName);
    await expectExactlyOneRowByName("[data-rack-code]", updatedRackName);
    await expectNoRowByName("[data-rack-code]", rackName);
    const verifyRackText = await verifyRackRow.getText();
    if (!verifyRackText.includes("18U")) {
      throw new Error(`Aggregate verify rack: expected "18U", got: "${verifyRackText}"`);
    }
    if (!verifyRackText.includes(updatedRackRow)) {
      throw new Error(`Aggregate verify rack: expected row "${updatedRackRow}", got: "${verifyRackText}"`);
    }
    log("part G: rack verified");

    // Device Model
    await clickNav("device_models");
    const verifyModelRow = await findRowByExactName("[data-model-code]", updatedModelName);
    await expectExactlyOneRowByName("[data-model-code]", updatedModelName);
    await expectNoRowByName("[data-model-code]", modelName);
    const verifyModelText = await verifyModelRow.getText();
    if (!verifyModelText.includes("3U")) {
      throw new Error(`Aggregate verify model: expected "3U", got: "${verifyModelText}"`);
    }
    if (!verifyModelText.includes(updatedModelSku)) {
      throw new Error(`Aggregate verify model: expected SKU "${updatedModelSku}", got: "${verifyModelText}"`);
    }
    log("part G: device model verified");

    // Device
    await clickNav("devices");
    const verifyDeviceRow = await findRowByExactName("[data-device-code]", updatedDeviceName);
    await expectExactlyOneRowByName("[data-device-code]", updatedDeviceName);
    await expectNoRowByName("[data-device-code]", deviceName);
    const verifyDeviceText = await verifyDeviceRow.getText();
    if (!verifyDeviceText.includes("installed")) {
      throw new Error(`Aggregate verify device: expected "installed", got: "${verifyDeviceText}"`);
    }
    if (!verifyDeviceText.includes(updatedDeviceSerial)) {
      throw new Error(`Aggregate verify device: expected serial "${updatedDeviceSerial}", got: "${verifyDeviceText}"`);
    }
    if (!verifyDeviceText.includes(updatedModelName)) {
      throw new Error(`Aggregate verify device: expected model "${updatedModelName}", got: "${verifyDeviceText}"`);
    }
    if (!verifyDeviceText.toLowerCase().includes("unplaced")) {
      throw new Error(`Aggregate verify device: expected "unplaced", got: "${verifyDeviceText}"`);
    }
    log("part G: device verified");
    log("part G: all immediate assertions passed");

    // ── PART H: Save, close, and reopen ──────────────────────────────────────

    log("part H: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part H: repository closed, landing screen visible");

    log(`part H: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part H: repository reopened, active path verified");

    // ── PART I: Final persistence verification ────────────────────────────────

    log("part I: verifying persistence after reopen");

    // Location — findRowByExactName waits for the panel to load from disk before asserting counts
    await clickNav("locations");
    const locationRowAfterReopen = await findRowByExactName("[data-location-code]", updatedLocationName);
    await expectExactlyOneRowByName("[data-location-code]", updatedLocationName);
    await expectNoRowByName("[data-location-code]", locationName);
    log("part I: location persisted");

    // Rack under updated location
    await browser.execute(
      (el: HTMLElement) => el.click(),
      locationRowAfterReopen as unknown as HTMLElement,
    );
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    const persistedRackRow = await findRowByExactName("[data-rack-code]", updatedRackName);
    await expectExactlyOneRowByName("[data-rack-code]", updatedRackName);
    await expectNoRowByName("[data-rack-code]", rackName);
    const persistedRackText = await persistedRackRow.getText();
    if (!persistedRackText.includes("18U")) {
      throw new Error(`Persisted rack: expected "18U", got: "${persistedRackText}"`);
    }
    if (!persistedRackText.includes(updatedRackRow)) {
      throw new Error(`Persisted rack: expected row "${updatedRackRow}", got: "${persistedRackText}"`);
    }
    log("part I: rack persisted");

    // Device Model
    await clickNav("device_models");
    const persistedModelRow = await findRowByExactName("[data-model-code]", updatedModelName);
    await expectExactlyOneRowByName("[data-model-code]", updatedModelName);
    await expectNoRowByName("[data-model-code]", modelName);
    const persistedModelText = await persistedModelRow.getText();
    if (!persistedModelText.includes("3U")) {
      throw new Error(`Persisted model: expected "3U", got: "${persistedModelText}"`);
    }
    if (!persistedModelText.includes(updatedModelSku)) {
      throw new Error(`Persisted model: expected SKU "${updatedModelSku}", got: "${persistedModelText}"`);
    }
    log("part I: device model persisted");

    // Device
    await clickNav("devices");
    const persistedDeviceRow = await findRowByExactName("[data-device-code]", updatedDeviceName);
    await expectExactlyOneRowByName("[data-device-code]", updatedDeviceName);
    await expectNoRowByName("[data-device-code]", deviceName);
    const persistedDeviceText = await persistedDeviceRow.getText();
    if (!persistedDeviceText.includes("installed")) {
      throw new Error(`Persisted device: expected "installed", got: "${persistedDeviceText}"`);
    }
    if (!persistedDeviceText.includes(updatedDeviceSerial)) {
      throw new Error(`Persisted device: expected serial "${updatedDeviceSerial}", got: "${persistedDeviceText}"`);
    }
    if (!persistedDeviceText.includes(updatedModelName)) {
      throw new Error(`Persisted device: expected model "${updatedModelName}", got: "${persistedDeviceText}"`);
    }
    if (!persistedDeviceText.toLowerCase().includes("unplaced")) {
      throw new Error(`Persisted device: expected "unplaced" (device never placed), got: "${persistedDeviceText}"`);
    }
    log("part I: device persisted");

    log("all persistence assertions passed — Stage 3B.1 complete");
  });
});
