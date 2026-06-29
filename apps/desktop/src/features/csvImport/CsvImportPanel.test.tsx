// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CsvImportPanel } from "./CsvImportPanel";

// ── module mocks ──────────────────────────────────────────────────────────────

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

// Make runBusy transparent — just call the supplied callback.
vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    runBusy: (_msg: string, fn: () => Promise<unknown>) => fn(),
  }),
}));

// ── named mock references ─────────────────────────────────────────────────────

import {
  saveSampleCsv,
  saveDeviceModelSampleCsv,
} from "./csvSample";
import {
  importDeviceCsv,
  importDeviceModelCsv,
  previewDeviceCsvImport,
  previewDeviceModelCsvImport,
} from "../../api/tauriClient";

const mockSave           = vi.mocked(saveSampleCsv);
const mockSaveModel      = vi.mocked(saveDeviceModelSampleCsv);
const mockPreviewDevice  = vi.mocked(previewDeviceCsvImport);
const mockImportDevice   = vi.mocked(importDeviceCsv);
const mockPreviewModel   = vi.mocked(previewDeviceModelCsvImport);
const mockImportModel    = vi.mocked(importDeviceModelCsv);

// ── fixture helpers ───────────────────────────────────────────────────────────

const VALID_DEVICE_PREVIEW = {
  summary: { total_rows: 1, valid_rows: 1, error_rows: 0, warning_rows: 0 },
  file_issues: [],
  rows: [
    {
      row_number: 2,
      device_type: "server",
      name: "Test Server",
      device_model_code: null,
      serial_number: null,
      asset_tag: null,
      status: "in_stock",
      action: "create" as const,
      issues: [],
    },
  ],
};

const VALID_MODEL_PREVIEW = {
  summary: { total_rows: 2, valid_rows: 2, error_rows: 0, warning_rows: 0 },
  file_issues: [],
  rows: [
    {
      row_number: 2,
      device_type: "server",
      name: "Model A",
      code: null,
      vendor: null,
      model_number: null,
      height_u: null,
      action: "create" as const,
      issues: [],
    },
    {
      row_number: 3,
      device_type: "network",
      name: "Model B",
      code: null,
      vendor: null,
      model_number: null,
      height_u: null,
      action: "create" as const,
      issues: [],
    },
  ],
};

const ERROR_DEVICE_PREVIEW = {
  summary: { total_rows: 1, valid_rows: 0, error_rows: 1, warning_rows: 0 },
  file_issues: [],
  rows: [
    {
      row_number: 2,
      device_type: null,
      name: "Bad Row",
      device_model_code: null,
      serial_number: null,
      asset_tag: null,
      status: null,
      action: "skip_due_to_error" as const,
      issues: [{ code: "VAL-CSV-010", level: "error", message: "Missing type", details: null }],
    },
  ],
};

// ── lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = "";
  mockSave.mockResolvedValue("saved");
  mockSaveModel.mockResolvedValue("saved");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── type selector ─────────────────────────────────────────────────────────────

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
      expect(screen.getByText("device_type")).toBeTruthy();
      expect(screen.getByText("name")).toBeTruthy();
    });
  });
});

// ── download sample CSV ───────────────────────────────────────────────────────

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

// ── Devices import success ────────────────────────────────────────────────────

