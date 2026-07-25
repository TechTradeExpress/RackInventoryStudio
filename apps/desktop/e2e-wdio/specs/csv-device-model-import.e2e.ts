/**
 * Device Model CSV import (Stage 3E).
 *
 * Sibling workflow to `csv-import.e2e.ts`'s Device CSV coverage — same
 * panel (`CsvImportPanel`), same textarea/preview/import mechanics, but a
 * different `importType` ("device_models"), different required columns
 * (`device_type`, `name` — confirmed against
 * `crates/ris-import/src/csv_reader.rs`'s `DEVICE_MODEL_REQUIRED_COLUMNS`),
 * and a distinct preview table. Kept as its own spec rather than added to
 * `csv-import.e2e.ts` since it is a genuinely separate workflow (device
 * models, not devices) that happens to share a UI panel.
 *
 *   PART A — Repository creation
 *   PART B — Preview a valid 2-row Device Model CSV; assert row count and
 *             names
 *   PART C — Import; assert success banner; verify both models appear in
 *             the Device Models panel
 *   PART D — Persistence: save, close, reopen; re-assert both models exist
 *   PART E — Negative: CSV missing the required `device_type` column;
 *             import stays blocked
 *
 * Selector contract:
 *   csv-device-model-preview-table — new this stage (sibling of the
 *     existing `csv-device-preview-table`)
 *   Reused from Stage 2B: import-type-device-models, csv-textarea,
 *     csv-preview-btn, csv-import-btn, csv-import-success,
 *     [data-model-code] row attribute
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav } from "../support/spec-interactions";
import { findRowByExactName } from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[csv-device-model-import ${ts}] ${msg}`);
}

describe("Rack Inventory Studio — Device Model CSV import", () => {
  it("previews, imports, persists, and validates Device Model CSV", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `csvdm${suffix}`;
    const repoName = `WDIO CSV Model ${suffix}`;
    const modelNameA = `CSVM-A-${suffix}`;
    const modelNameB = `CSVM-B-${suffix}`;

    const MODEL_CSV_VALID = [
      "device_type,name",
      `server,${modelNameA}`,
      `server,${modelNameB}`,
    ].join("\n");

    // Missing required "device_type" column — mirrors csv-import.e2e.ts's
    // "missing status" negative case for the device CSV path.
    const MODEL_CSV_MISSING_DEVICE_TYPE = ["name", `BAD-CSVM-${suffix}`].join("\n");

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Repository creation ────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    await expectActiveRepositoryPath(repoPath);
    log(`part A: repository created at ${repoPath}`);

    // ── PART B: Preview ─────────────────────────────────────────────────────────

    log("part B: navigating to CSV Import, selecting Device Models type");
    await clickNav("csv_import");
    await browser.$('[data-testid="import-type-device-models"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="import-type-device-models"]').click();

    log("part B: pasting valid Device Model CSV (2 rows)");
    await reactSetValue("csv-textarea", MODEL_CSV_VALID);
    await clickWhenEnabled("csv-preview-btn", 10_000);

    await browser.$('[data-testid="csv-device-model-preview-table"]').waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: "csv-device-model-preview-table did not appear after clicking Preview",
    });

    const previewRows = await browser.$$('[data-testid="csv-device-model-preview-table"] tbody tr');
    if (previewRows.length !== 2) {
      throw new Error(`Expected 2 preview rows, got ${previewRows.length}`);
    }
    const tableText = await browser.$('[data-testid="csv-device-model-preview-table"]').getText();
    if (!tableText.includes(modelNameA) || !tableText.includes(modelNameB)) {
      throw new Error(`Expected "${modelNameA}" and "${modelNameB}" in preview table, got: ${tableText}`);
    }
    log("part B: preview shows 2 rows with correct names");

    const importBtn = await browser.$('[data-testid="csv-import-btn"]');
    if (!(await importBtn.isEnabled())) {
      throw new Error("csv-import-btn is disabled despite no validation errors in valid CSV preview");
    }

    // ── PART C: Import ───────────────────────────────────────────────────────

    log("part C: clicking Import");
    await importBtn.click();
    await browser.$('[data-testid="csv-import-success"]').waitForDisplayed({
      timeout: 30_000,
      timeoutMsg: "csv-import-success banner did not appear after import",
    });
    const successText = await browser.$('[data-testid="csv-import-success"]').getText();
    if (!successText.includes("device model")) {
      throw new Error(`Import success text did not mention "device model": "${successText}"`);
    }
    log(`part C: import complete — "${successText.trim()}"`);

    log("part C: verifying both models in Device Models panel");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelNameA);
    await findRowByExactName("[data-model-code]", modelNameB);
    log("part C: both imported models verified");

    // ── PART D: Persistence ─────────────────────────────────────────────────────

    log("part D: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });

    log(`part D: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);

    log("part D: re-verifying both models after reopen");
    await clickNav("device_models");
    await findRowByExactName("[data-model-code]", modelNameA);
    await findRowByExactName("[data-model-code]", modelNameB);
    log("part D: persistence confirmed");

    // ── PART E: Negative — missing required column ────────────────────────────

    log("part E: pasting CSV missing required device_type column");
    await clickNav("csv_import");
    await browser.$('[data-testid="import-type-device-models"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="import-type-device-models"]').click();
    await reactSetValue("csv-textarea", MODEL_CSV_MISSING_DEVICE_TYPE);
    await clickWhenEnabled("csv-preview-btn", 10_000);

    await browser.waitUntil(
      async () => !(await browser.$('[data-testid="csv-import-btn"]').isEnabled()),
      {
        timeout: 10_000,
        timeoutMsg: "csv-import-btn expected to be disabled for CSV missing the required device_type column",
      },
    );
    log("part E: confirmed — import blocked for CSV missing a required column");
  });
});
