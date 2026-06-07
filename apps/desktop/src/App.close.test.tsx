// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { AppBusyProvider } from "./lib/appBusy";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const {
  closeHandlerCapture,
  mockDestroy,
  mockOnCloseRequested,
  mockListen,
  mockOpenRepository,
  mockCloseRepository,
  mockSaveCurrentRepository,
  mockGetRepositorySummary,
} = vi.hoisted(() => {
  const capture: { current: ((event: { preventDefault: () => void }) => Promise<void>) | null } =
    { current: null };
  const mockDestroy = vi.fn().mockResolvedValue(undefined);
  const mockOnCloseRequested = vi.fn().mockImplementation((handler) => {
    capture.current = handler;
    return Promise.resolve(() => {});
  });
  return {
    closeHandlerCapture: capture,
    mockDestroy,
    mockOnCloseRequested,
    mockListen: vi.fn().mockResolvedValue(() => {}),
    mockOpenRepository: vi.fn(),
    mockCloseRepository: vi.fn(),
    mockSaveCurrentRepository: vi.fn(),
    mockGetRepositorySummary: vi.fn().mockResolvedValue({}),
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn().mockReturnValue(true) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    onCloseRequested: mockOnCloseRequested,
    destroy: mockDestroy,
  }),
}));

vi.mock("./api/tauriClient", () => ({
  openRepository: mockOpenRepository,
  closeRepository: mockCloseRepository,
  saveCurrentRepository: mockSaveCurrentRepository,
  getRepositorySummary: mockGetRepositorySummary,
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
  sanitizeErrorForLog: vi.fn((e: unknown) => String(e)),
  sanitizePathForLog: vi.fn((p: unknown) => p),
}));

vi.mock("./features/repository/RepositoryPanel", () => ({
  RepositoryPanel: ({
    onOpenPath,
  }: {
    onOpenPath: (path: string) => void;
    [k: string]: unknown;
  }) => (
    <div data-testid="panel-repository">
      <button data-testid="btn-open-repo" onClick={() => onOpenPath("/repos/test")}>Open repo</button>
    </div>
  ),
}));

vi.mock("./features/validation/ValidationPanel", () => ({ ValidationPanel: () => null }));
vi.mock("./features/locations/LocationsPanel", () => ({
  LocationsPanel: ({ onRepositoryMutated }: { onRepositoryMutated: () => void; [k: string]: unknown }) => (
    <div data-testid="panel-locations">
      <button data-testid="btn-mutate" onClick={onRepositoryMutated}>Mutate</button>
    </div>
  ),
}));
vi.mock("./features/racks/RacksPanel", () => ({ RacksPanel: () => null }));
vi.mock("./features/devices/DevicesPanel", () => ({ DevicesPanel: () => null }));
vi.mock("./features/deviceModels/DeviceModelsPanel", () => ({ DeviceModelsPanel: () => null }));
vi.mock("./features/csvImport/CsvImportPanel", () => ({ CsvImportPanel: () => null }));
vi.mock("./features/settings/SettingsPanel", () => ({ SettingsPanel: () => null }));
vi.mock("./features/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("./features/repository/SshPassphraseModal", () => ({ SshPassphraseModal: () => null }));

import { App } from "./App";

const OPEN_RESULT = {
  summary: {
    repository_code: "test-repo",
    repository_name: "Test Repo",
    repo_path: "/repos/test",
    locations_count: 0,
    racks_count: 0,
    devices_count: 0,
    unplaced_devices_count: 0,
  },
  validation_summary: { errors: 0, warnings: 0 },
};

function renderApp() {
  return render(
    <AppBusyProvider>
      <App />
    </AppBusyProvider>,
  );
}

async function simulateCloseRequest() {
  const event = { preventDefault: vi.fn() };
  await act(async () => {
    await closeHandlerCapture.current!(event);
  });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  closeHandlerCapture.current = null;
  mockOpenRepository.mockResolvedValue(OPEN_RESULT);
  mockCloseRepository.mockResolvedValue(undefined);
  mockSaveCurrentRepository.mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });
  mockGetRepositorySummary.mockResolvedValue(OPEN_RESULT.summary);
  // Re-apply mockImplementation after clearAllMocks
  mockOnCloseRequested.mockImplementation((handler) => {
    closeHandlerCapture.current = handler;
    return Promise.resolve(() => {});
  });
  mockDestroy.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

// ── OS window close: no unsaved changes ──────────────────────────────────────

describe("OS window X button — no unsaved changes", () => {
  it("registers an onCloseRequested handler when in Tauri", async () => {
    renderApp();
    await waitFor(() => expect(mockOnCloseRequested).toHaveBeenCalled());
    expect(closeHandlerCapture.current).toBeTypeOf("function");
  });

  it("always calls preventDefault", async () => {
    renderApp();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    const event = await simulateCloseRequest();

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("calls destroy() immediately when no unsaved changes", async () => {
    renderApp();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    await simulateCloseRequest();

    expect(mockDestroy).toHaveBeenCalled();
  });

  it("does not show the unsaved-changes dialog when clean", async () => {
    renderApp();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    await simulateCloseRequest();

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── OS window close: with unsaved changes ────────────────────────────────────

async function openRepoAndMarkDirty() {
  renderApp();
  await act(async () => {
    fireEvent.click(screen.getByTestId("btn-open-repo"));
  });
  await waitFor(() => expect(mockOpenRepository).toHaveBeenCalled());

  const locNav = screen.getByRole("button", { name: "Locations" });
  fireEvent.click(locNav);
  await waitFor(() => expect(screen.getByTestId("btn-mutate")).toBeTruthy());

  fireEvent.click(screen.getByTestId("btn-mutate"));
  await waitFor(() => expect(screen.getByText(/Unsaved inventory changes/)).toBeTruthy());
}

describe("OS window X button — unsaved changes", () => {
  it("shows the guard dialog and does not destroy immediately", async () => {
    await openRepoAndMarkDirty();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    // Trigger close but don't await — dialog will appear
    act(() => { void closeHandlerCapture.current!({ preventDefault: vi.fn() }); });

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("calls destroy() after 'Continue without saving'", async () => {
    await openRepoAndMarkDirty();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    act(() => { void closeHandlerCapture.current!({ preventDefault: vi.fn() }); });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Continue without saving"));
    });

    await waitFor(() => expect(mockDestroy).toHaveBeenCalled());
  });

  it("does not call destroy() when Cancel is clicked", async () => {
    await openRepoAndMarkDirty();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    act(() => { void closeHandlerCapture.current!({ preventDefault: vi.fn() }); });
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockDestroy).not.toHaveBeenCalled();
  });

  it("re-entrant close is ignored while handler is in flight", async () => {
    renderApp();
    await waitFor(() => expect(closeHandlerCapture.current).toBeTruthy());

    const handler = closeHandlerCapture.current!;
    const event = { preventDefault: vi.fn() };

    // First call initiates close (no unsaved changes path)
    // Second call arrives before destroy() resolves — should be ignored
    let resolveDestroy!: () => void;
    mockDestroy.mockReturnValueOnce(new Promise<void>((res) => { resolveDestroy = res; }));

    const first = act(async () => { await handler(event); });
    // While first is awaiting destroy, fire a second close event
    await act(async () => { await handler(event); });

    resolveDestroy();
    await first;

    // destroy() called exactly once
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