describe("CsvImportPanel — Devices import success banner", () => {
  it("shows success banner after importing devices and does not clear it", async () => {
    mockPreviewDevice.mockResolvedValue(VALID_DEVICE_PREVIEW);
    mockImportDevice.mockResolvedValue({ created_count: 1, warning_count: 0 });
    const onMutated = vi.fn();

    render(<CsvImportPanel onRepositoryMutated={onMutated} />);

    // Paste CSV content
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,status,name\nserver,in_stock,Test Server\n" } });

    // Preview
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => {
      expect(mockPreviewDevice).toHaveBeenCalledOnce();
    });

    // Import
    const importBtn = screen.getByRole("button", { name: /Import 1 row/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(mockImportDevice).toHaveBeenCalledOnce();
    });
    expect(onMutated).toHaveBeenCalledOnce();

    // Success banner must be visible and stay visible
    await waitFor(() => {
      expect(screen.getByText(/Import complete: 1 device created/i)).toBeTruthy();
    });
  });

  it("shows singular 'device' for created_count=1", async () => {
    mockPreviewDevice.mockResolvedValue(VALID_DEVICE_PREVIEW);
    mockImportDevice.mockResolvedValue({ created_count: 1, warning_count: 0 });

    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,status,name\nserver,in_stock,Test\n" } });
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(mockPreviewDevice).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Import 1 row/i }));
    await waitFor(() => {
      expect(screen.getByText(/Import complete: 1 device created/i)).toBeTruthy();
    });
    expect(screen.queryByText(/1 devices created/i)).toBeNull();
  });

  it("blocks import when device preview has errors", async () => {
    mockPreviewDevice.mockResolvedValue(ERROR_DEVICE_PREVIEW);

    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,status,name\n,in_stock,Bad\n" } });
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(mockPreviewDevice).toHaveBeenCalledOnce());

    // Import button should be disabled
    const importBtn = screen.getByRole("button", { name: /Import 0 rows/i });
    expect(importBtn).toBeTruthy();
    expect((importBtn as HTMLButtonElement).disabled).toBe(true);
    expect(mockImportDevice).not.toHaveBeenCalled();
  });
});

// ── Device Models import success ──────────────────────────────────────────────

describe("CsvImportPanel — Device Models import success banner", () => {
  it("shows success banner after importing device models and does not clear it", async () => {
    mockPreviewModel.mockResolvedValue(VALID_MODEL_PREVIEW);
    mockImportModel.mockResolvedValue({ created_count: 2, warning_count: 0 });
    const onMutated = vi.fn();

    render(<CsvImportPanel onRepositoryMutated={onMutated} />);

    // Switch to Device Models
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(true);
    });

    // Paste CSV
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,name\nserver,Model A\nnetwork,Model B\n" } });

    // Preview
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => {
      expect(mockPreviewModel).toHaveBeenCalledOnce();
    });

    // Import
    const importBtn = screen.getByRole("button", { name: /Import 2 rows/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(mockImportModel).toHaveBeenCalledOnce();
    });
    expect(onMutated).toHaveBeenCalledOnce();

    // Success banner must be visible and stay visible
    await waitFor(() => {
      expect(screen.getByText(/Import complete: 2 device models created/i)).toBeTruthy();
    });
  });

  it("shows singular 'device model' for created_count=1", async () => {
    const singleRowPreview = {
      ...VALID_MODEL_PREVIEW,
      summary: { ...VALID_MODEL_PREVIEW.summary, total_rows: 1, valid_rows: 1 },
      rows: [VALID_MODEL_PREVIEW.rows[0]],
    };
    mockPreviewModel.mockResolvedValue(singleRowPreview);
    mockImportModel.mockResolvedValue({ created_count: 1, warning_count: 0 });

    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(true);
    });
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,name\nserver,Model A\n" } });
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(mockPreviewModel).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Import 1 row/i }));
    await waitFor(() => {
      expect(screen.getByText(/Import complete: 1 device model created/i)).toBeTruthy();
    });
    expect(screen.queryByText(/1 device models created/i)).toBeNull();
  });

  it("success banner stays visible after import clears preview", async () => {
    mockPreviewModel.mockResolvedValue(VALID_MODEL_PREVIEW);
    mockImportModel.mockResolvedValue({ created_count: 2, warning_count: 0 });

    render(<CsvImportPanel onRepositoryMutated={vi.fn()} />);
    fireEvent.click(screen.getByTestId("import-type-device-models"));
    await waitFor(() => {
      expect(screen.getByTestId("import-type-device-models").classList.contains("btn-primary")).toBe(true);
    });
    const textarea = screen.getByTestId("csv-textarea");
    fireEvent.change(textarea, { target: { value: "device_type,name\nserver,A\nnetwork,B\n" } });
    fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(mockPreviewModel).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Import 2 rows/i }));
    await waitFor(() => {
      expect(mockImportModel).toHaveBeenCalledOnce();
    });

    // Preview panel should be gone (import clears preview + csv)
    expect(screen.queryByText(/2 rows/i)).toBeNull();

    // But success banner must remain
    expect(screen.getByText(/Import complete: 2 device models created/i)).toBeTruthy();
  });
});
