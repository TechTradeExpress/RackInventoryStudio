/**
 * CSV Import E2E — Stage 2B.
 *
 * Verifies the full Device CSV import workflow through the textarea path using
 * the real Tauri binary.  No native file dialog is involved.
 *
 * Workflow under test:
 *   paste CSV → preview → import → inventory verification → persistence
 *
 * PART 1 — Repository creation.
 *   Creates an isolated repository via the CreateRepositoryWizard UI.
 *
 * PART 2 — CSV preview.
 *   Pastes a 2-row valid Device CSV, clicks Preview, and asserts:
 *   - the preview table appears with exactly 2 rows,
 *   - both device names are visible,
 *   - the import button is enabled (no validation errors).
 *
 * PART 3 — Successful import.
 *   Clicks Import, waits for the success banner, then navigates to the
 *   Devices panel and asserts both device names appear in the list.
 *
 * PART 4 — Persistence.
 *   Saves and closes the repository via UnsavedChangesDialog, reopens by
 *   exact path, and re-asserts both devices still exist with no duplicates.
 *
 * PART 5 — Negative validation case.
 *   Pastes a CSV with the required "status" column omitted from the header,
 *   previews, and asserts the import button is disabled (import blocked).
 *
 * Selector contract (new selectors added for Stage 2B):
 *   csv-preview-btn          — Preview submit button in CsvImportPanel
 *   csv-import-btn           — "Import N rows" button in CsvImportPanel
 *   csv-import-success       — wrapper div around the import success Banner
 *   csv-device-preview-table — <table> inside DevicePreviewTable
 *
 * Existing selectors reused from Stage 1:
 *   repository-landing-title, repository-active-root, repository-active-path
 *   repository-open-path-input, repository-open-path-submit
 *   repository-close-action, unsaved-changes-save
 *   nav-*, import-type-devices, csv-textarea, device-add-btn
 *   [data-device-code] row attribute
 */
