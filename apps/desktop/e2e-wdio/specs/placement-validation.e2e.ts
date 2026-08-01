/**
 * Placement validation — negative paths (Stage 3D).
 *
 * Focused entirely on placement *rejection*: every case here attempts a
 * placement that must be refused, and asserts the refusal is total — no
 * placement is created, the rack diagram is unchanged, and the device
 * involved stays unplaced, both immediately and after a save/close/reopen
 * cycle. None of Stage 3C's specs cover a rejected placement attempt; every
 * existing placement spec only ever exercises the accepted path.
 *
 * Error surfaces (confirmed by reading the application source, not guessed):
 *   - Backend collision/out-of-bounds rejections come from
 *     `Session::place_device` (crates/ris-application/src/session.rs) via
 *     `ApplicationError::Collision`/`OutOfRackBounds`, whose `Display` impls
 *     (crates/ris-application/src/error.rs) render as "collision: …" and
 *     "out of rack bounds: …" respectively. The Tauri command wrapper
 *     (`place_device` in apps/desktop/src-tauri/src/commands/repository.rs)
 *     forwards this via `.map_err(|e| e.to_string())`, so the frontend
 *     receives that exact string.
 *   - Frontend-only validation (non-positive-integer start U / height
 *     override) never reaches the backend at all — `PlacePlacementModal`'s
 *     own `validate()` (apps/desktop/src/features/racks/PlacePlacementModal.tsx)
 *     short-circuits before calling `placeDevice`/`placeRackObject`.
 *   Both surfaces render identically via the modal's `footerMessage`
 *   (`.ft-msg.err`, inside `[data-testid="modal"]`), the same element every
 *   other spec already asserts on via `waitForFormCloseOrError` — no new
 *   selector needed for either case.
 *
 *   PART A — Create fixture: Location, Rack 14U, Device Model 2U server,
 *             two devices (A: placed successfully; B: used for every
 *             negative attempt, since it never succeeds and stays reusable)
 *   PART B — Place Device A at U5 (occupies U5–U6)
 *   PART C — Negative: exact occupied U (Device B at U5, default height —
 *             identical range to A's) → "collision:"
 *   PART D — Negative: partial overlap (Device B at U6 → U6–U7, overlaps
 *             A's U5–U6 only at U6) → "collision:"
 *   PART E — Negative: full overlap / containment (Device B at U4 with a
 *             4U height override → U4–U7, fully contains A's U5–U6) →
 *             "collision:"
 *   PART F — Negative: exceeds rack height (Device B at U14, default
 *             height → U14–U15 against a 14U rack) → "out of rack bounds:"
 *   PART G — Negative: invalid UI input — non-positive start U ("0") and
 *             non-positive height override ("0") — both rejected by
 *             `PlacePlacementModal`'s own frontend validation, never
 *             reaching the backend
 *   PART H — Aggregate: Device B still unplaced, no placement card for it
 *             anywhere, Device A's single placement at U5 unchanged
 *   PART I — Save, close, reopen — re-verify PART H's aggregate state
 *             survives a real persistence round-trip
 *
 * Selector contract (all pre-existing, confirmed against source — see
 * docs/E2E_WDIO_COVERAGE_GAPS.md's Stage 3D analysis; no new selectors):
 *   Palette Place button — button[data-testid^="place-btn-device-"][data-device-code="…"]
 *   PlacePlacementModal  — start-u-input, height-u-input, place-btn
 *   Modal close (header) — [data-testid="modal"] button[aria-label="Close"]
 *   Error banner          — .ft-msg.err (inside [data-testid="modal"])
 *   Placement card         — [data-device-code="…"][data-start-u="…"]
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
import { isSelectorVisible } from "../support/dom-helpers";
import {
  findRowByExactName,
  expectDeviceRowState,
  expectExactlyOnePlacement,
  navigateToRackDetail,
  placeDeviceAtU,
} from "../support/destructive-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[placement-validation ${ts}] ${msg}`);
}

/** Opens PlacePlacementModal for a specific unplaced device via its palette button. */
async function openPlaceModalForDevice(deviceCode: string): Promise<void> {
  const paletteBtnSel = `button[data-testid^="place-btn-device-"][data-device-code="${deviceCode}"]`;
  await browser.waitUntil(() => browser.$(paletteBtnSel).isDisplayed(), {
    timeout: 15_000,
    timeoutMsg: `Palette Place button for device "${deviceCode}" not displayed`,
  });
  await browser.$(paletteBtnSel).click();
  await browser.waitUntil(() => browser.execute(isSelectorVisible, '[data-testid="start-u-input"]'), {
    timeout: 10_000,
    interval: 100,
    timeoutMsg: "start-u-input never appeared after opening PlacePlacementModal",
  });
}

