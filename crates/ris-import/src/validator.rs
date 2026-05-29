use std::collections::HashSet;

use ris_core::{DeviceStatus, DeviceType, ValidationIssue, ValidationLevel};

use crate::context::CsvImportContext;
use crate::csv_reader::{parse_csv, CsvDeviceRowRaw, REQUIRED_COLUMNS};
use crate::preview::{
    CsvDeviceImportPreview, CsvDeviceImportPreviewRow, CsvImportSummary, CsvRowAction,
};

// ── issue helpers ─────────────────────────────────────────────────────────────

fn csv_file_issue(code: &str, level: ValidationLevel, message: &str) -> ValidationIssue {
    ValidationIssue {
        code: code.to_string(),
        level,
        message: message.to_string(),
        object_type: Some("csv_file".to_string()),
        object_id: None,
        object_code: None,
        file_path: None,
        rack_id: None,
        details: None,
    }
}

fn csv_row_issue(
    code: &str,
    level: ValidationLevel,
    message: &str,
    row: usize,
    column: &str,
) -> ValidationIssue {
    ValidationIssue {
        code: code.to_string(),
        level,
        message: message.to_string(),
        object_type: Some("csv_row".to_string()),
        object_id: None,
        object_code: None,
        file_path: None,
        rack_id: None,
        details: Some(format!("row={row}, column={column}")),
    }
}

// ── tag parsing ───────────────────────────────────────────────────────────────

/// Split semicolon-separated tags.  Returns `(tags, has_empty_segment)`.
///
/// `has_empty_segment = true` means the input had consecutive/trailing/leading
/// semicolons that produced an empty tag after trimming, e.g. `"tag1;;tag2"`.
fn parse_tags(raw: Option<&str>) -> (Vec<String>, bool) {
    match raw {
        None => (Vec::new(), false),
        Some(s) => {
            let parts: Vec<&str> = s.split(';').collect();
            let has_empty = parts.iter().any(|p| p.trim().is_empty());
            let tags = parts
                .into_iter()
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect();
            (tags, has_empty)
        }
    }
}

// ── duplicate detection ───────────────────────────────────────────────────────

/// Normalize an identifier for uniqueness comparison: trim + lowercase.
fn norm_id(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Find duplicates by normalized (trimmed, lowercased) value.
/// Returns the set of normalized keys that appear more than once.
fn find_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> HashSet<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut dups: HashSet<String> = HashSet::new();
    for v in values {
        let key = norm_id(v);
        if !key.is_empty() && !seen.insert(key.clone()) {
            dups.insert(key);
        }
    }
    dups
}

// ── row validator ─────────────────────────────────────────────────────────────

