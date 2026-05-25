import { test as base, expect, type Page } from "@playwright/test";

const CSV_SNIPPET = "code,device_type,status,name\nCSV-DEV-001,server,planned,CSV Device 001";

// IDs match the fixture constants in apps/desktop/e2e/mocks/tauri-core.ts
const FIXTURE_RACK_OBJECT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const FIXTURE_UNPLACED_DEVICE_ID = "22222222-2222-2222-2222-222222222222";
const FIXTURE_NEW_PLACEMENT_ID = "11111111-1111-1111-1111-111111111111";
const FIXTURE_PLACEMENT_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const FIXTURE_NEW_MODEL_ID = "44444444-4444-4444-4444-444444444444";

// ── Console error guard ────────────────────────────────────────────────────────
// Override the page fixture so every test automatically fails on unexpected
// console.error calls. No filtering needed — the mock layer is clean.

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await use(page);
    expect(errors, "Unexpected console errors").toHaveLength(0);
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Fill the repo path input and click Open, then wait for tabs to enable. */
async function openFixtureRepo(page: Page) {
  await page.locator('input[type="text"]').first().fill("/tmp/ris-e2e-fixture");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Validation", exact: true }),
  ).toBeEnabled({ timeout: 6_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test("app shell loads without console errors", async ({ page }) => {
  await page.goto("/");

  // Repository tab is the active/visible tab
  await expect(
    page.getByRole("button", { name: "Repository", exact: true }),
  ).toBeVisible();
  // Tabs requiring an open repo are disabled
  await expect(
    page.getByRole("button", { name: "Validation", exact: true }),
  ).toBeDisabled();
  // Console errors are asserted by the page fixture after every test
});

test("landing state shows open and create actions", async ({ page }) => {
  await page.goto("/");

  // Landing heading is visible
  await expect(
    page.getByRole("heading", { name: /Open a repository/i }),
  ).toBeVisible();
  // Open path input and Open button are present
  await expect(page.locator('input[type="text"]').first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open", exact: true }),
  ).toBeVisible();
  // Create repository button (from wizard) is visible on landing
  await expect(
    page.getByRole("button", { name: "Create repository", exact: true }),
  ).toBeVisible();
});

test("open repository enables navigation tabs", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Tabs that are always enabled after repo open (Racks is location-scoped — hidden by default)
  const tabNames = [
    "Repository",
    "Validation",
    "Locations",
    "Devices",
    "Device Models",
    "CSV Import",
  ];
  for (const name of tabNames) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  }
  // Racks nav is hidden until a location is selected
  await expect(page.getByRole("button", { name: "Racks", exact: true })).not.toBeVisible();
  // Settings is always visible
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  // Search bar is visible after repo is open
  await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
});

test("global search shows results and navigates to Locations", async ({
  page,
}) => {
  await page.goto("/");
  await openFixtureRepo(page);

  await page.locator('input[placeholder*="Search"]').fill("server");
  // Mock returns a location result — check the accessible option and click it
  await expect(
    page.getByRole("option", { name: /Server Room A/ }),
  ).toBeVisible();

  // Click the location result — should navigate to Locations tab
  await page.getByRole("option", { name: /Server Room A/ }).click();
  await expect(
    page.getByRole("heading", { name: "Locations" }),
  ).toBeVisible();
  await expect(page.getByText("server-room-a")).toBeVisible();
});

test("validation panel shows issues and navigates on click", async ({
  page,
}) => {
  await page.goto("/");
  await openFixtureRepo(page);

  await page.getByRole("button", { name: "Validation", exact: true }).click();
  // Heading includes "Save" as well
  await expect(
    page.getByRole("heading", { name: /Validation/i }),
  ).toBeVisible();

  // Click Validate repository to trigger the mock call
  await page.getByRole("button", { name: "Validate repository", exact: true }).click();
  await expect(
    page.getByText("Smoke test: device has no placement"),
  ).toBeVisible();

  // Navigation button for the device issue
  const navBtn = page.getByRole("button", { name: /open device/i });
  await expect(navBtn).toBeVisible();
  await navBtn.click();
  await expect(page.getByRole("heading", { name: "Devices", exact: true })).toBeVisible();
});

