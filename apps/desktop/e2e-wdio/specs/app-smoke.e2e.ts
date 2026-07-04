/**
 * Smoke test: verifies the Tauri desktop app launches and the repository
 * landing screen renders correctly.
 *
 * Assertions are intentionally minimal — this suite's only job is to confirm
 * the app shell starts without crash and the expected landing UI is visible.
 * Repository workflow flows belong to PR-3 and later stages.
 *
 * Selectors use stable heading text (h2 from Panel component) and button text
 * that have been stable across the beta releases.  No data-testid additions are
 * needed for these top-level landmark elements — that work belongs to PR-2.
 *
 * Running this suite requires:
 *   - Compiled Tauri release binary (pnpm tauri build)
 *   - tauri-driver installed  (cargo install tauri-driver)
 *   - Linux: webkit2gtk-driver  (apt-get install -y webkit2gtk-driver)
 * See e2e-wdio/wdio.conf.ts for full prerequisites.
 */
import { browser, expect } from "@wdio/globals";

describe("Rack Inventory Studio — desktop smoke", () => {
  it("app shell renders", async () => {
    const body = await browser.$("body");
    await expect(body).toExist();
  });

  it("repository landing screen shows Open a repository heading", async () => {
    const heading = await browser.$("h2=Open a repository");
    await expect(heading).toBeDisplayed();
  });

  it("repository landing screen shows Clone repository section", async () => {
    const heading = await browser.$("h2=Clone repository");
    await expect(heading).toBeDisplayed();
  });

  it("repository landing screen shows Create new repository section", async () => {
    const heading = await browser.$("h2=Create new repository");
    await expect(heading).toBeDisplayed();
  });

  it("Create repository button is visible", async () => {
    const btn = await browser.$("button=Create repository");
    await expect(btn).toBeDisplayed();
  });
});
