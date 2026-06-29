// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CsvImportPanel } from "./CsvImportPanel";

vi.mock("../../api/tauriClient", () => ({
  importDeviceCsv: vi.fn(),
  importDeviceModelCsv: vi.fn(),
  previewDeviceCsvImport: vi.fn(),
  previewDeviceModelCsvImport: vi.fn(),
  readCsvFile: vi.fn(),
  selectCsvFile: vi.fn(),
}));

vi.mock("./csvSample", () => ({
  SAMPLE_CSV_FILENAME: "rack-inventory-studio-device-import-sample.csv",
  DEVICE_MODEL_SAMPLE_CSV_FILENAME: "rack-inventory-studio-device-model-import-sample.csv",
  SAMPLE_CSV_CONTENT: "code,device_type,status\nsrv-demo-01,server,in_stock\n",
  DEVICE_MODEL_SAMPLE_CSV_CONTENT: "device_type,name\nserver,Demo Model\n",
  escapeCsvField: vi.fn((v: string) => v),
  saveSampleCsv: vi.fn(),
  saveDeviceModelSampleCsv: vi.fn(),
}));

import { saveSampleCsv, saveDeviceModelSampleCsv } from "./csvSample";

const mockSave = vi.mocked(saveSampleCsv);
const mockSaveModel = vi.mocked(saveDeviceModelSampleCsv);

beforeEach(() => {
  document.body.innerHTML = "";
  mockSave.mockResolvedValue("saved");
  mockSaveModel.mockResolvedValue("saved");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CsvImportPanel — type selector", () => {
  it("renders Devices and Device Models type buttons", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(screen.getByTestId("import-type-devices")).toBeTruthy();
    expect(screen.getByTestId("import-type-device-models")).toBeTruthy();
  });

  it("defaults to Devices type", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(screen.getByTestId("import-type-devices").classList.contains("btn-primary")).toBe(true);
    expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(false);
  });

  it("switches to Device Models type on click", async () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(true);
    });
  });

  it("shows device model schema when Device Models type is selected", async () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      // Device Models required columns are device_type and name
      expect(screen.getByText("device_type")).toBeTruthy();
      expect(screen.getByText("name")).toBeTruthy();
    });
  });
});

describe("CsvImportPanel — download sample CSV", () => {
  it("renders the Download sample CSV button", () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    expect(screen.getByTestId("btn-download-sample")).toBeTruthy();
    expect(screen.getByText("Download sample CSV")).toBeTruthy();
  });

  it("calls saveSampleCsv when button is clicked (Devices type)", async () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledOnce();
    });
    expect(mockSaveModel).not.toHaveBeenCalled();
  });

  it("calls saveDeviceModelSampleCsv when in Device Models type", async () => {
    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(true);
    });
    fireEvent.click(screen.getByTestId("btn-download-sample"));
    await waitFor(() => {
      expect(mockSaveModel).toHaveBeenCalledOnce();
    });
    expect(mockSave).not.toHaveBeenCalled();
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
