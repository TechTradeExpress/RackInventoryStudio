/**
 * SearchableSelect regression E2E.
 *
 * Minimal, focused regression for apps/desktop/src/components/ui/SearchableSelect.tsx,
 * exercised through the device form's "Model" field (DeviceFormModal). This is the
 * component whose option elements rely on a real onMouseDown listener rather than
 * onClick — see selectSearchableOption in ../support/spec-interactions.ts for why
 * that matters across driver providers (external vs. embedded).
 *
 * Covers, in order:
 *   1. opening the dropdown
 *   2. searching (typing a query that narrows the option list)
 *   3. the matching option appearing
 *   4. selecting the option via the correct WebDriver event sequence
 *      (selectSearchableOption — Actions-routed click, never HTMLElement.click())
 *   5. the trigger updating to reflect the selection
 *   6. saving the form
 *   7. the value surviving a reload of the entity (edit-reopen), i.e. real
 *      persistence rather than only in-memory React state
 *
 * Running this suite requires the same prerequisites as core-inventory.e2e.ts.
 */
import { browser, expect } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { isSelectorVisible } from "../support/dom-helpers";
import {
  clickNav,
  waitForModal,
  waitForFormCloseOrError,
  clickWhenVisible,
  selectSearchableOption,
} from "../support/spec-interactions";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[searchable-select ${ts}] ${msg}`);
}

async function findDeviceRow(deviceName: string, timeout = 15_000): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    () =>
      browser.execute(
        (sel: string, name: string) =>
          Array.from(document.querySelectorAll(sel)).some(
            (r) => r.querySelector("strong")?.textContent === name,
          ),
        "[data-device-code]",
        deviceName,
      ),
    { timeout, interval: 100, timeoutMsg: `Device row "${deviceName}" never appeared` },
  );
  const rows = await browser.$$("[data-device-code]");
  for (const row of rows) {
    const nameEl = await row.$("strong");
    if ((await nameEl.isExisting()) && (await nameEl.getText()) === deviceName) {
      return row;
    }
  }
  throw new Error(`Device row "${deviceName}" disappeared after wait`);
}

describe("Rack Inventory Studio — SearchableSelect regression", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("opens, searches, selects, saves, and persists a SearchableSelect value", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const suffix = Date.now().toString(36);
    const repoCode = `ss${suffix}`;
    const repoName = `WDIO SearchableSelect ${suffix}`;
    const modelName = `SS Model ${suffix}`;
    const deviceName = `SS Device ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── Landing + repository setup ────────────────────────────────────────────
    await expect(
      browser.$('[data-testid="repository-landing-title"]'),
    ).toBeDisplayed({ timeout: 30_000 });
    await createRepositoryThroughUi({ repoParent, repoCode, repoName });

    // ── Device model (the SearchableSelect's option source) ──────────────────
    log("creating device model");
    await clickNav("device_models");
    await clickWhenVisible("model-add-btn");
    await waitForModal("model-form-submit");
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", "1");
    await clickWhenEnabled("model-form-submit");
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

    // ── Open the device form ──────────────────────────────────────────────────
    log("opening Add device modal");
    await clickNav("devices");
    await clickWhenVisible("device-add-btn");
    await waitForModal("device-form-submit");
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);

    // ── 1. Open the dropdown ──────────────────────────────────────────────────
    log("1: opening SearchableSelect dropdown");
    await clickWhenVisible("field-device-model-trigger");
    await browser.waitUntil(
      () => browser.execute(isSelectorVisible, '[data-testid="field-device-model-search"]'),
      { timeout: 10_000, interval: 100, timeoutMsg: "field-device-model-search did not appear" },
    );

    // ── 2. Search ──────────────────────────────────────────────────────────────
    log("2: searching");
    // A query that matches nothing narrows the list to empty first, proving the
    // dropdown is actually filtering rather than always showing every option.
    await browser.$('[data-testid="field-device-model-search"]').addValue("zzz-no-such-model-zzz");
    await browser.waitUntil(
      () =>
        browser.execute(
          () => document.querySelector(".ss-empty") !== null,
        ),
      { timeout: 10_000, interval: 100, timeoutMsg: "search did not narrow the option list to empty" },
    );
    await browser.$('[data-testid="field-device-model-search"]').clearValue();
    await browser.$('[data-testid="field-device-model-search"]').addValue(modelName);

    // ── 3. Matching option appears ────────────────────────────────────────────
    log("3: waiting for matching option");
    await browser.waitUntil(
      () =>
        browser.execute(
          (name: string) =>
            Array.from(document.querySelectorAll('[role="option"]')).some((o) =>
              o.textContent?.includes(name),
            ),
          modelName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Model option "${modelName}" not found` },
    );

    // ── 4. Select via the correct event sequence ──────────────────────────────
    log("4: selecting option");
    await selectSearchableOption(modelName);

    // ── 5. Trigger reflects the selection ─────────────────────────────────────
    log("5: confirming trigger updated");
    await browser.waitUntil(
      () =>
        browser.execute(
          (name: string) => {
            const el = document.querySelector('[data-testid="field-device-model-trigger"]');
            return !!el && (el.textContent?.includes(name) ?? false);
          },
          modelName,
        ),
      { timeout: 10_000, interval: 100, timeoutMsg: "trigger did not update to reflect the selection" },
    );

    // ── 6. Save the form ──────────────────────────────────────────────────────
    log("6: saving device form");
    await clickWhenEnabled("device-form-submit");
    await waitForFormCloseOrError("device-form-submit");

    // ── 7. Value survives a reload of the entity (real persistence) ──────────
    log("7: reopening device to confirm persisted value");
    const row = await findDeviceRow(deviceName);
    const editButton = await row.$(`button[aria-label="Edit ${deviceName}"]`);
    await editButton.waitForDisplayed({ timeout: 10_000 });
    await editButton.waitForEnabled({ timeout: 10_000 });
    await editButton.click();
    await waitForModal("device-form-submit");

    await browser.waitUntil(
      () =>
        browser.execute(
          (name: string) => {
            const el = document.querySelector('[data-testid="field-device-model-trigger"]');
            return !!el && (el.textContent?.includes(name) ?? false);
          },
          modelName,
        ),
      { timeout: 10_000, interval: 100, timeoutMsg: "reopened device form did not show the persisted model" },
    );
    log(`7: persisted model "${modelName}" confirmed on reopen`);
  });
});
