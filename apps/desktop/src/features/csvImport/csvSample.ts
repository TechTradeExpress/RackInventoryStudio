export const SAMPLE_CSV_FILENAME = "rack-inventory-studio-device-import-sample.csv";
export const DEVICE_MODEL_SAMPLE_CSV_FILENAME = "rack-inventory-studio-device-model-import-sample.csv";

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

// Columns mirror DEVICE_MODEL_KNOWN_COLUMNS in crates/ris-import/src/csv_reader.rs.
// Required: device_type, name
// Optional: code, vendor, model_number, height_u, description, tags
// height_u defaults to 1 when omitted. rack_object IS a valid device_type here.
const DEVICE_MODEL_SAMPLE_ROWS: string[][] = [
  ["device_type", "name", "code", "vendor", "model_number", "height_u", "description", "tags"],
  ["server",      "Demo 1U Server",         "", "Acme", "ACM-SRV-1",   "1", "A one-unit server", "demo"],
  ["network",     "Demo 24-port Switch",    "", "Acme", "ACM-SW-24",   "1", "",                  "access;switch"],
  ["storage",     "Demo Storage Array",     "", "Acme", "ACM-STR-4",   "4", "",                  ""],
  ["rack_object", "Demo 1U Blank Panel",    "", "Acme", "ACM-BLANK-1", "1", "",                  ""],
];

export const DEVICE_MODEL_SAMPLE_CSV_CONTENT: string =
  DEVICE_MODEL_SAMPLE_ROWS.map(csvRow).join("\n") + "\n";

import { saveSampleCsvViaDialog, saveDeviceModelSampleCsvViaDialog } from "../../api/tauriClient";

export async function saveSampleCsv(): Promise<"saved" | "cancelled"> {
  return saveSampleCsvViaDialog(SAMPLE_CSV_FILENAME);
}

export async function saveDeviceModelSampleCsv(): Promise<"saved" | "cancelled"> {
  return saveDeviceModelSampleCsvViaDialog(DEVICE_MODEL_SAMPLE_CSV_FILENAME);
}