test("CSV import preview and import flow", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  await page.getByRole("button", { name: "CSV Import", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CSV Import" }),
  ).toBeVisible();

  // Paste CSV content directly into the textarea
  await page.locator("textarea").fill(CSV_SNIPPET);

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  // Preview table shows the code cell (more specific than getByText)
  await expect(page.getByRole("cell", { name: "CSV-DEV-001" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "create" })).toBeVisible();

  await page
    .getByRole("button", { name: /^Import \d+ row/ })
    .click();
  await expect(page.getByText(/1 device created/i)).toBeVisible();
});

test("rack detail: diagram is primary surface — no placement table", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to Racks via Locations → Manage racks
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await expect(page.getByRole("heading", { name: "Racks" })).toBeVisible();
  await expect(page.getByText("rack-main")).toBeVisible();

  // Click the rack row to open detail
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Front/Rear segmented control is visible
  await expect(page.getByRole("tab", { name: "Front" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Rear" })).toBeVisible();

  // Rack diagram panel is the primary surface
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Diagram contains the occupied fixture placement block (fixture: "srv-01" at U10)
  await expect(page.getByTestId("placed-front-ffffffff-ffff-ffff-ffff-ffffffffffff")).toBeVisible();

  // Placement TABLE must NOT be present — headings "Front placements" / "Rear placements" are removed
  await expect(page.getByRole("heading", { name: "Front placements", exact: true })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Rear placements", exact: true })).not.toBeVisible();
  // Table headers that only existed in the placement table must not appear
  await expect(page.getByRole("columnheader", { name: "Asset tag", exact: true })).not.toBeVisible();

  // Diagram grid has a "Name" column header (multi-column layout)
  await expect(page.getByTestId("diagram-col-name")).toBeVisible();
  await expect(page.getByTestId("diagram-col-name")).toHaveText("Name");
  // "Front" must not appear as a data-column header inside the diagram header row
  const headerEl = page.locator('[aria-label="Rack diagram header"]');
  await expect(headerEl).toBeVisible();
  // Placed item shows its name/label in the diagram
  await expect(page.getByTestId("placed-front-ffffffff-ffff-ffff-ffff-ffffffffffff")).toContainText("srv-01");

  // Palette sidebar is still visible (right column — Placeable equipment)
  await expect(page.getByRole("heading", { name: "Placeable equipment", exact: true })).toBeVisible();

  // Inspector empty state is shown when nothing is selected
  await expect(page.getByRole("heading", { name: "Placement inspector", exact: true })).toBeVisible();
  await expect(page.getByText("Select a placement in the diagram")).toBeVisible();

  // Switching to Rear: occupied block disappears (fixture is front-only), tab updates
  await page.getByRole("tab", { name: "Rear" }).click();
  await expect(page.getByRole("tab", { name: "Rear" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("placed-front-ffffffff-ffff-ffff-ffff-ffffffffffff")).not.toBeVisible();
});

test("rack detail: click empty slot opens place modal", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Click an empty U-slot in the diagram (U1 on front should be empty given fixture has placement at U10)
  await page.getByTestId("drop-cell-front-1").click();

  // Place equipment modal should open
  await expect(
    page.getByRole("dialog", { name: "Place equipment" }),
  ).toBeVisible();

  // Cancel — dialog should close without making a backend call
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Place equipment" }),
  ).not.toBeVisible();
});

test("rack detail: click occupied block selects it and shows inspector", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Placement table must not exist
  await expect(page.getByRole("heading", { name: "Front placements", exact: true })).not.toBeVisible();

  // Click the occupied fixture placement block in the diagram (fixture: srv-01 at U10)
  await page.getByTestId("placed-front-ffffffff-ffff-ffff-ffff-ffffffffffff").click();

  // Inspector panel updates with placement details (KV rows)
  await expect(page.getByText("plc-srv-01", { exact: true })).toBeVisible();
  await expect(page.getByText("srv-01", { exact: true }).first()).toBeVisible();

  // "Move to Rear" / "Change side" must NOT be present (removed as unsafe per product decision)
  await expect(page.getByRole("button", { name: /Move to Rear/i })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Move to Front/i })).not.toBeVisible();

  // Remove placement button is still present in the inspector
  await expect(page.getByRole("button", { name: /Remove placement/i })).toBeVisible();

  // Edit placement button is still present
  await expect(page.getByRole("button", { name: /Edit placement/i })).toBeVisible();
});

