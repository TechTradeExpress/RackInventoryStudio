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
 *
 * Guard coverage for the four relationship guard workflows is split across:
 *   - destructive-guards-inventory.e2e.ts (Device model guard, Device guard)
 *   - destructive-guards-hierarchy.e2e.ts (Location guard, Rack guard)
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
 * Find the exact row for entityName and click its Delete button.
 * Matches by reading aria-label values from all buttons inside the row and
 * comparing exactly against "Delete <entityName>" — entity names are not
 * interpolated into a CSS selector because they may contain characters that
 * would break CSS attribute-value syntax.
 */
export async function clickRowDeleteAction(
  rowSelector: string,
  entityName: string,
): Promise<void> {
  const row = await findRowByExactName(rowSelector, entityName);
  const expectedLabel = `Delete ${entityName}`;

  const foundLabels = await browser.execute(
    (el: Element, label: string) => {
      const buttons = Array.from(el.querySelectorAll("button[aria-label]"));
      return buttons.map((b) => b.getAttribute("aria-label") ?? "");
    },
    row as unknown as Element,
    expectedLabel,
  );

  const matchIndex = foundLabels.indexOf(expectedLabel);
  if (matchIndex === -1) {
    throw new Error(
      `clickRowDeleteAction: no button with aria-label="${expectedLabel}" ` +
      `in row "${entityName}" (rowSelector="${rowSelector}"). ` +
      `Found labels: [${foundLabels.map((l) => `"${l}"`).join(", ")}]`,
    );
  }

  const buttons = await row.$$("button[aria-label]");
  const button = buttons[matchIndex];
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

// ── Rack navigation helpers ───────────────────────────────────────────────────

/**
 * Atomically check whether the racks panel is showing the rack list or the rack
 * detail view.  Returns "list" when rack-add-btn is present, "detail" when
 * palette-drop-zone is present, or null when neither is present yet (caller
 * should use waitUntil).
 *
 * Uses a single browser.execute() call so the two checks are atomic — no
 * inter-call state change risk.
 */
export async function waitForRackListOrDetail(
  timeout = 30_000,
): Promise<"list" | "detail"> {
  return browser.waitUntil(
    async () => {
      const state = await browser.execute(() => {
        if (document.querySelector('[data-testid="rack-add-btn"]')) return "list";
        if (document.querySelector('[data-testid="palette-drop-zone"]')) return "detail";
        return null;
      });
      return state ?? false;
    },
    {
      timeout,
      timeoutMsg: `Neither rack list (rack-add-btn) nor rack detail (palette-drop-zone) appeared within ${timeout} ms`,
    },
  ) as Promise<"list" | "detail">;
}

/**
 * If the racks panel is currently showing rack detail, click the Back button
 * (data-testid="rack-detail-back-btn") and wait for the rack list.
 * No-op when already on the rack list.
 */
export async function ensureRackListView(timeout = 30_000): Promise<void> {
  const state = await waitForRackListOrDetail(timeout);
  if (state === "detail") {
    const backBtn = browser.$('[data-testid="rack-detail-back-btn"]');
    await backBtn.waitForDisplayed({ timeout: 10_000 });
    await backBtn.click();
    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 15_000 });
  }
}

// ── Relational assertion helpers ──────────────────────────────────────────────

/**
 * Assert the Location row shows exactly expectedCount in its Racks column.
 *
 * Location table column layout (0-indexed tds):
 *   0: Name (<strong>)
 *   1: Address
 *   2: Description
 *   3: Racks count (tbl-num tbl-mono)
 *   4: Tags
 *   5: Actions
 */
export async function expectLocationRackCount(
  rowSelector: string,
  locationName: string,
  expectedCount: number,
): Promise<void> {
  const row = await findRowByExactName(rowSelector, locationName);
  const actual = await browser.execute((el: Element) => {
    const tds = el.querySelectorAll("td");
    const cell = tds[3];
    return cell ? (cell.textContent ?? "").trim() : null;
  }, row as unknown as Element);

  if (actual === null) {
    throw new Error(
      `expectLocationRackCount: rack count cell (td[3]) not found in row "${locationName}"`,
    );
  }
  const parsed = Number(actual);
  if (isNaN(parsed) || parsed !== expectedCount) {
    throw new Error(
      `expectLocationRackCount: expected rack count ${expectedCount} for location "${locationName}", got "${actual}"`,
    );
  }
}

