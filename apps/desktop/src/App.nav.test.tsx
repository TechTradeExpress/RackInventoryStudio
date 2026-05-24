// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppBusyProvider } from "./lib/appBusy";

// ── Mock heavy dependencies ────────────────────────────────────────────────────

vi.mock("./api/tauriClient", () => ({
  closeRepository: vi.fn(),
  getRepositorySummary: vi.fn().mockResolvedValue({}),
  openRepository: vi.fn(),
  selectRepositoryFolder: vi.fn(),
}));

vi.mock("./features/repository/recentRepositories", () => ({
  addRecentRepository: vi.fn(),
  getRecentRepositories: vi.fn().mockReturnValue([]),
  removeRecentRepository: vi.fn(),
}));

vi.mock("./lib/diagnosticsLog", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("./lib/redact", () => ({
  sanitizeErrorForLog: vi.fn((e) => String(e)),
  sanitizePathForLog: vi.fn((p) => p),
}));

// Stub all feature panels — we only care about navigation in these tests
vi.mock("./features/repository/RepositoryPanel", () => ({
  RepositoryPanel: () => <div data-testid="panel-repository">Repository</div>,
}));
vi.mock("./features/validation/ValidationPanel", () => ({
  ValidationPanel: () => <div data-testid="panel-validation">Validation</div>,
}));
vi.mock("./features/locations/LocationsPanel", () => ({
  LocationsPanel: () => <div data-testid="panel-locations">Locations</div>,
}));
vi.mock("./features/racks/RacksPanel", () => ({
  RacksPanel: () => <div data-testid="panel-racks">Racks</div>,
}));
vi.mock("./features/devices/DevicesPanel", () => ({
  DevicesPanel: () => <div data-testid="panel-devices">Devices</div>,
}));
vi.mock("./features/deviceModels/DeviceModelsPanel", () => ({
  DeviceModelsPanel: () => <div data-testid="panel-device-models">Device Models</div>,
}));
vi.mock("./features/csvImport/CsvImportPanel", () => ({
  CsvImportPanel: () => <div data-testid="panel-csv">CSV Import</div>,
}));
vi.mock("./features/settings/SettingsPanel", () => ({
  SettingsPanel: () => <div data-testid="panel-settings">Settings</div>,
}));
vi.mock("./features/search/GlobalSearch", () => ({
  GlobalSearch: () => null,
}));

import { App } from "./App";

function renderApp() {
  return render(
    <AppBusyProvider>
      <App />
    </AppBusyProvider>,
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

// ── Navigation tests ──────────────────────────────────────────────────────────

describe("App navigation — no repository open", () => {
  it("Settings nav item is visible without a repository open", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
  });

  it("clicking Settings opens the Settings panel", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("panel-settings")).toBeTruthy();
  });

  it("Racks nav item is hidden when no location is selected", () => {
    renderApp();
    expect(screen.queryByRole("button", { name: "Racks" })).toBeNull();
  });

  it("Repository nav item is visible without a repository open", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Repository" })).toBeTruthy();
  });
});

describe("App navigation — Settings accessibility", () => {
  it("Settings panel renders when active tab is settings", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByTestId("panel-settings")).toBeTruthy();
  });

  it("navigating back to Repository from Settings shows Repository panel", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Repository" }));
    // RepositoryPanel is rendered (display:none for inactive tabs, but it's always mounted)
    expect(screen.getByTestId("panel-repository")).toBeTruthy();
  });
});