fn validate_row(
    raw: &CsvDeviceRowRaw,
    context: &CsvImportContext,
    dup_serials: &HashSet<String>,
    dup_asset_tags: &HashSet<String>,
    dup_external_refs: &HashSet<String>,
) -> CsvDeviceImportPreviewRow {
    let row = raw.row_number;
    let mut issues: Vec<ValidationIssue> = Vec::new();

    // VAL-CSV-007: at least one of name, serial_number, asset_tag, external_ref
    let has_name = raw.name.is_some();
    let has_sn = raw.serial_number.is_some();
    let has_at = raw.asset_tag.is_some();
    let has_er = raw.external_ref.is_some();
    if !has_name && !has_sn && !has_at && !has_er {
        issues.push(csv_row_issue(
            "VAL-CSV-007",
            ValidationLevel::Error,
            "row must have at least one of: name, serial_number, asset_tag, external_ref",
            row,
            "name/serial_number/asset_tag/external_ref",
        ));
    }

    // VAL-CSV-008: status required
    let status = raw.status.as_deref();
    if status.is_none() {
        issues.push(csv_row_issue(
            "VAL-CSV-008",
            ValidationLevel::Error,
            "row is missing required field 'status'",
            row,
            "status",
        ));
    }

    // VAL-CSV-009: status valid
    if let Some(status_val) = status {
        if status_val.parse::<DeviceStatus>().is_err() {
            issues.push(csv_row_issue(
                "VAL-CSV-009",
                ValidationLevel::Error,
                &format!("status '{}' is not a valid device status", status_val),
                row,
                "status",
            ));
        }
    }

    // VAL-CSV-010: device_type required
    let device_type_str = raw.device_type.as_deref();
    if device_type_str.is_none() {
        issues.push(csv_row_issue(
            "VAL-CSV-010",
            ValidationLevel::Error,
            "row is missing required field 'device_type'",
            row,
            "device_type",
        ));
    }

    // VAL-CSV-011: device_type valid and not rack_object
    let mut parsed_device_type: Option<DeviceType> = None;
    if let Some(dt_val) = device_type_str {
        match dt_val.parse::<DeviceType>() {
            Err(_) => {
                issues.push(csv_row_issue(
                    "VAL-CSV-011",
                    ValidationLevel::Error,
                    &format!("device_type '{}' is not a valid device type", dt_val),
                    row,
                    "device_type",
                ));
            }
            Ok(DeviceType::RackObject) => {
                issues.push(csv_row_issue(
                    "VAL-CSV-011",
                    ValidationLevel::Error,
                    "device_type 'rack_object' is not allowed in CSV import",
                    row,
                    "device_type",
                ));
            }
            Ok(dt) => {
                parsed_device_type = Some(dt);
            }
        }
    }

    // VAL-CSV-012/013/014 and model resolution
    let mut resolved_device_model_id: Option<String> = None;

    if let Some(model_code) = raw.device_model_code.as_deref() {
        match context.get_device_model_by_code(model_code) {
            None => {
                // VAL-CSV-012: device_model_code not found
                issues.push(csv_row_issue(
                    "VAL-CSV-012",
                    ValidationLevel::Error,
                    &format!(
                        "device_model_code '{}' does not exist in the repository",
                        model_code
                    ),
                    row,
                    "device_model_code",
                ));
            }
            Some(model_info) => {
                resolved_device_model_id = Some(model_info.id.clone());

                // VAL-CSV-013: device_model_code must not be rack_object
                if model_info.device_type == DeviceType::RackObject {
                    issues.push(csv_row_issue(
                        "VAL-CSV-013",
                        ValidationLevel::Error,
                        &format!(
                            "device_model_code '{}' refers to a rack_object model, which is not allowed",
                            model_code
                        ),
                        row,
                        "device_model_code",
                    ));
                }

                // VAL-CSV-014: device_type must match model device_type
                if let Some(ref dt) = parsed_device_type {
                    if *dt != model_info.device_type {
                        issues.push(csv_row_issue(
                            "VAL-CSV-014",
                            ValidationLevel::Error,
                            &format!(
                                "device_type '{}' does not match model '{}' device_type '{}'",
                                dt.as_str(),
                                model_code,
                                model_info.device_type.as_str()
                            ),
                            row,
                            "device_type",
                        ));
                    }
                }
            }
        }
    }

    // VAL-CSV-015/016: serial_number (normalize for comparison)
    if let Some(sn) = raw.serial_number.as_deref() {
        let sn_key = norm_id(sn);
        if !sn_key.is_empty() {
            if dup_serials.contains(&sn_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-015",
                    ValidationLevel::Error,
                    &format!("serial_number '{}' appears more than once in the CSV", sn),
                    row,
                    "serial_number",
                ));
            }
            if context.has_serial_number(&sn_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-016",
                    ValidationLevel::Error,
                    &format!("serial_number '{}' already exists in the repository", sn),
                    row,
                    "serial_number",
                ));
            }
        }
    }

    // VAL-CSV-017/018: asset_tag (normalize for comparison)
    if let Some(at) = raw.asset_tag.as_deref() {
        let at_key = norm_id(at);
        if !at_key.is_empty() {
            if dup_asset_tags.contains(&at_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-017",
                    ValidationLevel::Error,
                    &format!("asset_tag '{}' appears more than once in the CSV", at),
                    row,
                    "asset_tag",
                ));
            }
            if context.has_asset_tag(&at_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-018",
                    ValidationLevel::Error,
                    &format!("asset_tag '{}' already exists in the repository", at),
                    row,
                    "asset_tag",
                ));
            }
        }
    }

    // VAL-CSV-020/021: external_ref uniqueness (normalize for comparison)
    if let Some(er) = raw.external_ref.as_deref() {
        let er_key = norm_id(er);
        if !er_key.is_empty() {
            if dup_external_refs.contains(&er_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-020",
                    ValidationLevel::Error,
                    &format!("external_ref '{}' appears more than once in the CSV", er),
                    row,
                    "external_ref",
                ));
            }
            if context.has_external_ref(&er_key) {
                issues.push(csv_row_issue(
                    "VAL-CSV-021",
                    ValidationLevel::Error,
                    &format!("external_ref '{}' already exists in the repository", er),
                    row,
                    "external_ref",
                ));
            }
        }
    }

    // VAL-CSV-019: tag format
    let (tags, has_empty_segment) = parse_tags(raw.tags.as_deref());
    if has_empty_segment {
        issues.push(csv_row_issue(
            "VAL-CSV-019",
            ValidationLevel::Warning,
            "tags field contains an empty segment (check semicolons)",
            row,
            "tags",
        ));
    }

    let action = if issues.iter().any(|i| i.level == ValidationLevel::Error) {
        CsvRowAction::SkipDueToError
    } else {
        CsvRowAction::Create
    };

    CsvDeviceImportPreviewRow {
        row_number: raw.row_number,
        device_type: raw.device_type.clone(),
        name: raw.name.clone(),
        device_model_code: raw.device_model_code.clone(),
        resolved_device_model_id,
        serial_number: raw.serial_number.clone(),
        asset_tag: raw.asset_tag.clone(),
        external_ref: raw.external_ref.clone(),
        status: raw.status.clone(),
        tags,
        action,
        issues,
    }
}

