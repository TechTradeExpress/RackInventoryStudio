/**
 * Representative latency benchmark — Stage 3B.4 Windows harness.
 *
 * Opt-in only: lives under e2e-wdio/benchmarks/, outside the default WDIO
 * spec glob (./specs/**\/*.e2e.ts in wdio.conf.ts), and is invoked exclusively
 * via:
 *   node scripts/run-wdio-performance-benchmark.mjs --spec representative-latency ...
 *
 * A single test exercises one continuous minimal workflow (one repository,
 * one location, one rack, one device model, one device) and measures nine
 * representative interaction-pattern cases (A-I) drawn from existing WDIO
 * specs, each as its own named measureStep. This is not new business
 * coverage — every interaction here already exists in specs/*.e2e.ts; this
 * file exists only to produce stable, isolated timing data per interaction
 * class without re-running (and re-measuring) the full spec suite.
 *
 * Case -> source mapping (full case matrix in
 * docs/E2E_WDIO_LATENCY_OPTIMIZATION.md):
 *   A — app-smoke: application ready / first DOM read
 *   B — core-inventory: controlled React input (repository creation)
 *   C — core-inventory: ordinary interactive button (open location modal)
 *   D — core-inventory: modal fill/submit/close
 *   E — core-inventory: row lookup + row navigation
 *   F — core-inventory: SearchableSelect (device model assignment)
 *   G — core-inventory: attribute/state assertion (aria-current)
 *   H — core-inventory: backend transition (submit placement)
 *   I — core-inventory: save, close, reopen + canonical path polling
 *
 * Steps between cases (rack/model/device creation, form fills) are workflow
 * scaffolding needed to reach the next measured case and are intentionally
 * left outside any measureStep block.
 */
