use std::collections::HashMap;

// ── Device model CSV ──────────────────────────────────────────────────────────

pub(crate) const DEVICE_MODEL_KNOWN_COLUMNS: &[&str] = &[
    "device_type",
    "name",
    "code",
    "vendor",
    "model_number",
    "height_u",
    "description",
    "tags",
];

pub(crate) const DEVICE_MODEL_REQUIRED_COLUMNS: &[&str] = &["device_type", "name"];

pub(crate) struct CsvDeviceModelRowRaw {
    pub row_number: usize,
    pub device_type: Option<String>,
    pub name: Option<String>,
    pub code: Option<String>,
    pub vendor: Option<String>,
    pub model_number: Option<String>,
    pub height_u: Option<String>,
    pub description: Option<String>,
    pub tags: Option<String>,
}

pub(crate) struct ParsedDeviceModelCsv {
    pub headers: Vec<String>,
    pub unknown_headers: Vec<String>,
    pub rows: Vec<CsvDeviceModelRowRaw>,
}

pub(crate) fn parse_device_model_csv(content: &str) -> Result<ParsedDeviceModelCsv, String> {
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
        .filter(|h| !DEVICE_MODEL_KNOWN_COLUMNS.contains(&h.as_str()))
        .cloned()
        .collect();

    let mut rows = Vec::new();
    for (idx, result) in reader.records().enumerate() {
        let record = result.map_err(|e| e.to_string())?;
        let row_number = idx + 2;

        let tags = col_index
            .get("tags")
            .and_then(|&i| record.get(i))
            .map(|v| v.trim().to_string())
            .and_then(|v| if v.is_empty() { None } else { Some(v) });

        rows.push(CsvDeviceModelRowRaw {
            row_number,
            device_type: get_field(&record, &col_index, "device_type"),
            name: get_field(&record, &col_index, "name"),
            code: get_field(&record, &col_index, "code"),
            vendor: get_field(&record, &col_index, "vendor"),
            model_number: get_field(&record, &col_index, "model_number"),
            height_u: get_field(&record, &col_index, "height_u"),
            description: get_field(&record, &col_index, "description"),
            tags,
        });
    }

    Ok(ParsedDeviceModelCsv {
        headers,
        unknown_headers,
        rows,
    })
}

// ── Device CSV ────────────────────────────────────────────────────────────────

pub(crate) const KNOWN_COLUMNS: &[&str] = &[
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