/**
 * Assert the Rack row shows exactly expectedFront and expectedRear in its Front
 * and Rear placement count cells.
 *
 * Rack table column layout (0-indexed tds):
 *   0: Name (<strong>)
 *   1: Row (tbl-mono)
 *   2: Height (tbl-num tbl-mono)
 *   3: Front (<Badge> — text: "{n} placed")
 *   4: Rear  (<Badge> — text: "{n} placed")
 *   5: Utilization
 *   6: Actions
 */
export async function expectRackPlacementCounts(
  rackName: string,
  expectedFront: number,
  expectedRear: number,
): Promise<void> {
  const row = await findRowByExactName("[data-rack-code]", rackName);
  const counts = await browser.execute((el: Element) => {
    const tds = el.querySelectorAll("td");
    const front = tds[3] ? (tds[3].textContent ?? "").trim() : null;
    const rear  = tds[4] ? (tds[4].textContent ?? "").trim() : null;
    return { front, rear };
  }, row as unknown as Element);

  const expectedFrontText = `${expectedFront} placed`;
  const expectedRearText  = `${expectedRear} placed`;

  if (counts.front !== expectedFrontText) {
    throw new Error(
      `expectRackPlacementCounts: rack "${rackName}" front expected "${expectedFrontText}", got "${counts.front}"`,
    );
  }
  if (counts.rear !== expectedRearText) {
    throw new Error(
      `expectRackPlacementCounts: rack "${rackName}" rear expected "${expectedRearText}", got "${counts.rear}"`,
    );
  }
}

/**
 * Assert the Device row shows the expected model name and placement status badge.
 *
 * Device table column layout (0-indexed tds):
 *   0: Type icon
 *   1: Name (<strong>)
 *   2: device_type (tbl-mono)
 *   3: Status badge
 *   4: Placed/Unplaced badge (exact text: "placed" or "unplaced")
 *   5: Model name (or "no model")
 *   6: Serial
 *   7: Asset tag
 *   8: Actions
 *
 * expectedPlacementStatus must be "placed" or "unplaced" (exact badge text).
 */
export async function expectDeviceRowState(
  deviceName: string,
  expectedModelName: string | null,
  expectedPlacementStatus: "placed" | "unplaced",
): Promise<void> {
  const row = await findRowByExactName("[data-device-code]", deviceName);
  const state = await browser.execute((el: Element) => {
    const tds = el.querySelectorAll("td");
    const placedCell = tds[4] ? (tds[4].textContent ?? "").trim() : null;
    const modelCell  = tds[5] ? (tds[5].textContent ?? "").trim() : null;
    return { placedCell, modelCell };
  }, row as unknown as Element);

  if (state.placedCell !== expectedPlacementStatus) {
    throw new Error(
      `expectDeviceRowState: device "${deviceName}" placement badge expected ` +
      `"${expectedPlacementStatus}", got "${state.placedCell}"`,
    );
  }

  const expectedModel = expectedModelName ?? "no model";
  if (state.modelCell !== expectedModel) {
    throw new Error(
      `expectDeviceRowState: device "${deviceName}" model cell expected ` +
      `"${expectedModel}", got "${state.modelCell}"`,
    );
  }
}

/**
 * Assert exactly one placement card exists for a device at a given U position.
 *
 * Placement cards in RackUnitDiagram have:
 *   data-device-code={target_code}
 *   data-start-u={start_u}
 *
 * Checks that exactly one element matches both attributes and is displayed.
 */
export async function expectExactlyOnePlacement(
  deviceCode: string,
  startU: number,
): Promise<void> {
  const selector = `[data-device-code="${deviceCode}"][data-start-u="${startU}"]`;
  const cards = await browser.$$(selector);
  if (cards.length !== 1) {
    throw new Error(
      `expectExactlyOnePlacement: expected exactly 1 placement card for ` +
      `deviceCode="${deviceCode}" startU=${startU}, found ${cards.length}`,
    );
  }
  if (!(await cards[0].isDisplayed())) {
    throw new Error(
      `expectExactlyOnePlacement: placement card for deviceCode="${deviceCode}" ` +
      `startU=${startU} exists but is not displayed`,
    );
  }
}