/** Closes an open PlacePlacementModal via the header Close button (not behind a backdrop-intercept risk — it's a direct child of the dialog, not the backdrop). */
async function closePlaceModal(): Promise<void> {
  await browser.$('[data-testid="modal"] button[aria-label="Close"]').click();
  await browser.waitUntil(
    async () => !(await browser.execute(isSelectorVisible, '[data-testid="modal"]')),
    { timeout: 10_000, interval: 100, timeoutMsg: "PlacePlacementModal did not close" },
  );
}

/**
 * Attempts a placement expected to be rejected: opens the modal for
 * deviceCode, fills start U (and optionally a height override), submits,
 * and asserts the submission is refused with an error containing
 * expectedErrorSubstring — never that it silently succeeds. Leaves the
 * modal closed afterward so the next case starts clean.
 */
async function attemptPlacementExpectError(
  caseLabel: string,
  deviceCode: string,
  startU: string,
  heightOverride: string | null,
  expectedErrorSubstring: string,
): Promise<void> {
  log(`${caseLabel}: opening modal for device ${deviceCode}`);
  await openPlaceModalForDevice(deviceCode);
  await reactSetValue("start-u-input", startU);
  if (heightOverride !== null) {
    await reactSetValue("height-u-input", heightOverride);
  }
  await clickWhenEnabled("place-btn");

  let thrown: Error | null = null;
  try {
    await waitForFormCloseOrError("place-btn", {
      timeout: 15_000,
      errorLabel: "Placement failed",
      timeoutLabel: "PlacePlacementModal",
    });
  } catch (e) {
    thrown = e as Error;
  }

  if (!thrown) {
    throw new Error(
      `${caseLabel}: expected the placement attempt to be rejected, but the modal closed as if it succeeded`,
    );
  }
  if (!thrown.message.includes(expectedErrorSubstring)) {
    throw new Error(
      `${caseLabel}: expected an error containing "${expectedErrorSubstring}", got: ${thrown.message}`,
    );
  }
  log(`${caseLabel}: rejected as expected — ${thrown.message}`);

  await closePlaceModal();
}

/**
 * Verifies Device B was never placed and Device A's single placement at U5
 * is untouched. Navigates itself (devices panel, then rack detail) so
 * callers don't need to track which panel is currently active.
 */
