export const SAMPLE_CSV_FILENAME = "rack-inventory-device-import-sample.csv";

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
// Required: code, device_type, status
// Optional: name, device_model_code, serial_number, asset_tag, external_ref, tags
// Tags use ";" as separator. rack_object is not a valid device_type for CSV import.
const SAMPLE_ROWS: string[][] = [
  ["code", "device_type", "name", "device_model_code", "serial_number", "asset_tag", "external_ref", "status", "tags"],
  ["srv-demo-01", "server",  "Demo Server 1",       "", "SN-DEMO-001", "ASSET-DEMO-001", "REF-DEMO-001", "in_stock", "production"],
  ["srv-demo-02", "server",  "Demo Server 2",       "", "SN-DEMO-002", "",              "",             "planned",  "staging"],
  ["sw-demo-01",  "network", "Demo Switch 1",       "", "",            "",              "",             "in_stock", "access;switch"],
  ["device-demo-01", "other", "Demo Other Device",  "", "",            "",              "",             "unknown",  ""],
];

export const SAMPLE_CSV_CONTENT: string =
  SAMPLE_ROWS.map(csvRow).join("\n") + "\n";

export function downloadSampleCsv(): void {
  const blob = new Blob([SAMPLE_CSV_CONTENT], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = SAMPLE_CSV_FILENAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
