// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SAMPLE_CSV_FILENAME,
  SAMPLE_CSV_CONTENT,
  escapeCsvField,
  saveSampleCsv,
} from "./csvSample";

// ── filename ──────────────────────────────────────────────────────────────────

describe("SAMPLE_CSV_FILENAME", () => {
  it("ends with .csv", () => {
    expect(SAMPLE_CSV_FILENAME.endsWith(".csv")).toBe(true);
  });

  it("is a non-empty string", () => {
    expect(SAMPLE_CSV_FILENAME.length).toBeGreaterThan(0);
  });

  it("uses the canonical product filename", () => {
    expect(SAMPLE_CSV_FILENAME).toBe(
      "rack-inventory-studio-device-import-sample.csv",
    );
  });
});

// ── content ───────────────────────────────────────────────────────────────────

const EXPECTED_HEADERS = [
  "code",
  "device_type",
  "name",
  "device_model_code",
  "serial_number",
  "asset_tag",
  "external_ref",
  "status",
  "tags",
];

describe("SAMPLE_CSV_CONTENT", () => {
  const lines = SAMPLE_CSV_CONTENT.split("\n").filter((l) => l.trim() !== "");

  it("starts with the expected header row", () => {
    expect(lines[0]).toBe(EXPECTED_HEADERS.join(","));
  });

  it("header row contains all importer-supported columns", () => {
    const headers = lines[0].split(",");
    for (const col of EXPECTED_HEADERS) {
      expect(headers).toContain(col);
    }
  });

  it("contains at least 2 data rows after the header", () => {
    expect(lines.length - 1).toBeGreaterThanOrEqual(2);
  });

  it("ends with a newline (LF line ending)", () => {
    expect(SAMPLE_CSV_CONTENT.endsWith("\n")).toBe(true);
  });

  it("all data rows have the correct number of columns", () => {
    // Quick check: each non-empty row should have 8 commas (9 fields)
    for (const line of lines.slice(1)) {
      // Count top-level commas (not inside quotes)
      let commas = 0;
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === "," && !inQuotes) commas++;
      }
      expect(commas).toBe(8);
    }
  });

  it("data rows use valid device types (not rack_object)", () => {
    const validTypes = new Set(["server", "network", "storage", "ups", "appliance", "other"]);
    for (const line of lines.slice(1)) {
      const deviceType = line.split(",")[1];
      expect(validTypes.has(deviceType)).toBe(true);
    }
  });

  it("data rows use valid status values", () => {
    const validStatuses = new Set([
      "planned", "in_stock", "installed", "to_remove", "removed", "disposed", "unknown",
    ]);
    for (const line of lines.slice(1)) {
      const status = line.split(",")[7];
      expect(validStatuses.has(status)).toBe(true);
    }
  });
});

// ── escapeCsvField ────────────────────────────────────────────────────────────

describe("escapeCsvField", () => {
  it("returns plain value unchanged when no special chars", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("wraps in double-quotes when value contains a comma", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("wraps in double-quotes and doubles internal double-quotes", () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it("wraps in double-quotes when value contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in double-quotes when value contains a carriage return", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("handles empty string without wrapping", () => {
    expect(escapeCsvField("")).toBe("");
  });
});

// ── saveSampleCsv ─────────────────────────────────────────────────────────────

const mockSaveSampleCsvViaDialog = vi.fn();

vi.mock("../../api/tauriClient", () => ({
  saveSampleCsvViaDialog: (...args: unknown[]) => mockSaveSampleCsvViaDialog(...args),
}));

describe("saveSampleCsv", () => {
  beforeEach(() => {
    mockSaveSampleCsvViaDialog.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls saveSampleCsvViaDialog with the canonical filename only (no content arg)", async () => {
    mockSaveSampleCsvViaDialog.mockResolvedValue("saved");
    await saveSampleCsv();
    expect(mockSaveSampleCsvViaDialog).toHaveBeenCalledOnce();
    const [filename, ...rest] = mockSaveSampleCsvViaDialog.mock.calls[0] as unknown[];
    expect(filename).toBe(SAMPLE_CSV_FILENAME);
    // Backend owns the content — no second argument should be passed
    expect(rest.length).toBe(0);
  });

  it("returns 'saved' when the dialog resolves with 'saved'", async () => {
    mockSaveSampleCsvViaDialog.mockResolvedValue("saved");
    const result = await saveSampleCsv();
    expect(result).toBe("saved");
  });

  it("returns 'cancelled' when user dismisses the dialog", async () => {
    mockSaveSampleCsvViaDialog.mockResolvedValue("cancelled");
    const result = await saveSampleCsv();
    expect(result).toBe("cancelled");
  });

  it("propagates write errors thrown by the backend command", async () => {
    mockSaveSampleCsvViaDialog.mockRejectedValue(new Error("disk full"));
    await expect(saveSampleCsv()).rejects.toThrow("disk full");
  });
});