async function expectUnchangedFixtureState(
  locationName: string,
  rackName: string,
  deviceNameB: string,
  deviceCodeB: string,
  modelName: string,
  deviceCodeA: string,
): Promise<void> {
  await clickNav("devices");
  await findRowByExactName("[data-device-code]", deviceNameB);
  await expectDeviceRowState(deviceNameB, modelName, "unplaced");

  await navigateToRackDetail(locationName, rackName);
  const strayCards = await browser.$$(`[data-device-code="${deviceCodeB}"][data-start-u]`);
  if (strayCards.length !== 0) {
    throw new Error(
      `expectUnchangedFixtureState: expected no placement card for device B ` +
        `(code=${deviceCodeB}), found ${strayCards.length}`,
    );
  }

  await expectExactlyOnePlacement(deviceCodeA, 5);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — placement validation (negative paths)", () => {
  it("rejects occupied-U, overlapping, out-of-bounds, and invalid placement attempts without mutating state", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    if (!repoParent) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const suffix = Date.now().toString(36);
    const repoCode = `pval${suffix}`;
    const repoName = `WDIO Placement Validation ${suffix}`;

    const locationName = `PVal Location ${suffix}`;
    const rackName = `PVal Rack ${suffix}`;
    const modelName = `PVal Model ${suffix}`;
    const deviceNameA = `PVal Device A ${suffix}`;
    const deviceNameB = `PVal Device B ${suffix}`;

    const RACK_HEIGHT = 14;
    const MODEL_HEIGHT = 2;
    const PLACE_U_A = 5;

    log(`suffix=${suffix} repoCode=${repoCode}`);

    // ── PART A: Create fixture ────────────────────────────────────────────────

    log("part A: creating repository");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
    log(`part A: repository created at ${repoPath}`);

    log("part A: creating location");
    await clickNav("locations");
    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="location-add-btn"]').click();
    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", locationName);
    await clickWhenEnabled("location-form-submit");
    await waitForFormCloseOrError("location-form-submit");
    await findRowByExactName("[data-location-code]", locationName);
    log(`part A: location "${locationName}" confirmed`);

    const locationRow = await findRowByExactName("[data-location-code]", locationName);
    await browser.execute((el: HTMLElement) => el.click(), locationRow as unknown as HTMLElement);
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });

    log("part A: creating rack");
    await browser.$('[data-testid="rack-add-btn"]').click();
    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSetValue("field-name", rackName);
    await reactSetValue("field-height-u", String(RACK_HEIGHT));
    await reactSetValue("field-row", `PVAL-${suffix}`);
    await clickWhenEnabled("rack-form-submit");
    await waitForFormCloseOrError("rack-form-submit");
    await findRowByExactName("[data-rack-code]", rackName);
    log(`part A: rack "${rackName}" confirmed (${RACK_HEIGHT}U)`);

    log("part A: creating device model");
    await clickNav("device_models");
    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="model-add-btn"]').click();
    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", modelName);
    await reactSetValue("field-height-u", String(MODEL_HEIGHT));
    await clickWhenEnabled("model-form-submit");
    await waitForFormCloseOrError("model-form-submit");
    await findRowByExactName("[data-model-code]", modelName);
    log(`part A: model "${modelName}" confirmed (${MODEL_HEIGHT}U server)`);

    async function createDeviceWithModel(deviceName: string): Promise<string> {
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

      const row = await findRowByExactName("[data-device-code]", deviceName);
      const code = (await row.getAttribute("data-device-code")) ?? "";
      if (!code) {
        throw new Error(`data-device-code attribute missing on row for "${deviceName}"`);
      }
      return code;
    }

    log("part A: creating device A (will be placed successfully)");
    const deviceCodeA = await createDeviceWithModel(deviceNameA);
    log(`part A: device A "${deviceNameA}" confirmed, code=${deviceCodeA}`);

    log("part A: creating device B (used for every negative attempt)");
    const deviceCodeB = await createDeviceWithModel(deviceNameB);
    log(`part A: device B "${deviceNameB}" confirmed, code=${deviceCodeB}`);

    log("part A: navigating to rack detail");
    await navigateToRackDetail(locationName, rackName);
    log("part A: fixture complete");

    // ── PART B: Place Device A at U5 ──────────────────────────────────────────

    log(`part B: placing device A at U${PLACE_U_A}`);
    await placeDeviceAtU(deviceCodeA, PLACE_U_A);
    await expectExactlyOnePlacement(deviceCodeA, PLACE_U_A);
    log(`part B: device A placed at U${PLACE_U_A} (occupies U${PLACE_U_A}-U${PLACE_U_A + MODEL_HEIGHT - 1})`);

    // ── PART C: Negative — exact occupied U ───────────────────────────────────

    await attemptPlacementExpectError(
      "part C (occupied U)",
      deviceCodeB,
      String(PLACE_U_A),
      null,
      "collision:",
    );

    // ── PART D: Negative — partial overlap ────────────────────────────────────

    await attemptPlacementExpectError(
      "part D (partial overlap)",
      deviceCodeB,
      String(PLACE_U_A + 1),
      null,
      "collision:",
    );

    // ── PART E: Negative — full overlap / containment ─────────────────────────

    await attemptPlacementExpectError(
      "part E (full overlap / containment)",
      deviceCodeB,
      String(PLACE_U_A - 1),
      "4",
      "collision:",
    );

    // ── PART F: Negative — exceeds rack height ────────────────────────────────

    await attemptPlacementExpectError(
      "part F (exceeds rack height)",
      deviceCodeB,
      String(RACK_HEIGHT),
      null,
      "out of rack bounds:",
    );

    // ── PART G: Negative — invalid UI input ───────────────────────────────────

    await attemptPlacementExpectError(
      "part G1 (invalid start U)",
      deviceCodeB,
      "0",
      null,
      "Start U must be a positive integer.",
    );

    await attemptPlacementExpectError(
      "part G2 (invalid height override)",
      deviceCodeB,
      "1",
      "0",
      "Height override must be a positive integer if provided.",
    );

    // ── PART H: Aggregate — nothing changed ───────────────────────────────────

    log("part H: verifying no state changed after all rejected attempts");
    await expectUnchangedFixtureState(locationName, rackName, deviceNameB, deviceCodeB, modelName, deviceCodeA);
    log("part H: confirmed — device B still unplaced, device A's placement unchanged");

    // ── PART I: Save, close, reopen — persistence check ───────────────────────

    log("part I: saving and closing repository");
    await clickNav("repository");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
    await browser.$('[data-testid="repository-close-action"]').click();
    await clickWhenEnabled("unsaved-changes-save");
    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("part I: repository closed");

    log(`part I: reopening repository at ${repoPath}`);
    await reactSetValue("repository-open-path-input", repoPath);
    await clickWhenEnabled("repository-open-path-submit");
    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
    await expectActiveRepositoryPath(repoPath);
    log("part I: repository reopened");

    log("part I: re-verifying nothing changed after reopen");
    await expectUnchangedFixtureState(locationName, rackName, deviceNameB, deviceCodeB, modelName, deviceCodeA);
    log("part I: confirmed after reopen — device B still unplaced, device A's placement unchanged");
  });
});
