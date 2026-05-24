import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CsvImportPanel } from "./CsvImportPanel";

vi.mock("../../api/tauriClient", () => ({
  importDeviceCsv: vi.fn(),
  previewDeviceCsvImport: vi.fn(),
  readCsvFile: vi.fn(),
  selectCsvFile: vi.fn(),
}));

vi.mock("./csvSample", () => ({
  SAMPLE_CSV_FILENAME: "rack-inventory-studio-device-import-sample.csv",
  SAMPLE_CSV_CONTENT: "code,device_type,status\nsrv-demo-01,server,in_stock\n",
  escapeCsvField: vi.fn((v: string) => v),
  saveSampleCsv: vi.fn(),
}));

import { saveSampleCsv } from "./csvSample";

const mockSave = vi.mocked(saveSampleCsv);

beforeEach(() => {
  document.body.innerHTML = "";
  mockSave.mockResolvedValue("saved");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CsvImportPanel — download sample CSV", () => {
  it("renders the Download sample CSV button", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(screen.getByTestId("btn-download-sample")).toBeTruthy();
    expect(screen.getByText("Download sample CSV")).toBeTruthy();
  });

  it("calls saveSampleCsv when button is clicked", async () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledOnce();
    });
  });

  it("shows success message after successful save", async () => {
    mockSave.mockResolvedValue("saved");
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(screen.getByText(/Sample CSV saved/i)).toBeTruthy();
    });
  });

  it("shows no message when user cancels the dialog", async () => {
    mockSave.mockResolvedValue("cancelled");
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText(/Sample CSV saved/i)).toBeNull();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it("shows error message when save fails", async () => {
    mockSave.mockRejectedValue(new Error("disk full"));
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(screen.getByText(/disk full/i)).toBeTruthy();
    });
  });

  it("shows help text near the download button", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(
      screen.getByText(/Use this template as a starting point/i),
    ).toBeTruthy();
  });
});
