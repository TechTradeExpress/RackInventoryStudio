/**
 * Smoke test: verifies the Tauri desktop app launches and the repository
 * landing screen renders correctly.
 *
 * Assertions are intentionally minimal — this suite's only job is to confirm
 * the app shell starts without crash and the expected landing UI is visible.
 * Repository workflow flows belong to PR-3 and later stages.
 *
 * Selectors:
 *   h1=Open a repository  — PageHeader component renders the page title as <h1>
 *   h2=Clone repository   — Panel component renders its title as <h2>
 *   h2=Create new repository
 *   button=Create repository
 * data-testid additions are deferred to PR-2.
 *
 * Running this suite requires:
 *   - Compiled Tauri release binary via CLI: pnpm tauri build --no-bundle
 *     (bare cargo build --release does NOT embed frontendDist assets)
 *   - tauri-driver installed  (cargo install tauri-driver)
 *   - Linux: webkit2gtk-driver + xvfb  (apt-get install -y webkit2gtk-driver xvfb)
 * See e2e-wdio/wdio.conf.ts for full prerequisites and run command.
 */
import { browser, expect } from "@wdio/globals";

describe("Rack Inventory Studio — desktop smoke", () => {
  it("launches and shows repository landing actions", async () => {
    await expect(await browser.$("body")).toExist();

    await expect(await browser.$("h1=Open a repository")).toBeDisplayed();
    await expect(await browser.$("h2=Clone repository")).toBeDisplayed();
    await expect(await browser.$("h2=Create new repository")).toBeDisplayed();
    await expect(await browser.$("button=Create repository")).toBeDisplayed();
  });
});
