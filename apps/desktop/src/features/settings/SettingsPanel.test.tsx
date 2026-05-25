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

  it("Reset to default: calls resetLogsDirectory and hides Reset button", async () => {
    // Set up initial state with custom dir so Reset button is visible
    mockGetLogSettings.mockResolvedValue({
      ...DEFAULT_LOG_SETTINGS,
      custom_log_dir: "/tmp/custom-logs",
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
    // After reset, custom_log_dir is null so Reset button should not be visible
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Reset to default" }),
      ).toBeNull();
    });
  });
});