import { browser, expect } from "@wdio/globals";
import {
  reactSetValue,
  waitForEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[csv-import ${ts}] ${msg}`);
}

// ── Test data ─────────────────────────────────────────────────────────────────

// Two server devices with all required fields (device_type + status) plus name.
const DEVICE_CSV_VALID = [
  "device_type,status,name",
  "server,planned,SWITCH-CSV-01",
  "server,planned,SWITCH-CSV-02",
].join("\n");

// Missing required "status" column — backend issues VAL-CSV-001 (file-level)
// and VAL-CSV-008 (row-level) → all rows are skip_due_to_error → import blocked.
const DEVICE_CSV_MISSING_STATUS = [
  "device_type,name",
  "server,BAD-CSV-01",
].join("\n");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clickNav(tab: string): Promise<void> {
  const el = await browser.$(`[data-testid="nav-${tab}"]`);
  await el.waitForDisplayed({ timeout: 10_000 });
  await el.click();
}

async function findDeviceRowByName(name: string): Promise<boolean> {
  const rows = await browser.$$("[data-device-code]");
  for (const row of rows) {
    try {
      const text = await row.getText();
      if (text.includes(name)) return true;
    } catch { /* stale element — skip */ }
  }
  return false;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — CSV import", () => {

  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("previews, imports, persists, and validates Device CSV", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const suffix = Date.now().toString(36);
    const repoCode = `csv${suffix}`;
    const repoName  = `WDIO CSV ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART 1: Repository creation ────────────────────────────────────────────

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

    // ── PART 2: CSV preview ────────────────────────────────────────────────────

    log("part 2: navigating to CSV Import");
    await clickNav("csv_import");
    await browser.$('[data-testid="import-type-devices"]').waitForDisplayed({ timeout: 10_000 });

    log("part 2: selecting Devices import type");
    await browser.$('[data-testid="import-type-devices"]').click();

    log("part 2: pasting valid Device CSV (2 rows)");
    await reactSetValue("csv-textarea", DEVICE_CSV_VALID);

    log("part 2: clicking Preview");
    await (await waitForEnabled("csv-preview-btn", 10_000)).click();

    log("part 2: waiting for preview table");
    await browser.$('[data-testid="csv-device-preview-table"]').waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: "csv-device-preview-table did not appear after clicking Preview",
    });

    log("part 2: verifying row count and device names");
    const previewRows = await browser.$$('[data-testid="csv-device-preview-table"] tbody tr');
    if (previewRows.length !== 2) {
      throw new Error(`Expected 2 preview rows, got ${previewRows.length}`);
    }
    const tableText = await browser.$('[data-testid="csv-device-preview-table"]').getText();
    if (!tableText.includes("SWITCH-CSV-01")) {
      throw new Error(`"SWITCH-CSV-01" not visible in preview table`);
    }
    if (!tableText.includes("SWITCH-CSV-02")) {
      throw new Error(`"SWITCH-CSV-02" not visible in preview table`);
    }
    log("part 2: preview shows 2 rows — SWITCH-CSV-01 and SWITCH-CSV-02 visible");

    log("part 2: verifying import button is enabled (no validation errors)");
    const importBtn = await browser.$('[data-testid="csv-import-btn"]');
    const importEnabledBeforeImport = await importBtn.isEnabled();
    if (!importEnabledBeforeImport) {
      throw new Error("csv-import-btn is disabled despite no validation errors in valid CSV preview");
    }
    log("part 2: import button enabled — preview passed with no errors");

    // ── PART 3: Successful import ──────────────────────────────────────────────

    log("part 3: clicking Import");
    await importBtn.click();

    log("part 3: waiting for import success banner");
    await browser.$('[data-testid="csv-import-success"]').waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: "csv-import-success banner did not appear after import",
    });
    const successText = await browser.$('[data-testid="csv-import-success"]').getText();
    if (!successText.includes("2 device")) {
      throw new Error(`Import success text did not mention "2 device": "${successText}"`);
    }
    log(`part 3: import complete — "${successText.trim()}"`);

    log("part 3: navigating to Devices panel");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part 3: verifying SWITCH-CSV-01 in device list");
    await browser.waitUntil(
      async () => findDeviceRowByName("SWITCH-CSV-01"),
      { timeout: 15_000, timeoutMsg: "SWITCH-CSV-01 not found in device list after import" },
    );

    log("part 3: verifying SWITCH-CSV-02 in device list");
    await browser.waitUntil(
      async () => findDeviceRowByName("SWITCH-CSV-02"),
      { timeout: 15_000, timeoutMsg: "SWITCH-CSV-02 not found in device list after import" },
    );
    log("part 3: both imported devices verified in Devices panel");

    // ── PART 4: Persistence ────────────────────────────────────────────────────

    log("part 4: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();

    // CSV import marks the repository dirty → UnsavedChangesDialog appears.
    log("part 4: saving through UnsavedChangesDialog");
    await (await waitForEnabled("unsaved-changes-save", 15_000)).click();

    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser.$('[data-testid="repository-active-path"]').waitForDisplayed({
      timeout: 5_000,
      reverse: true,
    });
    log("part 4: repository saved and closed");

    log(`part 4: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await (await waitForEnabled("repository-open-path-submit")).click();
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part 4: repository reopened, active path verified");

    log("part 4: verifying device persistence after reopen");
    await clickNav("devices");
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    let totalRows = 0;
    let foundCsv01 = false;
    let foundCsv02 = false;
    await browser.waitUntil(
      async () => {
        try {
          const rows = await browser.$$("[data-device-code]");
          totalRows = rows.length;
          foundCsv01 = false;
          foundCsv02 = false;
          for (const row of rows) {
            const text = await row.getText();
            if (text.includes("SWITCH-CSV-01")) foundCsv01 = true;
            if (text.includes("SWITCH-CSV-02")) foundCsv02 = true;
          }
          return foundCsv01 && foundCsv02;
        } catch { return false; }
      },
      { timeout: 15_000, timeoutMsg: "Imported devices not found in Devices panel after reopen" },
    );

    if (totalRows !== 2) {
      throw new Error(
        `Expected exactly 2 device rows after reopen (no duplicates), found ${totalRows}`,
      );
    }
    log(`part 4: persistence verified — SWITCH-CSV-01 and SWITCH-CSV-02 present, no duplicates (${totalRows} rows)`);

    // ── PART 5: Negative validation case ──────────────────────────────────────

    log("part 5: navigating to CSV Import for negative case");
    await clickNav("csv_import");
    await browser.$('[data-testid="import-type-devices"]').waitForDisplayed({ timeout: 10_000 });

    log("part 5: pasting CSV with missing required 'status' column");
    await reactSetValue("csv-textarea", DEVICE_CSV_MISSING_STATUS);

    log("part 5: clicking Preview");
    await (await waitForEnabled("csv-preview-btn", 10_000)).click();

    log("part 5: waiting for preview table to appear");
    await browser.$('[data-testid="csv-device-preview-table"]').waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: "csv-device-preview-table did not appear for invalid CSV preview",
    });

    log("part 5: verifying import is blocked");
    const importBtnNegative = await browser.$('[data-testid="csv-import-btn"]');
    await browser.waitUntil(
      async () => {
        try {
          return !(await importBtnNegative.isEnabled());
        } catch { return false; }
      },
      { timeout: 10_000, timeoutMsg: "csv-import-btn was not disabled for CSV missing required 'status' column" },
    );
    log("part 5: import blocked — csv-import-btn disabled for invalid CSV");

    log("all 5 parts passed");
  });

});
