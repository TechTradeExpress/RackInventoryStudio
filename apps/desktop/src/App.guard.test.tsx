// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { AppBusyProvider } from "./lib/appBusy";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const {
  mockListen,
  mockSaveCurrentRepository,
  mockOpenRepository,
  mockCloseRepository,
  mockGetRepositorySummary,
} = vi.hoisted(() => ({
  mockListen: vi.fn().mockResolvedValue(() => {}),
  mockSaveCurrentRepository: vi.fn(),
  mockOpenRepository: vi.fn(),
  mockCloseRepository: vi.fn(),
  mockGetRepositorySummary: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn().mockReturnValue(false) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    onCloseRequested: vi.fn().mockResolvedValue(() => {}),
    destroy: vi.fn().mockResolvedValue(undefined),
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

// RepositoryPanel mock: exposes onClose and onOpenPath callbacks via buttons.
vi.mock("./features/repository/RepositoryPanel", () => ({
  RepositoryPanel: ({
    onClose,
    onOpenPath,
  }: {
    onClose: () => void;
    onOpenPath: (path: string) => void;
    [k: string]: unknown;
  }) => (
    <div data-testid="panel-repository">
      <button data-testid="btn-close-repo" onClick={onClose}>Close repo</button>
      <button data-testid="btn-open-repo" onClick={() => onOpenPath("/repos/test")}>Open repo</button>
    </div>
  ),
}));

vi.mock("./features/validation/ValidationPanel", () => ({ ValidationPanel: () => null }));
// LocationsPanel mock exposes onRepositoryMutated so tests can mark dirty state.
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

beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  mockOpenRepository.mockResolvedValue(OPEN_RESULT);
  mockCloseRepository.mockResolvedValue(undefined);
  mockSaveCurrentRepository.mockResolvedValue({ created: 0, updated: 0, unchanged: 0 });
  mockGetRepositorySummary.mockResolvedValue(OPEN_RESULT.summary);
});
afterEach(() => cleanup());

// ── Helper: open a repo and mark dirty ────────────────────────────────────────

async function openRepoAndMarkDirty() {
  renderApp();

  // Open repository via onOpenPath
  await act(async () => {
    fireEvent.click(screen.getByTestId("btn-open-repo"));
  });
  await waitFor(() => expect(mockOpenRepository).toHaveBeenCalled());

  // Navigate to Locations so the LocationsPanel (with mutate button) is visible
  const locNav = screen.getByRole("button", { name: "Locations" });
  fireEvent.click(locNav);
  await waitFor(() => expect(screen.getByTestId("btn-mutate")).toBeTruthy());

  // Mutate to set dirty
  fireEvent.click(screen.getByTestId("btn-mutate"));
  await waitFor(() => expect(screen.getByText(/Unsaved inventory changes/)).toBeTruthy());
}

// ── Tests: no unsaved changes (guard is transparent) ──────────────────────────

describe("App dirty guard — no unsaved changes", () => {
  it("closes repository without showing dialog when repository is clean", async () => {
    renderApp();
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-open-repo"));
    });
    await waitFor(() => expect(mockOpenRepository).toHaveBeenCalled());

    // Close without mutations — guard should pass silently
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-close-repo"));
    });
    await waitFor(() => expect(mockCloseRepository).toHaveBeenCalled());

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── Tests: dialog appears when dirty ──────────────────────────────────────────

describe("App dirty guard — dialog shown when dirty", () => {
  it("shows the unsaved-changes dialog when closing a dirty repository", async () => {
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByText("Save and continue")).toBeTruthy();
    expect(screen.getByText("Continue without saving")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });
});

// ── Tests: Cancel ─────────────────────────────────────────────────────────────

describe("App dirty guard — Cancel", () => {
  it("cancels close and keeps repository open when Cancel is clicked", async () => {
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockCloseRepository).not.toHaveBeenCalled();
    // Repository panel is still mounted
    expect(screen.getByTestId("panel-repository")).toBeTruthy();
  });
});

// ── Tests: Continue without saving ────────────────────────────────────────────

describe("App dirty guard — Continue without saving", () => {
  it("closes repository without saving when 'Continue without saving' is clicked", async () => {
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Continue without saving"));
    });

    await waitFor(() => expect(mockCloseRepository).toHaveBeenCalled());
    expect(mockSaveCurrentRepository).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── Tests: Save and continue ───────────────────────────────────────────────────

describe("App dirty guard — Save and continue", () => {
  it("saves then closes when 'Save and continue' is clicked", async () => {
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Save and continue"));
    });

    await waitFor(() => expect(mockSaveCurrentRepository).toHaveBeenCalled());
    await waitFor(() => expect(mockCloseRepository).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the dirty flag after successful save", async () => {
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Save and continue"));
    });

    await waitFor(() => expect(mockSaveCurrentRepository).toHaveBeenCalled());
    // unsaved indicator should disappear after save
    await waitFor(() =>
      expect(screen.queryByText(/Unsaved inventory changes/)).toBeNull(),
    );
  });

  it("keeps dialog open and does not close when save fails", async () => {
    mockSaveCurrentRepository.mockRejectedValueOnce(new Error("disk full"));
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Save and continue"));
    });

    await waitFor(() => expect(mockSaveCurrentRepository).toHaveBeenCalled());
    // Dialog stays open, close was NOT called
    expect(mockCloseRepository).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows Saving… on the button while save is in progress", async () => {
    let resolveSave!: () => void;
    mockSaveCurrentRepository.mockReturnValueOnce(
      new Promise<void>((resolve) => { resolveSave = resolve; }),
    );
    await openRepoAndMarkDirty();

    fireEvent.click(screen.getByTestId("btn-close-repo"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    // Start clicking save — don't await yet
    fireEvent.click(screen.getByText("Save and continue"));

    await waitFor(() => expect(screen.getByText("Saving…")).toBeTruthy());

    // Buttons are disabled while saving
    expect((screen.getByText("Cancel") as HTMLButtonElement).disabled).toBe(true);

    // Finish the save
    await act(async () => { resolveSave(); });
    await waitFor(() => expect(mockCloseRepository).toHaveBeenCalled());
  });
});
