/**
 * Shared WDIO helpers for destructive-operation specs (delete flows, guards).
 *
 * These helpers are specific to Stage 3B.2 and encapsulate the ConfirmDialog
 * interaction pattern, delete-error banner assertions, and entity-row helpers
 * that use atomic browser.execute() DOM reads — the same stale-element–safe
 * approach established in Stage 3B.1.
 *
 * ConfirmDialog interaction notes:
 *   - Row Delete buttons are clicked with native WebDriver .click() (button is
 *     not behind a modal backdrop).
 *   - ConfirmDialog confirm/cancel buttons are clicked via browser.execute()
 *     synthetic click: WebKitGTK intercepts mousedown on the modal backdrop and
 *     can erroneously dismiss the dialog before the click reaches the button.
 *     browser.execute() bypasses the backdrop event entirely.
 */
import { browser } from "@wdio/globals";

// ── Atomic DOM read ───────────────────────────────────────────────────────────

/**
 * Read entity names from all rows matching rowSelector by querying the <strong>
 * child of each row.  Runs as a single atomic browser.execute() call — no
 * inter-call stale-element risk.
 */
export async function getEntityNamesInRows(rowSelector: string): Promise<string[]> {
  return browser.execute((selector: string) => {
    const rows = document.querySelectorAll(selector);
    return Array.from(rows)
      .map((row) => {
        const strong = row.querySelector("strong");
        return strong ? (strong.textContent ?? "").trim() : null;
      })
      .filter((name): name is string => name !== null && name.length > 0);
  }, rowSelector);
}

// ── Row finders ───────────────────────────────────────────────────────────────

/**
 * Wait until a row with an exact <strong> match for expectedName appears, then
 * return the WebdriverIO element.
 *
 * The wait condition uses getEntityNamesInRows() (atomic browser.execute) — no
 * stale-element risk during the wait.  The post-wait re-fetch catches only the
 * specifically recognised stale-element condition; all other errors propagate.
 */
export async function findRowByExactName(
  rowSelector: string,
  expectedName: string,
  timeout = 15_000,
): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const names = await getEntityNamesInRows(rowSelector);
      return names.includes(expectedName);
    },
    {
      timeout,
      timeoutMsg:
        `Row with exact name "${expectedName}" via "${rowSelector}" ` +
        `not found within ${timeout} ms`,
    },
  );

  const rows = await browser.$$(rowSelector);
  for (const row of rows) {
    try {
      const nameEl = await row.$("strong");
      if ((await nameEl.isExisting()) && (await nameEl.getText()).trim() === expectedName) {
        return row;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("stale element")) throw e;
    }
  }

  throw new Error(`Row with exact name "${expectedName}" disappeared after wait`);
}

/**
 * Assert exactly one row has an exact <strong> match for expectedName.
 * Point-in-time check — call after findRowByExactName has confirmed the row exists.
 */
export async function expectExactlyOneRowByName(
  rowSelector: string,
  expectedName: string,
): Promise<void> {
  const names = await getEntityNamesInRows(rowSelector);
  const count = names.filter((n) => n === expectedName).length;
  if (count !== 1) {
    throw new Error(
      `Expected exactly one row with name "${expectedName}" via "${rowSelector}", found ${count}`,
    );
  }
}

/**
 * Wait until no row has an exact <strong> match for unexpectedName.
 * Uses waitUntil because delete triggers an async list reload — the row may
 * still be present when the ConfirmDialog has just closed.
 */
export async function expectNoRowByName(
  rowSelector: string,
  unexpectedName: string,
  timeout = 15_000,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const names = await getEntityNamesInRows(rowSelector);
      return !names.includes(unexpectedName);
    },
    {
      timeout,
      timeoutMsg:
        `Row "${unexpectedName}" via "${rowSelector}" did not disappear within ${timeout} ms`,
    },
  );
}

// ── Delete interaction helpers ────────────────────────────────────────────────

/**
 * Find the exact row for entityName and click its aria-label="Delete <entityName>"
 * button using native WebDriver .click() (the button is not behind a modal backdrop).
 */
