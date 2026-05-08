use std::collections::{HashMap, HashSet};

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue_f, issue_for_f};

const ALLOWED_DEVICE_FILE_TYPES: &[&str] =
    &["server", "network", "storage", "ups", "appliance", "other"];

const VALID_STATUS: &[&str] = &[
    "planned",
    "in_stock",
    "installed",
    "to_remove",
    "removed",
    "disposed",
    "unknown",
];

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    // device_ids that appear in any placement
    let placed_device_ids: HashSet<&str> = raw
        .placement_files
        .iter()
        .flat_map(|pf| pf.front.iter().chain(pf.rear.iter()))
        .filter(|p| p.target_kind.as_deref() == Some("device"))
        .filter_map(|p| p.target_id.as_deref())
        .collect();

    // model_id → device_type
    let model_device_type: HashMap<&str, &str> = raw
        .device_model_files
        .iter()
        .flat_map(|mf| {
            let dt = mf.device_type.as_deref().unwrap_or("");
            mf.models
                .iter()
                .filter_map(move |m| m.id.as_deref().map(|id| (id, dt)))
        })
        .collect();

    // rack_object model ids
    let rack_object_model_ids: HashSet<&str> = raw
        .device_model_files
        .iter()
        .filter(|mf| mf.device_type.as_deref() == Some("rack_object"))
        .flat_map(|mf| mf.models.iter().filter_map(|m| m.id.as_deref()))
        .collect();

    // serial_number → (file_path, code) for uniqueness tracking
    let mut serial_seen: HashMap<&str, (&str, &str)> = HashMap::new();
    // asset_tag → (file_path, code) for uniqueness tracking
    let mut asset_seen: HashMap<&str, (&str, &str)> = HashMap::new();

    for df in &raw.device_files {
        // VAL-DEV-001: file must have device_type
        if df.device_type.is_none() {
            issues.push(issue_f(
                "VAL-DEV-001",
                ValidationLevel::Error,
                &format!(
                    "device file '{}' is missing required field 'device_type'",
                    df.file_path
                ),
                &df.file_path,
            ));
        }

        // VAL-DEV-002: device_type must be valid (not rack_object)
        if let Some(dt) = &df.device_type {
            if !ALLOWED_DEVICE_FILE_TYPES.contains(&dt.as_str()) {
                issues.push(issue_f(
                    "VAL-DEV-002",
                    ValidationLevel::Error,
                    &format!(
                        "device file '{}' has invalid device_type '{}' (rack_object is not allowed in device files)",
                        df.file_path, dt
                    ),
                    &df.file_path,
                ));
            }
        }

        // VAL-DEV-003: root devices key must exist
        if !df.devices_key_present {
            issues.push(issue_f(
                "VAL-DEV-003",
                ValidationLevel::Error,
                &format!(
                    "device file '{}' is missing the root 'devices' key",
                    df.file_path
                ),
                &df.file_path,
            ));
            continue;
        }

        for d in &df.devices {
            let id = d.id.as_deref().unwrap_or("");
            let code = d.code.as_deref().unwrap_or("");

            // VAL-DEV-004: id, code, status required
            let missing: Vec<&str> = [
                d.id.is_none().then_some("id"),
                d.code.is_none().then_some("code"),
                d.status.is_none().then_some("status"),
            ]
            .into_iter()
            .flatten()
            .collect();
            if !missing.is_empty() {
                issues.push(issue_for_f(
                    "VAL-DEV-004",
                    ValidationLevel::Error,
                    &format!(
                        "device is missing required field(s): {}",
                        missing.join(", ")
                    ),
                    "device",
                    id,
                    code,
                    &df.file_path,
                ));
            }

            // VAL-DEV-005: at least one of name / serial_number / asset_tag
            if d.name.is_none() && d.serial_number.is_none() && d.asset_tag.is_none() {
                issues.push(issue_for_f(
                    "VAL-DEV-005",
                    ValidationLevel::Error,
                    "device must have at least one of: name, serial_number, asset_tag",
                    "device",
                    id,
                    code,
                    &df.file_path,
                ));
            }

            // VAL-DEV-006: status must be valid enum
            if let Some(status) = &d.status {
                if !VALID_STATUS.contains(&status.as_str()) {
                    issues.push(issue_for_f(
                        "VAL-DEV-006",
                        ValidationLevel::Error,
                        &format!("device '{}' has invalid status '{}'", code, status),
                        "device",
                        id,
                        code,
                        &df.file_path,
                    ));
                }
            }

            if let Some(mid) = &d.device_model_id {
                if !model_device_type.contains_key(mid.as_str()) {
                    // VAL-DEV-007: device_model_id must reference existing model
                    issues.push(issue_for_f(
                        "VAL-DEV-007",
                        ValidationLevel::Error,
                        &format!(
                            "device '{}' references unknown device_model_id '{}'",
                            code, mid
                        ),
                        "device",
                        id,
                        code,
                        &df.file_path,
                    ));
                } else {
                    // VAL-DEV-008: device_type must match the model's device_type
                    if let Some(file_dt) = &df.device_type {
                        if let Some(&model_dt) = model_device_type.get(mid.as_str()) {
                            if !model_dt.is_empty() && file_dt.as_str() != model_dt {
                                issues.push(issue_for_f(
                                    "VAL-DEV-008",
                                    ValidationLevel::Error,
                                    &format!(
                                        "device '{}' device_type '{}' does not match model device_type '{}'",
                                        code, file_dt, model_dt
                                    ),
                                    "device",
                                    id,
                                    code,
                                    &df.file_path,
                                ));
                            }
                        }
                    }

                    // VAL-DEV-009: device cannot reference rack_object model
                    if rack_object_model_ids.contains(mid.as_str()) {
                        issues.push(issue_for_f(
                            "VAL-DEV-009",
                            ValidationLevel::Error,
                            &format!(
                                "device '{}' references rack_object model '{}'; devices cannot reference rack_object models",
                                code, mid
                            ),
                            "device",
                            id,
                            code,
                            &df.file_path,
                        ));
                    }
                }
            }

            // VAL-DEV-010: serial_number must be unique
            if let Some(sn) = d.serial_number.as_deref() {
                if let Some((_prev_file, prev_code)) = serial_seen.insert(sn, (&df.file_path, code))
                {
                    issues.push(issue_for_f(
                        "VAL-DEV-010",
                        ValidationLevel::Error,
                        &format!(
                            "duplicate serial_number '{}' in device '{}' and '{}'",
                            sn, prev_code, code
                        ),
                        "device",
                        id,
                        code,
                        &df.file_path,
                    ));
                }
            }

            // VAL-DEV-011: asset_tag must be unique
            if let Some(at) = d.asset_tag.as_deref() {
                if let Some((_prev_file, prev_code)) = asset_seen.insert(at, (&df.file_path, code))
                {
                    issues.push(issue_for_f(
                        "VAL-DEV-011",
                        ValidationLevel::Error,
                        &format!(
                            "duplicate asset_tag '{}' in device '{}' and '{}'",
                            at, prev_code, code
                        ),
                        "device",
                        id,
                        code,
                        &df.file_path,
                    ));
                }
            }

            // VAL-DEV-012: device without model (WARNING)
            if d.device_model_id.is_none() {
                issues.push(issue_for_f(
                    "VAL-DEV-012",
                    ValidationLevel::Warning,
                    &format!("device '{}' has no device_model_id", code),
                    "device",
                    id,
                    code,
                    &df.file_path,
                ));
            }

            if let Some(did) = &d.id {
                if !placed_device_ids.contains(did.as_str()) {
                    // VAL-DEV-013: device without placement (WARNING)
                    issues.push(issue_for_f(
                        "VAL-DEV-013",
                        ValidationLevel::Warning,
                        &format!("device '{}' has no placement", code),
                        "device",
                        id,
                        code,
                        &df.file_path,
                    ));

                    // VAL-DEV-014: installed device without placement (WARNING)
                    if d.status.as_deref() == Some("installed") {
                        issues.push(issue_for_f(
                            "VAL-DEV-014",
                            ValidationLevel::Warning,
                            &format!(
                                "device '{}' has status 'installed' but is not placed in any rack",
                                code
                            ),
                            "device",
                            id,
                            code,
                            &df.file_path,
                        ));
                    }
                }
            }
        }
    }

    issues
}
