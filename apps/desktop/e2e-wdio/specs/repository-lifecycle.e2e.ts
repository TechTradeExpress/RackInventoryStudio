/**
 * Repository lifecycle E2E — creates a repository in an isolated temp directory,
 * verifies it opens correctly, checks the scaffold on disk, closes it, and
 * reopens it via the "Open by path" text input (no native dialog required).
 *
 * Isolation is provided by the test-environment helper initialized in wdio.conf.ts:
 *   XDG_DATA_HOME / XDG_CONFIG_HOME / XDG_CACHE_HOME  — isolate WebKit state
 *   GIT_CONFIG_GLOBAL + GIT_CONFIG_NOSYSTEM=1          — isolate git identity
 *   RIS_E2E_REPOSITORY_PARENT                          — isolated repo parent dir
 *
 * Scaffold assertions derived from crates/ris-application/src/create.rs:
 *   {repo}/{code}/inventory/repo.yaml
 *   {repo}/{code}/.git/
 *
 * Running this suite requires the same prerequisites as app-smoke.e2e.ts.
 * See e2e-wdio/wdio.conf.ts for the full run command.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";
import {
  reactSetValue,
  expectActiveRepositoryPath,
} from "../support/repository-ui";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[lifecycle ${ts}] ${msg}`);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Rack Inventory Studio — repository lifecycle", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("creates, verifies on disk, closes, and reopens a repository", async () => {
    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;

    // Unique code per run — lowercase alphanumeric, matches the code validation regex.
    const suffix = Date.now().toString(36);
    const repoCode = `e2e${suffix}`;
    const repoName = `WDIO Lifecycle ${suffix}`;
    // Repository path on disk: {parent_path}/{code} (see create_repository_cmd in Rust).
    const expectedRepoPath = join(repoParent, repoCode);

    log(`repoParent=${repoParent} repoCode=${repoCode}`);

    // ── 1. Landing screen ─────────────────────────────────────────────────────
    log("step 1: waiting for landing title");
    await expect(
      browser.$('[data-testid="repository-landing-title"]'),
    ).toBeDisplayed({ timeout: 30_000 });
    log("step 1: landing title visible");

    // ── 2. Target path must not exist yet ─────────────────────────────────────
    if (existsSync(expectedRepoPath)) {
      throw new Error(
        `target path already exists before create: ${expectedRepoPath}`,
      );
    }

    // ── 3. Fill the Create repository form ───────────────────────────────────
    log("step 3: filling create form");
    await reactSetValue("repository-create-parent-input", repoParent);
    log("step 3: parent path set");
    await reactSetValue("repository-create-code-input", repoCode);
    log("step 3: code set");
    await reactSetValue("repository-create-name-input", repoName);
    log("step 3: name set");

    // ── 4. Submit (wait for validation to clear so the button is enabled) ─────
    log("step 4: waiting for submit button enabled");
    await browser.waitUntil(
      async () => {
        try {
          return await browser
            .$('[data-testid="repository-create-submit"]')
            .isEnabled();
        } catch {
          return false;
        }
      },
      {
        timeout: 10_000,
        timeoutMsg:
          "Create submit button never became enabled after filling all fields",
      },
    );
    log("step 4: submit button enabled, clicking");
    await browser.$('[data-testid="repository-create-submit"]').click();
    log("step 4: submit clicked");

    // ── 5. Wait for the open-repository view ─────────────────────────────────
    log("step 5: waiting for repository-active-root");
    await expect(
      browser.$('[data-testid="repository-active-root"]'),
    ).toBeDisplayed({ timeout: 30_000 });
    log("step 5: repository-active-root visible");

    // ── 5b. Verify the exact active path ──────────────────────────────────────
    log("step 5b: verifying active path after create");
    await expectActiveRepositoryPath(expectedRepoPath);
    log(`step 5b: active path matches ${expectedRepoPath}`);

    // ── 6. Filesystem assertions (scaffold from crates/ris-application/src/create.rs) ──
    log("step 6: filesystem assertions");
    if (!existsSync(expectedRepoPath)) {
      throw new Error(
        `repository directory missing after create: ${expectedRepoPath}`,
      );
    }
    if (!statSync(expectedRepoPath).isDirectory()) {
      throw new Error(`expected a directory, got a file: ${expectedRepoPath}`);
    }
    const repoYaml = join(expectedRepoPath, "inventory", "repo.yaml");
    if (!existsSync(repoYaml)) {
      throw new Error(
        `inventory/repo.yaml missing after create: ${repoYaml}`,
      );
    }
    const gitDir = join(expectedRepoPath, ".git");
    if (!existsSync(gitDir)) {
      throw new Error(
        `.git directory missing (git init should run on create): ${gitDir}`,
      );
    }
    log("step 6: all filesystem assertions passed");

    // ── 7. Close the repository ───────────────────────────────────────────────
    log("step 7: closing repository");
    await browser.$('[data-testid="repository-close-action"]').click();
    log("step 7: close clicked, waiting for landing title");
    await expect(
      browser.$('[data-testid="repository-landing-title"]'),
    ).toBeDisplayed({ timeout: 15_000 });
    log("step 7: landing title visible again");

    // ── 7b. Confirm active-path is no longer in the DOM ───────────────────────
    log("step 7b: confirming active path is gone after close");
    await browser
      .$('[data-testid="repository-active-path"]')
      .waitForDisplayed({ timeout: 5_000, reverse: true });
    log("step 7b: active path not displayed");

    // ── 8. Reopen via the "Open by path" text input ───────────────────────────
    log("step 8: setting open-path input");
    await reactSetValue("repository-open-path-input", expectedRepoPath);
    log("step 8: path set, waiting for open submit enabled");
    await browser.waitUntil(
      async () => {
        try {
          return await browser
            .$('[data-testid="repository-open-path-submit"]')
            .isEnabled();
        } catch {
          return false;
        }
      },
      {
        timeout: 10_000,
        timeoutMsg:
          "Open submit button never became enabled after setting path",
      },
    );
    log("step 8: open submit enabled, clicking");
    await browser.$('[data-testid="repository-open-path-submit"]').click();
    log("step 8: open submit clicked");

    // ── 9. Verify the same repository is open again ───────────────────────────
    log("step 9: waiting for repository-active-root");
    await expect(
      browser.$('[data-testid="repository-active-root"]'),
    ).toBeDisplayed({ timeout: 30_000 });
    log("step 9: repository-active-root visible");

    // ── 9b. Verify the exact active path after reopen ─────────────────────────
    log("step 9b: verifying active path after reopen");
    await expectActiveRepositoryPath(expectedRepoPath);
    log(`step 9b: active path matches ${expectedRepoPath}`);

    // Scaffold still on disk after reopen.
    if (!existsSync(expectedRepoPath)) {
      throw new Error(
        `repository directory missing after reopen: ${expectedRepoPath}`,
      );
    }
    if (!existsSync(join(expectedRepoPath, "inventory", "repo.yaml"))) {
      throw new Error(
        `inventory/repo.yaml missing after reopen: ${join(expectedRepoPath, "inventory", "repo.yaml")}`,
      );
    }
    log("step 9: all assertions passed");
  });
});
