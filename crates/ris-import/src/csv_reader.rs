use std::collections::HashMap;

pub(crate) const KNOWN_COLUMNS: &[&str] = &[
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

pub(crate) const REQUIRED_COLUMNS: &[&str] = &["device_type", "status"];

pub(crate) struct CsvDeviceRowRaw {
    pub row_number: usize,
    pub code: Option<String>,
    pub device_type: Option<String>,
    pub name: Option<String>,
    pub device_model_code: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: Option<String>,
    /// Raw semicolon-separated tag string; `None` when column absent or empty.
    pub tags: Option<String>,
}

pub(crate) struct ParsedCsv {
    pub headers: Vec<String>,
    pub unknown_headers: Vec<String>,
    pub rows: Vec<CsvDeviceRowRaw>,
}

fn get_field(
    record: &csv::StringRecord,
    col_index: &HashMap<String, usize>,
    name: &str,
) -> Option<String> {
    col_index
        .get(name)
        .and_then(|&i| record.get(i))
        .map(|v| v.trim().to_string())
        .and_then(|v| if v.is_empty() { None } else { Some(v) })
}

pub(crate) fn parse_csv(content: &str) -> Result<ParsedCsv, String> {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content.as_bytes());

    let headers_record = reader.headers().map_err(|e| e.to_string())?.clone();

    let headers: Vec<String> = headers_record
        .iter()
        .map(|h| h.trim().to_string())
        .collect();

    let col_index: HashMap<String, usize> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| (h.clone(), i))
        .collect();

    let unknown_headers: Vec<String> = headers
        .iter()
        .filter(|h| !KNOWN_COLUMNS.contains(&h.as_str()))
        .cloned()
        .collect();

    let mut rows = Vec::new();
    for (idx, result) in reader.records().enumerate() {
        let record = result.map_err(|e| e.to_string())?;
        let row_number = idx + 2; // 1-based; row 1 is the header

        // Tags: preserve empty string as None (= no tags)
        let tags = col_index
            .get("tags")
            .and_then(|&i| record.get(i))
            .map(|v| v.trim().to_string())
            .and_then(|v| if v.is_empty() { None } else { Some(v) });

        rows.push(CsvDeviceRowRaw {
            row_number,
            code: get_field(&record, &col_index, "code"),
            device_type: get_field(&record, &col_index, "device_type"),
            name: get_field(&record, &col_index, "name"),
            device_model_code: get_field(&record, &col_index, "device_model_code"),
            serial_number: get_field(&record, &col_index, "serial_number"),
            asset_tag: get_field(&record, &col_index, "asset_tag"),
            external_ref: get_field(&record, &col_index, "external_ref"),
            status: get_field(&record, &col_index, "status"),
            tags,
        });
    }

    Ok(ParsedCsv {
        headers,
        unknown_headers,
        rows,
    })
}
