import { test as base, expect, type Page } from "@playwright/test";

const CSV_SNIPPET = "code,device_type,status,name\nCSV-DEV-001,server,planned,CSV Device 001";

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

  await expect(
    page.getByText("Rack Inventory Studio", { exact: true }),
  ).toBeVisible();
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

test("open repository enables all tabs", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  const tabNames = [
    "Repository",
    "Validation",
    "Locations",
    "Racks",
    "Devices",
    "Device Models",
    "CSV Import",
  ];
  for (const name of tabNames) {
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  }
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

  // Click Validate to trigger the mock call
  await page.getByRole("button", { name: "Validate", exact: true }).click();
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

test("rack detail and placement table visible", async ({ page }) => {
  await page.goto("/");
  await openFixtureRepo(page);

  await page.getByRole("button", { name: "Racks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Racks" })).toBeVisible();
  await expect(page.getByText("rack-main")).toBeVisible();

  // Click the rack row to open detail
  await page.getByRole("cell", { name: "Main Rack" }).click();
  await expect(
    page.getByRole("heading", { name: /Main Rack/i }),
  ).toBeVisible();
  // Placement table contains the fixture placement
  await expect(page.getByText("plc-srv-01")).toBeVisible();
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