// ── public entry point ────────────────────────────────────────────────────────

/// Parse and validate CSV device import content against the repository.
///
/// Never fails; all issues are collected in the returned preview.
/// Does not modify the repository or the context.
pub fn preview_csv_import(csv_content: &str, context: &CsvImportContext) -> CsvDeviceImportPreview {
    let mut file_issues: Vec<ValidationIssue> = Vec::new();

    // ── parse ─────────────────────────────────────────────────────────────────

    let parsed = match parse_csv(csv_content) {
        Ok(p) => p,
        Err(e) => {
            file_issues.push(csv_file_issue(
                "VAL-CSV-001",
                ValidationLevel::Error,
                &format!("CSV parse error: {e}"),
            ));
            return CsvDeviceImportPreview {
                rows: vec![],
                issues: file_issues,
                summary: CsvImportSummary {
                    total_rows: 0,
                    valid_rows: 0,
                    error_rows: 0,
                    warning_rows: 0,
                },
            };
        }
    };

    // ── VAL-CSV-001: required headers ─────────────────────────────────────────

    let header_set: HashSet<&str> = parsed.headers.iter().map(String::as_str).collect();
    for req in REQUIRED_COLUMNS {
        if !header_set.contains(*req) {
            file_issues.push(csv_file_issue(
                "VAL-CSV-001",
                ValidationLevel::Error,
                &format!("missing required header '{req}'"),
            ));
        }
    }

    if file_issues
        .iter()
        .any(|i| i.level == ValidationLevel::Error)
    {
        return CsvDeviceImportPreview {
            rows: vec![],
            issues: file_issues,
            summary: CsvImportSummary {
                total_rows: 0,
                valid_rows: 0,
                error_rows: 0,
                warning_rows: 0, // no rows were parsed; file-level warnings don't count here
            },
        };
    }

    // ── VAL-CSV-002: unknown columns ──────────────────────────────────────────

    for h in &parsed.unknown_headers {
        file_issues.push(csv_file_issue(
            "VAL-CSV-002",
            ValidationLevel::Warning,
            &format!("unknown column '{h}' will be ignored"),
        ));
    }

    // ── pre-scan for in-CSV duplicates ────────────────────────────────────────

    let dup_serials = find_duplicates(
        parsed
            .rows
            .iter()
            .filter_map(|r| r.serial_number.as_deref()),
    );
    let dup_asset_tags = find_duplicates(parsed.rows.iter().filter_map(|r| r.asset_tag.as_deref()));
    let dup_external_refs =
        find_duplicates(parsed.rows.iter().filter_map(|r| r.external_ref.as_deref()));

    // ── validate rows ─────────────────────────────────────────────────────────

    let rows: Vec<CsvDeviceImportPreviewRow> = parsed
        .rows
        .iter()
        .map(|raw| {
            validate_row(
                raw,
                context,
                &dup_serials,
                &dup_asset_tags,
                &dup_external_refs,
            )
        })
        .collect();

    // ── summary ───────────────────────────────────────────────────────────────

    let total_rows = rows.len();
    let error_rows = rows
        .iter()
        .filter(|r| r.action == CsvRowAction::SkipDueToError)
        .count();
    let valid_rows = total_rows - error_rows;

    // Count rows with at least one warning (not individual warning issues).
    // Rows that have both errors and warnings still count here.
    // File-level/header warnings are not included.
    let warning_rows = rows
        .iter()
        .filter(|r| r.issues.iter().any(|i| i.level == ValidationLevel::Warning))
        .count();

    CsvDeviceImportPreview {
        rows,
        issues: file_issues,
        summary: CsvImportSummary {
            total_rows,
            valid_rows,
            error_rows,
            warning_rows,
        },
    }
}