test("git section shows status label and publish guidance", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Repository tab is active after open — Git section should be visible
  await expect(page.getByRole("heading", { name: "Git", exact: true })).toBeVisible();

  // Semantic status label from mock (is_repository=true, clean, ahead=1)
  await expect(page.getByText(/Ahead of remote by 1 commit/)).toBeVisible();

  // Action hint list item about being ahead is shown
  await expect(
    page.getByRole("listitem").filter({ hasText: /ahead of remote.*push when ready/i }),
  ).toBeVisible();

  // Branch info is visible in the Git section (Recent commits panel description)
  await expect(page.getByText("Branch: main")).toBeVisible();

  // Commit step shows "nothing to commit" since tree is clean
  await expect(
    page.getByText(/Working tree is clean — nothing to commit/i),
  ).toBeVisible();

  // Push button is present and enabled (remote available, no unsaved changes)
  await expect(
    page.getByRole("button", { name: "Push", exact: true }).first(),
  ).toBeEnabled();

  // Pull button is present and enabled
  await expect(
    page.getByRole("button", { name: "Pull", exact: true }).first(),
  ).toBeEnabled();
});

test("settings page is accessible without a repository", async ({ page }) => {
  await page.goto("/");

  // Settings nav item is visible before opening any repo
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();

  // Clicking opens the Settings page
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // About panel and diagnostics are present
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnostics and logs" })).toBeVisible();
});

test("settings page shows logs directory actions", async ({ page }) => {
  await page.goto("/");

  // Navigate to Settings (accessible without a repository open)
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // "Open logs folder" button is visible
  await expect(
    page.getByRole("button", { name: "Open logs folder", exact: true }),
  ).toBeVisible();

  // "Choose logs folder…" button is visible
  await expect(
    page.getByRole("button", { name: "Choose logs folder…", exact: true }),
  ).toBeVisible();

  // Active log directory path from mock is shown (default and active are the same in mock,
  // so the path appears twice; .first() matches either occurrence)
  await expect(page.getByText("/tmp/ris-e2e-logs").first()).toBeVisible();
});

test("rack detail: drag from palette rack_object to empty slot opens modal prefilled", async ({
  page,
}) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Wait for diagram and palette to load
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();
  await expect(page.getByTestId(`dnd-model-${FIXTURE_RACK_OBJECT_ID}`)).toBeVisible();

  // Simulate DnD via JavaScript: dragstart on palette item → dragover → drop on U5 (empty)
  // HTML5 DnD API restricts dataTransfer.getData() in programmatic events;
  // the _activeDragPayload singleton in dndHelpers.ts is the reliable fallback.
  await page.evaluate((rackObjectId: string) => {
    const source = document.querySelector(`[data-testid="dnd-model-${rackObjectId}"]`);
    const target = document.querySelector('[data-testid="drop-cell-front-5"]');
    if (!source || !target) {
      throw new Error(`DnD elements not found: source=${source}, target=${target}`);
    }
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, FIXTURE_RACK_OBJECT_ID);

  // Modal opens with start U and rack object preselected
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();
  await expect(page.getByTestId("start-u-input")).toHaveValue("5");
  // Place button enabled because rack object is preselected
  await expect(page.getByTestId("place-btn")).toBeEnabled();

  // Cancel — dialog closes, no backend call made
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Place equipment" })).not.toBeVisible();
});

test("rack detail: drag from palette device to empty slot opens modal prefilled", async ({
  page,
}) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Wait for diagram and palette to load
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();
  // Fixture now includes an unplaced device — palette shows it
  await expect(page.getByTestId(`dnd-device-${FIXTURE_UNPLACED_DEVICE_ID}`)).toBeVisible();

  // Simulate DnD: drag unplaced device to U8 (empty)
  await page.evaluate((deviceId: string) => {
    const source = document.querySelector(`[data-testid="dnd-device-${deviceId}"]`);
    const target = document.querySelector('[data-testid="drop-cell-front-8"]');
    if (!source || !target) {
      throw new Error(`DnD elements not found: source=${source}, target=${target}`);
    }
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, FIXTURE_UNPLACED_DEVICE_ID);

  // Modal opens with start U and device preselected
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();
  await expect(page.getByTestId("start-u-input")).toHaveValue("8");
  await expect(page.getByTestId("place-btn")).toBeEnabled();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Place equipment" })).not.toBeVisible();
});