import { browser } from "@wdio/globals";
import {
  reactSetValue,
  reactSelectValue,
  clickWhenEnabled,
  expectActiveRepositoryPath,
  createRepositoryThroughUi,
} from "../support/repository-ui";
import {
  clickNav,
  waitForModal,
  waitForModalClose,
  clickWhenVisible,
  clickRowViaDom,
} from "../support/spec-interactions";
import { isSelectorVisible } from "../support/dom-helpers";
import { measureStep } from "../support/command-timing";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[bench ${ts}] ${msg}`);
}

describe("Representative latency benchmark", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("benchmarks representative E2E interaction patterns", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const suffix = Date.now().toString(36);
    const repoCode = `bench${suffix}`;
    const repoName = `WDIO Benchmark ${suffix}`;
    const locationName = `Bench Location ${suffix}`;
    const rackName = `Bench Rack ${suffix}`;
    const modelName = `Bench Model ${suffix}`;
    const deviceName = `Bench Device ${suffix}`;

    // ── Case A — application ready ─────────────────────────────────────────
    // Measures WebView readiness, the landing screen's stable element, and
    // the cost of the first DOM read (single polling wait, no convenience
    // command retries).
    log("case A: waiting for landing screen");
    await measureStep("case-a-app-ready", () =>
      browser.waitUntil(
        () => browser.execute(isSelectorVisible, '[data-testid="repository-landing-title"]'),
        { timeout: 30_000, interval: 100, timeoutMsg: "repository-landing-title never became visible" },
      ),
    );

    // ── Case B — controlled React input (repository creation) ─────────────
    // Measures reactSetValue x3 + clickWhenEnabled + submit + confirmation.
    log("case B: creating repository (controlled input)");
    const repoPath = await measureStep("case-b-controlled-input", () =>
      createRepositoryThroughUi({ repoParent, repoCode, repoName }),
    );

    await clickNav("locations");

    // ── Case C — ordinary interactive button (open location modal) ────────
    // Measures visibility wait + native WebDriver click + modal appearance.
    log("case C: opening Add location modal");
    await measureStep("case-c-open-modal", async () => {
      await clickWhenVisible("location-add-btn");
      await waitForModal("location-form-submit");
    });

    // ── Case D — modal open/close (fill, submit, confirm close) ────────────
    log("case D: filling and submitting location form");
    await measureStep("case-d-modal-fill-submit-close", async () => {
      await reactSetValue("field-name", locationName);
      await clickWhenEnabled("location-form-submit");
      await waitForModalClose("location-form-submit");
    });

    // ── Case E — row lookup + row navigation ───────────────────────────────
    // Measures: find row by text, documented DOM click for the
    // WebKit-non-interactable <tr>, and the resulting navigation transition.
    log("case E: locating location row and navigating to Racks");
    await browser.waitUntil(
      () =>
        browser.execute(
          (sel: string, name: string) =>
            Array.from(document.querySelectorAll(sel)).some((r) => r.textContent?.includes(name)),
          "[data-location-code]",
          locationName,
        ),
      { timeout: 15_000, interval: 100, timeoutMsg: `Location row for "${locationName}" never appeared` },
    );
    await measureStep("case-e-row-lookup-navigate", async () => {
      await clickRowViaDom("[data-location-code]", locationName, `Location row for "${locationName}"`);
      await browser.waitUntil(() => browser.execute(isSelectorVisible, '[data-testid="nav-racks"]'), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: "nav-racks did not appear after location click",
      });
    });

    // ── Setup (unmeasured): create a rack ──────────────────────────────────
    log("setup: creating rack");
    await clickWhenVisible("rack-add-btn");
    await waitForModal("rack-form-submit");
    await reactSetValue("field-name", rackName);
    await clickWhenEnabled("rack-form-submit");
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

    // ── Setup (unmeasured): create a 1U device model ───────────────────────
    log("setup: creating device model");
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

    // ── Setup (unmeasured): open Add device modal, fill name ──────────────
    log("setup: opening Add device modal");
    await clickNav("devices");
    await clickWhenVisible("device-add-btn");
    await waitForModal("device-form-submit");
    await reactSelectValue("field-device-type", "server");
    await reactSetValue("field-name", deviceName);

    // ── Case F — SearchableSelect (device model assignment) ───────────────
    // Measures: open dropdown, type search value, find option, native WDIO
    // click (required for onMouseDown), confirm the trigger reflects the
    // selection.
    log("case F: assigning device model via SearchableSelect");
    await measureStep("case-f-searchable-select", async () => {
      await clickWhenVisible("field-device-model-trigger");
      await browser.waitUntil(
        () => browser.execute(isSelectorVisible, '[data-testid="field-device-model-search"]'),
        { timeout: 10_000, interval: 100, timeoutMsg: "field-device-model-search did not appear" },
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
        { timeout: 15_000, interval: 100, timeoutMsg: `Model option "${modelName}" not found in dropdown` },
      );
      // Native WDIO click required — SearchableSelect uses onMouseDown, which
      // execute()-based HTMLElement.click() does not dispatch. Must NOT be
      // replaced with an execute()-based click.
      await browser.$(`//*[@role='option'][contains(.,'${modelName}')]`).click();
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
        {
          timeout: 5_000,
          interval: 100,
          timeoutMsg: `Device model trigger never showed selected model "${modelName}"`,
        },
      );
    });

    // ── Setup (unmeasured): submit device form ─────────────────────────────
    log("setup: submitting device form");
    await clickWhenEnabled("device-form-submit");
    const deviceCode: string = await (async () => {
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
      const code = await browser.execute(
        (sel: string, name: string) => {
          const row = Array.from(document.querySelectorAll(sel)).find((r) =>
            r.textContent?.includes(name),
          );
          return row?.getAttribute("data-device-code") ?? null;
        },
        "[data-device-code]",
        deviceName,
      );
      if (!code) throw new Error(`data-device-code attribute missing for device "${deviceName}"`);
      return code;
    })();

    // ── Case G — attribute/state assertion (aria-current) ──────────────────
    // Measures the cost of a single protocol-level attribute read replacing
    // repeated convenience-command retries (expect(...).toHaveAttribute()),
    // without weakening the assertion itself.
    log("case G: asserting nav-devices aria-current via single execute() read");
    await measureStep("case-g-attribute-assertion", async () => {
      const current = await browser.execute(
        (sel: string) => document.querySelector(sel)?.getAttribute("aria-current") ?? null,
        '[data-testid="nav-devices"]',
      );
      if (current !== "page") {
        throw new Error(`Expected nav-devices aria-current="page", got "${current}"`);
      }
    });

    // ── Setup (unmeasured): navigate to rack detail, open Place modal ──────
    log("setup: navigating to rack detail and opening Place modal");
    await clickNav("racks");
    await browser.waitUntil(() => browser.execute(isSelectorVisible, '[data-testid="rack-add-btn"]'), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: "rack-add-btn not visible after nav to racks",
    });
    await clickRowViaDom("[data-rack-code]", rackName, `Rack row for "${rackName}"`);
    await browser.waitUntil(
      () => browser.execute(isSelectorVisible, '[data-testid="palette-drop-zone"]'),
      { timeout: 15_000, interval: 100, timeoutMsg: "palette-drop-zone did not appear" },
    );
    const paletteBtnSel = `button[data-testid^="place-btn-device-"][data-device-code="${deviceCode}"]`;
    await browser.waitUntil(() => browser.execute(isSelectorVisible, paletteBtnSel), {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: `Palette Place button for device "${deviceCode}" never appeared`,
    });
    await browser.$(paletteBtnSel).click();
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const el = document.querySelector<HTMLButtonElement>('[data-testid="place-btn"]');
          return !!el && !el.disabled;
        }),
      { timeout: 30_000, interval: 100, timeoutMsg: "PlacePlacementModal place-btn never became enabled" },
    );
    await browser.waitUntil(
      () => browser.execute(isSelectorVisible, '[data-testid="start-u-input"]'),
      { timeout: 10_000, interval: 100, timeoutMsg: "start-u-input never appeared" },
    );
    await browser.$('[data-testid="start-u-input"]').addValue("1");

    // ── Case H — backend transition (submit placement) ─────────────────────
    // Measures: submit click, real IPC/backend placement time, and the wait
    // for the final UI state (modal closed, placed card visible at U1).
    log("case H: submitting placement");
    const cardSel = `[data-device-code="${deviceCode}"][data-start-u="1"]`;
    await measureStep("case-h-submit-placement", async () => {
      await clickWhenEnabled("place-btn");
      await browser.waitUntil(
        async () => {
          // Single atomic execute() reading both button and error state — see
          // the identical pattern (and rationale) in specs/core-inventory.e2e.ts
          // step 19.
          const state: { closed: boolean; error: string | null } = await browser.execute(() => {
            const btn = document.querySelector('[data-testid="place-btn"]');
            if (!btn) return { closed: true, error: null };
            const rect = (btn as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(btn as HTMLElement);
            const btnVisible =
              rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
            if (!btnVisible) return { closed: true, error: null };
            const errEl = document.querySelector(".ft-msg.err");
            if (errEl) {
              const er = (errEl as HTMLElement).getBoundingClientRect();
              if (er.width > 0 && er.height > 0) return { closed: false, error: errEl.textContent ?? "" };
            }
            return { closed: false, error: null };
          });
          if (state.error) throw new Error(`Placement failed — modal error: "${state.error}"`);
          return state.closed;
        },
        { timeout: 60_000, interval: 100, timeoutMsg: "place-btn still displayed (modal did not close)" },
      );
      await browser.waitUntil(() => browser.execute(isSelectorVisible, cardSel), {
        timeout: 30_000,
        interval: 100,
        timeoutMsg: `Placed card for device "${deviceCode}" at U1 never appeared`,
      });
    });
    const placedTitle = await browser.execute(
      (sel: string) => document.querySelector(sel)?.getAttribute("title") ?? null,
      cardSel,
    );
    if (!placedTitle?.includes(modelName)) {
      throw new Error(`Expected placed card title to reference model "${modelName}", got: "${placedTitle}"`);
    }

    // ── Case I — save, close, reopen ────────────────────────────────────────
    // Measures: save + close, reopen by path, canonical active-path polling
    // (exercises expectActiveRepositoryPath directly, including its restored
    // polling semantics).
    log("case I: saving, closing, and reopening the repository");
    await clickNav("repository");
    await browser.waitUntil(
      () => browser.execute(isSelectorVisible, '[data-testid="repository-active-root"]'),
      { timeout: 10_000, interval: 100, timeoutMsg: "repository-active-root not visible after nav to repository tab" },
    );
    await measureStep("case-i-save-close-reopen", async () => {
      await browser.$('[data-testid="repository-close-action"]').click();
      await clickWhenEnabled("unsaved-changes-save");
      await browser.waitUntil(
        () => browser.execute(isSelectorVisible, '[data-testid="repository-landing-title"]'),
        { timeout: 60_000, interval: 100, timeoutMsg: "repository-landing-title never appeared after save-and-close" },
      );
      await browser.waitUntil(
        async () => !(await browser.execute(isSelectorVisible, '[data-testid="repository-active-path"]')),
        { timeout: 5_000, interval: 100, timeoutMsg: "repository-active-path still visible after save-and-close" },
      );

      await reactSetValue("repository-open-path-input", repoPath);
      await clickWhenEnabled("repository-open-path-submit");
      await browser.waitUntil(
        () => browser.execute(isSelectorVisible, '[data-testid="repository-active-root"]'),
        { timeout: 30_000, interval: 100, timeoutMsg: "repository-active-root not visible after reopen" },
      );
      await expectActiveRepositoryPath(repoPath);
    });

    // ── Final (unmeasured) verification: persisted record survived reopen ──
    log("verifying placement persisted after reopen");
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
    await clickRowViaDom("[data-location-code]", locationName, "Location row after reopen");
    await browser.waitUntil(() => browser.execute(isSelectorVisible, '[data-testid="nav-racks"]'), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: "nav-racks did not appear after location reopen click",
    });
    await browser.waitUntil(() => browser.execute(isSelectorVisible, '[data-testid="rack-add-btn"]'), {
      timeout: 10_000,
      interval: 100,
      timeoutMsg: "rack-add-btn not visible after reopen nav",
    });
    await clickRowViaDom("[data-rack-code]", rackName, `Rack row "${rackName}" after reopen`);
    await browser.waitUntil(() => browser.execute(isSelectorVisible, cardSel), {
      timeout: 15_000,
      interval: 100,
      timeoutMsg: `Placed device "${deviceCode}" at U1 not found after reopen`,
    });
    const persistedTitle = await browser.execute(
      (sel: string) => document.querySelector(sel)?.getAttribute("title") ?? null,
      cardSel,
    );
    if (!persistedTitle?.includes(modelName)) {
      throw new Error(
        `Model "${modelName}" not referenced in persisted placement card title after reopen; got: "${persistedTitle}"`,
      );
    }
    log("all representative-latency cases measured and verified");
  });
});
