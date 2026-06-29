use std::collections::HashSet;

use ris_core::{DeviceType, ValidationIssue, ValidationLevel};

use crate::context::CsvImportContext;
use crate::csv_reader::{
    parse_device_model_csv, CsvDeviceModelRowRaw, DEVICE_MODEL_REQUIRED_COLUMNS,
};
use crate::preview::{
    CsvDeviceModelImportPreview, CsvDeviceModelImportPreviewRow, CsvImportSummary, CsvRowAction,
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

fn norm(s: &str) -> String {
    s.trim().to_lowercase()
}

fn find_duplicates<'a>(values: impl Iterator<Item = &'a str>) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut dups = HashSet::new();
    for v in values {
        let k = norm(v);
        if !seen.insert(k.clone()) {
            dups.insert(k);
        }
    }
    dups
}

// ── row validation ────────────────────────────────────────────────────────────

fn validate_row(
    raw: &CsvDeviceModelRowRaw,
    context: &CsvImportContext,
    dup_codes: &HashSet<String>,
) -> CsvDeviceModelImportPreviewRow {
    let mut issues: Vec<ValidationIssue> = Vec::new();
    let n = raw.row_number;

    // VAL-DM-005: name is required for device models
    let name = match raw.name.as_deref() {
        Some(v) if !v.trim().is_empty() => Some(v.trim().to_string()),
        _ => {
            issues.push(csv_row_issue(
                "VAL-DM-005",
                ValidationLevel::Error,
                "Name is required",
                n,
                "name",
            ));
            None
        }
    };

    // VAL-DM-006: device_type missing
    // VAL-DM-007: device_type invalid
    let parsed_device_type: Option<DeviceType> = match raw.device_type.as_deref() {
        None | Some("") => {
            issues.push(csv_row_issue(
                "VAL-DM-006",
                ValidationLevel::Error,
                "Device type is required",
                n,
                "device_type",
            ));
            None
        }
        Some(s) => match s.parse::<DeviceType>() {
            Ok(dt) => Some(dt),
            Err(_) => {
                issues.push(csv_row_issue(
                    "VAL-DM-007",
                    ValidationLevel::Error,
                    &format!("Unknown device type: '{s}'"),
                    n,
                    "device_type",
                ));
                None
            }
        },
    };

    // VAL-DM-008: height_u must be a positive integer if present
    let height_u: Option<u32> = match raw.height_u.as_deref() {
        None => None, // omitted = use default (1)
        Some(s) => match s.trim().parse::<u32>() {
            Ok(0) => {
                issues.push(csv_row_issue(
                    "VAL-DM-008",
                    ValidationLevel::Error,
                    "height_u must be a positive integer (≥ 1)",
                    n,
                    "height_u",
                ));
                None
            }
            Ok(v) => Some(v),
            Err(_) => {
                issues.push(csv_row_issue(
                    "VAL-DM-008",
                    ValidationLevel::Error,
                    &format!("height_u must be a positive integer, got '{s}'"),
                    n,
                    "height_u",
                ));
                None
            }
        },
    };

    // VAL-DM-003 / VAL-DM-004: code uniqueness
    let code: Option<String> = match raw.code.as_deref() {
        None => None,
        Some(c) => {
            let c = c.trim().to_string();
            let c_norm = norm(&c);
            if dup_codes.contains(&c_norm) {
                issues.push(csv_row_issue(
                    "VAL-DM-003",
                    ValidationLevel::Error,
                    &format!("Code '{c}' appears more than once in this CSV"),
                    n,
                    "code",
                ));
            } else if context.get_device_model_by_code(&c_norm).is_some() {
                issues.push(csv_row_issue(
                    "VAL-DM-004",
                    ValidationLevel::Error,
                    &format!("A device model with code '{c}' already exists in the repository"),
                    n,
                    "code",
                ));
            }
            Some(c)
        }
    };

    // VAL-DM-009: malformed tags
    let (tags, has_empty_segment) = parse_tags(raw.tags.as_deref());
    if has_empty_segment {
        issues.push(csv_row_issue(
            "VAL-DM-009",
            ValidationLevel::Warning,
            "Tags contain empty segments (consecutive or trailing semicolons); empty segments are ignored",
            n,
            "tags",
        ));
    }

    let has_error = issues.iter().any(|i| i.level == ValidationLevel::Error);
    let action = if has_error {
        CsvRowAction::SkipDueToError
    } else {
        CsvRowAction::Create
    };

    CsvDeviceModelImportPreviewRow {
        row_number: n,
        device_type: parsed_device_type
            .as_ref()
            .map(|dt| dt.as_str().to_string()),
        name,
        code,
        vendor: raw.vendor.clone(),
        model_number: raw.model_number.clone(),
        height_u,
        description: raw.description.clone(),
        tags,
        action,
        issues,
    }
}

// ── public entry point ────────────────────────────────────────────────────────

pub fn preview_device_model_csv_import(
    csv_content: &str,
    context: &CsvImportContext,
) -> CsvDeviceModelImportPreview {
    let mut file_issues: Vec<ValidationIssue> = Vec::new();

    let parsed = match parse_device_model_csv(csv_content) {
        Ok(p) => p,
        Err(e) => {
            file_issues.push(csv_file_issue(
                "VAL-DM-001",
                ValidationLevel::Error,
                &format!("CSV parse error: {e}"),
            ));
            return CsvDeviceModelImportPreview {
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

    // Check required headers
    let missing: Vec<&&str> = DEVICE_MODEL_REQUIRED_COLUMNS
        .iter()
        .filter(|c| !parsed.headers.iter().any(|h| h == **c))
        .collect();
    if !missing.is_empty() {
        let names = missing
            .iter()
            .map(|c| format!("'{}'", c))
            .collect::<Vec<_>>()
            .join(", ");
        file_issues.push(csv_file_issue(
            "VAL-DM-001",
            ValidationLevel::Error,
            &format!("Missing required column(s): {names}"),
        ));
        return CsvDeviceModelImportPreview {
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

    // Warn on unknown columns
    if !parsed.unknown_headers.is_empty() {
        let names = parsed
            .unknown_headers
            .iter()
            .map(|h| format!("'{h}'"))
            .collect::<Vec<_>>()
            .join(", ");
        file_issues.push(csv_file_issue(
            "VAL-DM-002",
            ValidationLevel::Warning,
            &format!("Unknown column(s) will be ignored: {names}"),
        ));
    }

    // Compute intra-CSV duplicate codes (only rows that supply a code)
    let dup_codes = find_duplicates(parsed.rows.iter().filter_map(|r| r.code.as_deref()));

    let rows: Vec<CsvDeviceModelImportPreviewRow> = parsed
        .rows
        .iter()
        .map(|r| validate_row(r, context, &dup_codes))
        .collect();

    let total_rows = rows.len();
    let error_rows = rows
        .iter()
        .filter(|r| r.issues.iter().any(|i| i.level == ValidationLevel::Error))
        .count();
    let warning_rows = rows
        .iter()
        .filter(|r| r.issues.iter().any(|i| i.level == ValidationLevel::Warning))
        .count();
    let valid_rows = rows
        .iter()
        .filter(|r| r.action == CsvRowAction::Create)
        .count();

    CsvDeviceModelImportPreview {
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
