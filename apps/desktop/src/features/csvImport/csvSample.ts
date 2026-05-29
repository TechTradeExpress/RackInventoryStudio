export const SAMPLE_CSV_FILENAME = "rack-inventory-studio-device-import-sample.csv";

/**
 * Wraps a CSV field value in double-quotes if it contains a comma, double-quote,
 * or newline. Doubles any internal double-quotes per RFC 4180.
 */
export function escapeCsvField(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

// Columns mirror KNOWN_COLUMNS / REQUIRED_COLUMNS in crates/ris-import/src/csv_reader.rs.
// Required: device_type, status
// Optional: name, device_model_code, serial_number, asset_tag, external_ref, tags
// Codes are auto-generated; a "code" column is not supported and will trigger a warning.
// Tags use ";" as separator. rack_object is not a valid device_type for CSV import.
const SAMPLE_ROWS: string[][] = [
  ["device_type", "name", "device_model_code", "serial_number", "asset_tag", "external_ref", "status", "tags"],
  ["server",  "Demo Server 1",       "", "SN-DEMO-001", "ASSET-DEMO-001", "REF-DEMO-001", "in_stock", "production"],
  ["server",  "Demo Server 2",       "", "SN-DEMO-002", "",              "",             "planned",  "staging"],
  ["network", "Demo Switch 1",       "", "",            "",              "",             "in_stock", "access;switch"],
  ["other",   "Demo Other Device",   "", "",            "",              "",             "unknown",  ""],
];

export const SAMPLE_CSV_CONTENT: string =
  SAMPLE_ROWS.map(csvRow).join("\n") + "\n";

import { saveSampleCsvViaDialog } from "../../api/tauriClient";

/**
 * Open a native save-file dialog and write the built-in sample CSV to the chosen path.
 * Returns `"saved"` when written, `"cancelled"` if the user dismissed the dialog.
 * Throws a string on write failure.
 *
 * Uses the Tauri save dialog + a narrow backend command that writes only the fixed
 * sample CSV content. The browser Blob download API does not work in the Tauri runtime.
 */
export async function saveSampleCsv(): Promise<"saved" | "cancelled"> {
  return saveSampleCsvViaDialog(SAMPLE_CSV_FILENAME);
}
