use std::collections::HashSet;

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue_f, issue_for_f};

const ALLOWED_MODEL_DEVICE_TYPES: &[&str] = &[
    "server",
    "network",
    "storage",
    "ups",
    "appliance",
    "rack_object",
    "other",
];

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    // Build set of device_model ids that appear as device_model targets in placements
    let model_ids_used_as_placement_targets: HashSet<&str> = raw
        .placement_files
        .iter()
        .flat_map(|pf| pf.front.iter().chain(pf.rear.iter()))
        .filter(|p| p.target_kind.as_deref() == Some("device_model"))
        .filter_map(|p| p.target_id.as_deref())
        .collect();

    // Build set of rack_object model ids for VAL-MODEL-007
    let rack_object_model_ids: HashSet<&str> = raw
        .device_model_files
        .iter()
        .filter(|mf| mf.device_type.as_deref() == Some("rack_object"))
        .flat_map(|mf| mf.models.iter())
        .filter_map(|m| m.id.as_deref())
        .collect();

    for mf in &raw.device_model_files {
        // VAL-MODEL-001: file must have device_type
        if mf.device_type.is_none() {
            issues.push(issue_f(
                "VAL-MODEL-001",
                ValidationLevel::Error,
                &format!(
                    "device-model file '{}' is missing required field 'device_type'",
                    mf.file_path
                ),
                &mf.file_path,
            ));
        }

        // VAL-MODEL-002: device_type must be valid enum
        if let Some(dt) = &mf.device_type {
            if !ALLOWED_MODEL_DEVICE_TYPES.contains(&dt.as_str()) {
                issues.push(issue_f(
                    "VAL-MODEL-002",
                    ValidationLevel::Error,
                    &format!(
                        "device-model file '{}' has invalid device_type '{}'",
                        mf.file_path, dt
                    ),
                    &mf.file_path,
                ));
            }
        }

        // VAL-MODEL-003: root models key must exist
        if !mf.models_key_present {
            issues.push(issue_f(
                "VAL-MODEL-003",
                ValidationLevel::Error,
                &format!(
                    "device-model file '{}' is missing the root 'models' key",
                    mf.file_path
                ),
                &mf.file_path,
            ));
            continue;
        }

        for m in &mf.models {
            let id = m.id.as_deref().unwrap_or("");
            let code = m.code.as_deref().unwrap_or("");

            // VAL-MODEL-004: id, code, name, default_height_u required
            // default_height_u counts as missing only when absent, not when present but invalid
            let missing: Vec<&str> = [
                m.id.is_none().then_some("id"),
                m.code.is_none().then_some("code"),
                m.name.is_none().then_some("name"),
                (m.default_height_u.is_none() && !m.default_height_u_bad)
                    .then_some("default_height_u"),
            ]
            .into_iter()
            .flatten()
            .collect();
            if !missing.is_empty() {
                issues.push(issue_for_f(
                    "VAL-MODEL-004",
                    ValidationLevel::Error,
                    &format!(
                        "device_model is missing required field(s): {}",
                        missing.join(", ")
                    ),
                    "device_model",
                    id,
                    code,
                    &mf.file_path,
                ));
            }

            // VAL-MODEL-005: default_height_u must be a positive integer
            if m.default_height_u_bad {
                issues.push(issue_for_f(
                    "VAL-MODEL-005",
                    ValidationLevel::Error,
                    &format!(
                        "device_model '{}' has invalid default_height_u; must be a positive integer",
                        code
                    ),
                    "device_model",
                    id,
                    code,
                    &mf.file_path,
                ));
            } else if let Some(h) = m.default_height_u {
                if h == 0 {
                    issues.push(issue_for_f(
                        "VAL-MODEL-005",
                        ValidationLevel::Error,
                        &format!(
                            "device_model '{}' has default_height_u=0; must be a positive integer",
                            code
                        ),
                        "device_model",
                        id,
                        code,
                        &mf.file_path,
                    ));
                }
            }

            // VAL-MODEL-006: rack_object used without Device (INFO)
            // rack_object models never appear in device files — that's expected and fine
            // We only emit INFO if a rack_object model is never used in ANY placement
            if mf.device_type.as_deref() == Some("rack_object") {
                if let Some(mid) = &m.id {
                    if !model_ids_used_as_placement_targets.contains(mid.as_str()) {
                        issues.push(issue_for_f(
                            "VAL-MODEL-006",
                            ValidationLevel::Info,
                            &format!("rack_object model '{}' is not used in any placement", code),
                            "device_model",
                            id,
                            code,
                            &mf.file_path,
                        ));
                    }
                }
            }

            // VAL-MODEL-007: non-rack_object model used as placement target
            if let Some(mid) = &m.id {
                if model_ids_used_as_placement_targets.contains(mid.as_str())
                    && !rack_object_model_ids.contains(mid.as_str())
                {
                    issues.push(issue_for_f(
                        "VAL-MODEL-007",
                        ValidationLevel::Error,
                        &format!(
                            "device_model '{}' is used as a placement target but is not a rack_object",
                            code
                        ),
                        "device_model", id, code,
                        &mf.file_path,
                    ));
                }
            }
        }
    }

    issues
}
