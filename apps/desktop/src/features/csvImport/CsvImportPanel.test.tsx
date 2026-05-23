import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CsvImportPanel } from "./CsvImportPanel";

vi.mock("../../api/tauriClient", () => ({
  importDeviceCsv: vi.fn(),
  previewDeviceCsvImport: vi.fn(),
  readCsvFile: vi.fn(),
  selectCsvFile: vi.fn(),
}));

vi.mock("./csvSample", () => ({
  SAMPLE_CSV_FILENAME: "rack-inventory-device-import-sample.csv",
  SAMPLE_CSV_CONTENT: "code,device_type,status\nsrv-demo-01,server,in_stock\n",
  escapeCsvField: vi.fn((v: string) => v),
  downloadSampleCsv: vi.fn(),
}));

import { downloadSampleCsv } from "./csvSample";

const mockDownload = vi.mocked(downloadSampleCsv);

beforeEach(() => {
  document.body.innerHTML = "";
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

  it("calls downloadSampleCsv when button is clicked", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    expect(mockDownload).toHaveBeenCalledOnce();
  });

  it("shows help text near the download button", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(
      screen.getByText(/Use this template as a starting point/i),
    ).toBeTruthy();
  });
});
