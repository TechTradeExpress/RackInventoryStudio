/**
 * Smoke test: verifies the Tauri desktop app launches and the repository
 * landing screen renders correctly.
 *
 * Assertions are intentionally minimal — this suite's only job is to confirm
 * the app shell starts without crash and the expected landing UI is visible.
 * Repository workflow flows belong to PR-3 and later stages.
 *
 * Selectors (stable data-testid contract added in PR-2):
 *   repository-landing-title  — PageHeader <h1> for the landing page title
 *   repository-clone-title    — Panel <h2> for the Clone repository section
 *   repository-create-title   — Panel <h2> for the Create new repository section
 *   repository-create-submit  — submit button inside the Create repository form
 *
 * Running this suite requires:
 *   - Compiled Tauri release binary via CLI: pnpm -C apps/desktop tauri build --no-bundle
 *     (bare cargo build --release does NOT embed frontendDist assets)
 *   - tauri-driver installed  (cargo install tauri-driver)
 *   - Linux: webkit2gtk-driver + xvfb  (apt-get install -y webkit2gtk-driver xvfb)
 * See e2e-wdio/wdio.conf.ts for full prerequisites and run command.
 */
import { browser, expect } from "@wdio/globals";

describe("Rack Inventory Studio — desktop smoke", () => {
  it("launches and shows repository landing actions", async () => {
    const body = await browser.$("body");
    await expect(body).toExist();

    await expect(
      browser.$('[data-testid="repository-landing-title"]'),
    ).toBeDisplayed();

    await expect(
      browser.$('[data-testid="repository-clone-title"]'),
    ).toBeDisplayed();

    await expect(
      browser.$('[data-testid="repository-create-title"]'),
    ).toBeDisplayed();

    await expect(
      browser.$('[data-testid="repository-create-submit"]'),
    ).toBeDisplayed();
  });
});