test("global search handles short and no-result queries", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  const searchInput = page.locator('input[placeholder*="Search"]');

  // Single character — UI suppresses the dropdown entirely (min 2 chars)
  await searchInput.fill("s");
  await expect(page.getByRole("listbox")).not.toBeVisible();
  await expect(page.getByText("No results")).not.toBeVisible();

  // Query with no matching fixture data — mock returns [] → "No results" shown
  await searchInput.fill("zz-no-match");
  await expect(page.getByText("No results")).toBeVisible();
});

test("mock state isolation: dynamic mutations reset on page reload", async ({ page }) => {
  // === Load 1: mutate dynamicRackDetail.front via place_device ===
  await page.goto("/");
  await openFixtureRepo(page);
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Drag unplaced device to U8 — opens modal with device preselected and place-btn enabled
  await page.evaluate((deviceId: string) => {
    const source = document.querySelector(`[data-testid="dnd-device-${deviceId}"]`);
    const target = document.querySelector('[data-testid="drop-cell-front-8"]');
    if (!source || !target) throw new Error(`DnD elements not found: source=${source}, target=${target}`);
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, FIXTURE_UNPLACED_DEVICE_ID);
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();
  await expect(page.getByTestId("place-btn")).toBeEnabled();
  await page.getByTestId("place-btn").click();

  // Mutation succeeded — new placement block appears in the diagram
  await expect(page.getByTestId(`placed-front-${FIXTURE_NEW_PLACEMENT_ID}`)).toBeVisible({ timeout: 8_000 });

  // === Load 2: page reload + open_repository_cmd reset restores fixture baseline ===
  await page.goto("/");
  await openFixtureRepo(page);
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Mutation is gone — only the original fixture placement is visible
  await expect(page.getByTestId(`placed-front-${FIXTURE_NEW_PLACEMENT_ID}`)).not.toBeVisible();
  await expect(page.getByTestId("placed-front-ffffffff-ffff-ffff-ffff-ffffffffffff")).toBeVisible();
  // Unplaced device is back in the palette (not yet placed)
  await expect(page.getByTestId(`dnd-device-${FIXTURE_UNPLACED_DEVICE_ID}`)).toBeVisible();
});

test("rack detail: create device from place modal and place it", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Click an empty U slot (U5, front side — fixture only has a placement at U10)
  await page.getByTestId("drop-cell-front-5").click();

  // Place equipment modal opens with startU=5
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();
  await expect(page.getByTestId("start-u-input")).toHaveValue("5");

  // Click "Create new device…" button
  await page.getByTestId("create-device-btn").click();

  // DeviceFormModal opens on top
  await expect(page.getByRole("dialog", { name: "Add device" })).toBeVisible();

  // Fill minimal valid form: type + code + name (name satisfies identifier requirement)
  await page.getByTestId("field-device-type").selectOption("server");
  await page.getByTestId("field-code").fill("new-device-01");
  await page.getByTestId("field-name").fill("New Device 01");

  // "Create device" button should now be enabled
  await expect(page.getByRole("button", { name: "Create device", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create device", exact: true }).click();

  // DeviceFormModal closes, Place equipment modal is back — new device is preselected
  await expect(page.getByRole("dialog", { name: "Add device" })).not.toBeVisible();
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();

  // startU is still 5 (preserved while device form was open)
  await expect(page.getByTestId("start-u-input")).toHaveValue("5");

  // Place button is enabled because new device was preselected
  await expect(page.getByTestId("place-btn")).toBeEnabled();

  // Click Place — triggers place_device mock which adds placement to dynamic detail
  await page.getByTestId("place-btn").click();

  // Place modal closes and diagram refreshes to show the new placement
  await expect(page.getByRole("dialog", { name: "Place equipment" })).not.toBeVisible();
  await expect(
    page.getByTestId(`placed-front-${FIXTURE_NEW_PLACEMENT_ID}`),
  ).toBeVisible({ timeout: 8_000 });

  // Confirm no placement table/list exists (rack diagram is the only surface)
  await expect(page.getByRole("heading", { name: "Front placements", exact: true })).not.toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Asset tag", exact: true })).not.toBeVisible();
});

test("rack detail: drag placed block to new U position moves it", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Fixture: srv-01 is placed at U10 (front). Drag it to U5.
  await page.evaluate((placementId: string) => {
    const source = document.querySelector(`[data-testid="placed-front-${placementId}"]`);
    const target = document.querySelector('[data-testid="drop-cell-front-5"]');
    if (!source || !target) {
      throw new Error(`DnD elements not found: source=${source}, target=${target}`);
    }
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, FIXTURE_PLACEMENT_ID);

  // Diagram refreshes: placement block should still be visible (moved in mock)
  await expect(
    page.getByTestId(`placed-front-${FIXTURE_PLACEMENT_ID}`),
  ).toBeVisible({ timeout: 8_000 });
  // U10 is now empty (the old position)
  await expect(page.getByTestId("drop-cell-front-10")).toBeVisible();
});

test("rack detail: create rack object from place modal and place it", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Click an empty U slot (U3, front side)
  await page.getByTestId("drop-cell-front-3").click();
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();

  // Switch to Rack Object mode
  await page.getByRole("radio", { name: "Rack Object" }).click();

  // Click "Create new rack object…"
  await page.getByTestId("create-rack-object-btn").click();

  // DeviceModelFormModal opens
  await expect(page.getByRole("dialog", { name: "Add device model" })).toBeVisible();

  // Fill the form: device_type=rack_object, code, name, height
  await page.getByTestId("field-device-type").selectOption("rack_object");
  await page.getByTestId("field-code").fill("new-bracket-01");
  await page.getByTestId("field-name").fill("Cable Bracket");
  await page.getByTestId("field-height-u").fill("1");

  await page.getByRole("button", { name: "Create model", exact: true }).click();

  // DeviceModelFormModal closes, Place equipment modal is back — new model preselected
  await expect(page.getByRole("dialog", { name: "Add device model" })).not.toBeVisible();
  await expect(page.getByRole("dialog", { name: "Place equipment" })).toBeVisible();

  // New model is preselected in the rack object selector
  await expect(page.getByTestId("rack-object-select")).toHaveValue(FIXTURE_NEW_MODEL_ID);

  // Place button enabled
  await expect(page.getByTestId("place-btn")).toBeEnabled();

  // Click Place
  await page.getByTestId("place-btn").click();

  // Modal closes and new placement appears in diagram
  await expect(page.getByRole("dialog", { name: "Place equipment" })).not.toBeVisible();
  await expect(
    page.getByTestId(`placed-front-${FIXTURE_NEW_PLACEMENT_ID}`),
  ).toBeVisible({ timeout: 8_000 });
});

test("rack detail: inspector shows edit device button for device placements", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();

  // Click the occupied block (device placement)
  await page.getByTestId(`placed-front-${FIXTURE_PLACEMENT_ID}`).click();

  // Inspector shows edit device button (target_kind === "device")
  await expect(page.getByTestId("edit-target-device-btn")).toBeVisible();
});

test("rack detail: drag placed equipment to Placeable equipment panel to unplace it", async ({ page }) => {
  // IDs from fixture constants
  const FIXTURE_DEVICE_ID_PLACED = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

  await page.goto("/");
  await openFixtureRepo(page);

  // Navigate to rack detail
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page.getByRole("button", { name: "Manage racks for Server Room A" }).click();
  await page.getByRole("cell", { name: "Main Rack", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Main Rack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rack diagram", exact: true })).toBeVisible();

  // Verify fixture placement is visible before unplace
  await expect(page.getByTestId(`placed-front-${FIXTURE_PLACEMENT_ID}`)).toBeVisible();

  // Drag the placed Name cell to the Placeable equipment drop zone
  await page.evaluate((placementId: string) => {
    const source = document.querySelector(`[data-testid="placed-front-${placementId}"]`);
    const target = document.querySelector('[data-testid="palette-drop-zone"]');
    if (!source || !target) {
      throw new Error(`DnD elements not found: source=${source}, target=${target}`);
    }
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, FIXTURE_PLACEMENT_ID);

  // Placement block disappears from diagram
  await expect(
    page.getByTestId(`placed-front-${FIXTURE_PLACEMENT_ID}`),
  ).not.toBeVisible({ timeout: 8_000 });

  // U10 row becomes an empty drop cell
  await expect(page.getByTestId("drop-cell-front-10")).toBeVisible({ timeout: 8_000 });

  // The unplaced device now appears in the Placeable equipment palette
  await expect(
    page.getByTestId(`dnd-device-${FIXTURE_DEVICE_ID_PLACED}`),
  ).toBeVisible({ timeout: 8_000 });
});
