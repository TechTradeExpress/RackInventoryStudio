/**
 * Validation panel workflows (Stage 3E).
 *
 * Covers `ValidationPanel` end to end: running validation, filtering
 * issues by level, navigating from an issue to the entity it references,
 * and saving directly from the panel. Kept as one spec (not four) since
 * these are sequential steps through a single panel's own state, not
 * independent features — the same bundling precedent as Stage 3C's
 * `placement-inspector-workflows.e2e.ts`.
 *
 * Important behavior discovered while writing this spec (not assumed):
 * `RepositorySession::validate()` (crates/ris-application/src/session.rs)
 * explicitly validates the **last-saved on-disk state**, via
 * `ValidationEngine::validate(&self.repo_path)` reading files from disk —
 * never the current in-memory/unsaved session state. A first attempt at
 * this spec assumed validation would immediately reflect an unsaved
 * device and failed consistently; the actual behavior is deliberate (the
 * session.rs doc comment says so explicitly) and is exercised directly
 * below instead of worked around.
 *
 * Fixture: one Device Model, one Device assigned to that model but never
 * placed, deliberately with no Location created at all. Confirmed by
 * reading `crates/ris-validation/src/validators/`:
 *   - VAL-LOC-005 "locations.yaml has no locations defined" (INFO,
 *     `validators/location.rs`) — fires whenever the repository has zero
 *     locations. Present from the moment the repository is created
 *     (`locations.yaml` is scaffolded and saved to disk at creation time).
 *   - VAL-DEV-013 "device without placement" (WARNING,
 *     `validators/device.rs`) — fires for every unplaced device. Only
 *     appears once the device has actually been saved to disk (see above).
 *
 *   PART A — Create repository, Device Model, Device (assigned, unplaced,
 *             not yet saved)
 *   PART B — Validate before saving: only VAL-LOC-005 appears — the
 *             unsaved device is invisible to validation, demonstrating
 *             the on-disk-only behavior directly
 *   PART C — Save from the validation panel; save summary appears
 *   PART D — Validate again: now both VAL-DEV-013 and VAL-LOC-005 appear
 *   PART E — Filter pills: Warnings shows only VAL-DEV-013, Info shows
 *             only VAL-LOC-005, Errors shows neither, All shows both
 *   PART F — Navigate from the VAL-DEV-013 row to the Devices panel; the
 *             device is there (VAL-LOC-005 is a repository-level note
 *             with no target object, so it has no navigate button — not
 *             tested here, correctly)
 *
 * Selector contract (all new this stage): validation-validate-btn,
 * validation-save-btn, validation-filter-{all,error,warning,info},
 * validation-issue-row / data-validation-issue-code,
 * validation-issue-navigate-btn, validation-save-summary.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import { clickNav, waitForFormCloseOrError, selectSearchableOption } from "../support/spec-interactions";
import { findRowByExactName } from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[validation-panel ${ts}] ${msg}`);
}

describe("Rack Inventory Studio — validation panel", () => {
  it("validates on-disk state, saves from the panel, filters, and navigates", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `val${suffix}`;
    const repoName = `WDIO Validation ${suffix}`;
    const modelName = `Val Model ${suffix}`;
    const deviceName = `Val Device ${suffix}`;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    async function getIssueRowCodes(): Promise<string[]> {
      const rows = await browser.$$('[data-testid="validation-issue-row"]');
      const codes: string[] = [];
      for (const row of rows) {
        codes.push((await row.getAttribute("data-validation-issue-code")) ?? "");
      }
      return codes;
    }

    // ── PART A: Fixture — model + unplaced device (not yet saved) ─────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log("part A: repository created");

    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", "1");
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed`);

    log("part A: creating device with model assigned (left unplaced, not yet saved)");
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
    await findRowByExactName("[data-device-code]", deviceName);
    log(`part A: device "${deviceName}" confirmed, unplaced, unsaved`);

    // ── PART B: Validate before saving — only the on-disk state counts ───────

    log("part B: navigating to Validation panel");
    await clickNav("validation");
    await browser.$('[data-testid="validation-validate-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part B: running validation before saving");
    await browser.$('[data-testid="validation-validate-btn"]').click();
    await browser.$('[data-testid="validation-issue-row"]').waitForDisplayed({
      timeout: 15_000,
      timeoutMsg: "validation-issue-row did not appear after Validate",
    });

    let codes = await getIssueRowCodes();
    log(`part B: found ${codes.length} issue(s) before saving: ${JSON.stringify(codes)}`);
    if (codes.length !== 1 || codes[0] !== "VAL-LOC-005") {
      throw new Error(
        `Expected only VAL-LOC-005 before saving (unsaved device must not appear), got: ${JSON.stringify(codes)}`,
      );
    }
    log("part B: confirmed — validation reflects only the on-disk state, unsaved device not yet visible");

    // ── PART C: Save from the validation panel ─────────────────────────────────

    log("part C: saving from the validation panel");
    await browser.$('[data-testid="validation-save-btn"]').click();
    await browser.$('[data-testid="validation-save-summary"]').waitForDisplayed({
      timeout: 15_000,
      timeoutMsg: "validation-save-summary did not appear after clicking Save changes",
    });
    log("part C: confirmed — save summary appeared after saving from the validation panel");

    // ── PART D: Validate again — device now on disk ───────────────────────────

    log("part D: re-running validation after save");
    await browser.$('[data-testid="validation-validate-btn"]').click();
    await browser.waitUntil(
      async () => (await getIssueRowCodes()).length === 2,
      { timeout: 15_000, timeoutMsg: "Expected 2 validation issues after saving, count never reached 2" },
    );
    codes = await getIssueRowCodes();
    const issueCodes = new Set(codes);
    if (!issueCodes.has("VAL-DEV-013") || !issueCodes.has("VAL-LOC-005")) {
      throw new Error(`Expected issue codes VAL-DEV-013 and VAL-LOC-005, got: ${JSON.stringify(codes)}`);
    }
    log("part D: confirmed — VAL-DEV-013 (warning) and VAL-LOC-005 (info) both present after save");

    // ── PART E: Filter pills ───────────────────────────────────────────────────

    async function expectFilteredIssueCodes(expected: string[]): Promise<void> {
      await browser.waitUntil(
        async () => {
          const c = await getIssueRowCodes();
          if (c.length !== expected.length) return false;
          return expected.every((code) => c.includes(code));
        },
        {
          timeout: 5_000,
          timeoutMsg: `Filtered issue rows never matched expected codes [${expected.join(", ")}]`,
        },
      );
    }

    log("part E: filtering to Warnings — only VAL-DEV-013 must remain");
    await browser.$('[data-testid="validation-filter-warning"]').click();
    await expectFilteredIssueCodes(["VAL-DEV-013"]);

    log("part E: filtering to Info — only VAL-LOC-005 must remain");
    await browser.$('[data-testid="validation-filter-info"]').click();
    await expectFilteredIssueCodes(["VAL-LOC-005"]);

    log("part E: filtering to Errors — neither issue is an error, both must disappear");
    await browser.$('[data-testid="validation-filter-error"]').click();
    await browser.$('[data-testid="validation-issue-row"]').waitForDisplayed({
      timeout: 5_000,
      reverse: true,
      timeoutMsg: "validation-issue-row still visible after filtering to Errors — neither fixture issue is an error",
    });

    log("part E: filtering back to All — both issues must reappear");
    await browser.$('[data-testid="validation-filter-all"]').click();
    await expectFilteredIssueCodes(["VAL-DEV-013", "VAL-LOC-005"]);
    log("part E: filter pills confirmed working across all four levels");

    // ── PART F: Navigate from issue to entity ─────────────────────────────────

    log("part F: navigating from the VAL-DEV-013 issue to the Devices panel");
    await browser
      .$('[data-testid="validation-issue-row"][data-validation-issue-code="VAL-DEV-013"] [data-testid="validation-issue-navigate-btn"]')
      .click();
    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({
      timeout: 10_000,
      timeoutMsg: "Devices panel (device-add-btn) did not become visible after navigating from the validation issue",
    });
    await findRowByExactName("[data-device-code]", deviceName);
    log("part F: confirmed — navigated to Devices panel, device present");
  });
});