export async function clickRowDeleteAction(
  rowSelector: string,
  entityName: string,
): Promise<void> {
  const row = await findRowByExactName(rowSelector, entityName);
  const button = await row.$(`button[aria-label="Delete ${entityName}"]`);
  await button.waitForDisplayed({ timeout: 10_000 });
  await button.waitForEnabled({ timeout: 10_000 });
  await button.click();
}

/**
 * Assert the ConfirmDialog is visible and correctly titled for the given entity.
 * Checks:
 *   1. data-testid="modal" is displayed
 *   2. role="dialog" element exists
 *   3. aria-label === `Delete "${entityName}"?`
 *   4. confirm-dialog-confirm button exists
 *   5. confirm-dialog-cancel button exists
 */
export async function expectDeleteDialog(entityName: string): Promise<void> {
  const modal = browser.$('[data-testid="modal"]');
  await modal.waitForDisplayed({ timeout: 10_000 });

  const dialog = browser.$('[role="dialog"]');
  if (!(await dialog.isExisting())) {
    throw new Error(`expectDeleteDialog: role="dialog" element not found in DOM`);
  }

  const ariaLabel = await modal.getAttribute("aria-label");
  const expectedLabel = `Delete "${entityName}"?`;
  if (ariaLabel !== expectedLabel) {
    throw new Error(
      `expectDeleteDialog: aria-label expected "${expectedLabel}", got "${ariaLabel}"`,
    );
  }

  const confirmBtn = browser.$('[data-testid="confirm-dialog-confirm"]');
  if (!(await confirmBtn.isExisting())) {
    throw new Error(`expectDeleteDialog: confirm-dialog-confirm button not found`);
  }

  const cancelBtn = browser.$('[data-testid="confirm-dialog-cancel"]');
  if (!(await cancelBtn.isExisting())) {
    throw new Error(`expectDeleteDialog: confirm-dialog-cancel button not found`);
  }
}

/**
 * Click a ConfirmDialog button (confirm or cancel) via browser.execute() synthetic
 * click.  Required because WebKitGTK intercepts mousedown on the modal backdrop
 * and may dismiss the dialog before a native .click() reaches the button.
 */
export async function clickConfirmDialogAction(
  testId: "confirm-dialog-confirm" | "confirm-dialog-cancel",
): Promise<void> {
  const button = await browser.$(`[data-testid="${testId}"]`);
  await button.waitForDisplayed({ timeout: 10_000 });
  await button.waitForEnabled({ timeout: 10_000 });
  await browser.execute((el: HTMLElement) => el.click(), button as unknown as HTMLElement);
}

/**
 * Wait for the ConfirmDialog to close by waiting for confirm-dialog-confirm to
 * leave the DOM.
 */
export async function waitForConfirmDialogClosed(timeout = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => !(await browser.$('[data-testid="confirm-dialog-confirm"]').isExisting()),
    {
      timeout,
      timeoutMsg: `ConfirmDialog did not close within ${timeout} ms`,
    },
  );
}

// ── Delete error banner assertions ────────────────────────────────────────────

/**
 * Assert the delete-error banner wrapper is visible and its text contains
 * expectedMessage.  Use to verify a guard error was surfaced.
 */
export async function expectDeleteError(
  testId: string,
  expectedMessage: string,
): Promise<void> {
  const wrapper = browser.$(`[data-testid="${testId}"]`);
  await wrapper.waitForDisplayed({ timeout: 10_000 });
  const text = await wrapper.getText();
  if (!text.includes(expectedMessage)) {
    throw new Error(
      `expectDeleteError: banner "${testId}" expected to contain "${expectedMessage}", ` +
      `got: "${text}"`,
    );
  }
}

/**
 * Assert the delete-error banner wrapper is absent from the DOM.
 * Use after a successful delete to confirm no error was surfaced.
 */
export async function expectNoDeleteError(testId: string): Promise<void> {
  const el = browser.$(`[data-testid="${testId}"]`);
  if (await el.isExisting()) {
    const text = await el.getText();
    throw new Error(
      `expectNoDeleteError: unexpected banner "${testId}" is present in DOM — "${text}"`,
    );
  }
}
