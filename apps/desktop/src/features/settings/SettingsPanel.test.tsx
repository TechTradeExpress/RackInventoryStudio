// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel";

// ── Mock tauriClient ──────────────────────────────────────────────────────────

const mockGetLogSettings = vi.fn();
const mockOpenLogsDirectory = vi.fn();
const mockSetLogsDirectory = vi.fn();
const mockResetLogsDirectory = vi.fn();
const mockSelectDirectory = vi.fn();

vi.mock("../../api/tauriClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/tauriClient")>();
  return {
    ...actual,
    getLogSettings: (...args: unknown[]) => mockGetLogSettings(...args),
    openLogsDirectory: (...args: unknown[]) => mockOpenLogsDirectory(...args),
    setLogsDirectory: (...args: unknown[]) => mockSetLogsDirectory(...args),
    resetLogsDirectory: (...args: unknown[]) => mockResetLogsDirectory(...args),
    selectDirectory: (...args: unknown[]) => mockSelectDirectory(...args),
  };
});

const DEFAULT_LOG_SETTINGS = {
  default_log_dir: "/home/user/.local/share/com.test/logs",
  active_log_dir: "/home/user/.local/share/com.test/logs",
  custom_log_dir: null,
  restart_required: false,
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLogSettings.mockResolvedValue(DEFAULT_LOG_SETTINGS);
  mockOpenLogsDirectory.mockResolvedValue(undefined);
  mockSetLogsDirectory.mockResolvedValue({
    ...DEFAULT_LOG_SETTINGS,
    custom_log_dir: "/tmp/custom-logs",
    restart_required: true,
  });
  mockResetLogsDirectory.mockResolvedValue(DEFAULT_LOG_SETTINGS);
  mockSelectDirectory.mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SettingsPanel", () => {
  it("renders Diagnostics and logs section", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Diagnostics and logs" }),
      ).toBeTruthy();
    });
  });

  it("renders Open logs folder button", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open logs folder" }),
      ).toBeTruthy();
    });
  });

  it("renders Choose logs folder button", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Choose logs folder…" }),
      ).toBeTruthy();
    });
  });

  it("Open logs folder calls openLogsDirectory command", async () => {
    render(<SettingsPanel />);
    const btn = await screen.findByRole("button", { name: "Open logs folder" });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockOpenLogsDirectory).toHaveBeenCalledTimes(1);
    });
  });

  it("Choose logs folder: cancel is silent (no banner shown)", async () => {
    mockSelectDirectory.mockResolvedValue(null); // user cancelled
    render(<SettingsPanel />);
    const btn = await screen.findByRole("button", {
      name: "Choose logs folder…",
    });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockSelectDirectory).toHaveBeenCalledTimes(1);
    });
    // No success banner should be shown
    expect(
      screen.queryByText(/Changes will apply after restarting/),
    ).toBeNull();
    expect(mockSetLogsDirectory).not.toHaveBeenCalled();
  });

  it("Choose logs folder: success shows banner", async () => {
    mockSelectDirectory.mockResolvedValue("/tmp/custom-logs");
    render(<SettingsPanel />);
    const btn = await screen.findByRole("button", {
      name: "Choose logs folder…",
    });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(
        screen.getByText(/Changes will apply after restarting the app/),
      ).toBeTruthy();
    });
    expect(mockSetLogsDirectory).toHaveBeenCalledWith("/tmp/custom-logs");
  });

  it("Reset to default: calls resetLogsDirectory, hides Reset button, shows restart notice when needed", async () => {
    // Start with custom dir set and process still using old custom dir (restart_required: true)
    mockGetLogSettings.mockResolvedValue({
      ...DEFAULT_LOG_SETTINGS,
      custom_log_dir: "/tmp/custom-logs",
      restart_required: true,
    });
    // reset returns restart_required: true (process still uses old dir until restart)
    mockResetLogsDirectory.mockResolvedValue({
      ...DEFAULT_LOG_SETTINGS,
      custom_log_dir: null,
      restart_required: true,
    });
    render(<SettingsPanel />);

    const resetBtn = await screen.findByRole("button", {
      name: "Reset to default",
    });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(mockResetLogsDirectory).toHaveBeenCalledTimes(1);
    });
    // Reset button hidden (custom_log_dir is null)
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Reset to default" }),
      ).toBeNull();
    });
    // Restart message shown because process still uses the old custom dir
    expect(
      screen.getByText(/Changes will apply after restarting the app/),
    ).toBeTruthy();
  });

  it("Reset to default: shows no restart message when process was already on default", async () => {
    // Custom dir was set in this session but never applied (process always used default)
    mockGetLogSettings.mockResolvedValue({
      ...DEFAULT_LOG_SETTINGS,
      custom_log_dir: "/tmp/custom-logs",
      restart_required: true,
    });
    // reset returns restart_required: false (active dir was already the default)
    mockResetLogsDirectory.mockResolvedValue(DEFAULT_LOG_SETTINGS);
    render(<SettingsPanel />);

    const resetBtn = await screen.findByRole("button", {
      name: "Reset to default",
    });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.getByText(/Log directory reset to default/)).toBeTruthy();
    });
    // No restart notice
    expect(
      screen.queryByText(/Changes will apply after restarting/),
    ).toBeNull();
  });

  it("shows active log directory path from loaded settings", async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      // getAllByText because default and active share the same path in the fixture
      expect(
        screen.getAllByText("/home/user/.local/share/com.test/logs").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("Open logs folder: backend error shows error banner", async () => {
    mockOpenLogsDirectory.mockRejectedValue(new Error("Cannot open folder"));
    render(<SettingsPanel />);
    const btn = await screen.findByRole("button", { name: "Open logs folder" });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/Cannot open folder/)).toBeTruthy();
    });
  });

  it("Choose logs folder: backend error shows error banner", async () => {
    mockSelectDirectory.mockResolvedValue("/tmp/bad-path");
    mockSetLogsDirectory.mockRejectedValue(new Error("Cannot create directory"));
    render(<SettingsPanel />);
    const btn = await screen.findByRole("button", {
      name: "Choose logs folder…",
    });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/Cannot create directory/)).toBeTruthy();
    });
    // No success banner
    expect(
      screen.queryByText(/Changes will apply after restarting/),
    ).toBeNull();
  });

  it("shows custom directory row and restart warning when custom_log_dir is set", async () => {
    mockGetLogSettings.mockResolvedValue({
      ...DEFAULT_LOG_SETTINGS,
      custom_log_dir: "/tmp/custom-logs",
      restart_required: true,
    });
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Custom directory/)).toBeTruthy();
      expect(screen.getByText("/tmp/custom-logs")).toBeTruthy();
      expect(screen.getByText(/Changes will apply after restart/)).toBeTruthy();
    });
  });
});
