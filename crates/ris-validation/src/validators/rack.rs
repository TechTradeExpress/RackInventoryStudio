use std::collections::HashSet;

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue_f, issue_for_f};

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    let location_ids: HashSet<&str> = raw
        .locations_file
        .as_ref()
        .map(|lf| {
            lf.locations
                .iter()
                .filter_map(|l| l.id.as_deref())
                .collect()
        })
        .unwrap_or_default();

    let rack_ids_with_placement_file: HashSet<&str> = raw
        .placement_files
        .iter()
        .filter_map(|pf| pf.rack_id.as_deref())
        .collect();

    let rack_ids_with_placements: HashSet<&str> = raw
        .placement_files
        .iter()
        .filter(|pf| !pf.front.is_empty() || !pf.rear.is_empty())
        .filter_map(|pf| pf.rack_id.as_deref())
        .collect();

    for rf in &raw.rack_files {
        // VAL-RACK-001: rack file must have location_id
        if rf.location_id.is_none() {
            issues.push(issue_f(
                "VAL-RACK-001",
                ValidationLevel::Error,
                &format!(
                    "rack file '{}' is missing required field 'location_id'",
                    rf.file_path
                ),
                &rf.file_path,
            ));
        }

        // VAL-RACK-002: location_id must reference existing location
        if let Some(lid) = &rf.location_id {
            if !location_ids.contains(lid.as_str()) {
                issues.push(issue_f(
                    "VAL-RACK-002",
                    ValidationLevel::Error,
                    &format!(
                        "rack file '{}' references unknown location_id '{}'",
                        rf.file_path, lid
                    ),
                    &rf.file_path,
                ));
            }
        }

        // VAL-RACK-003: root racks key must exist
        if !rf.racks_key_present {
            issues.push(issue_f(
                "VAL-RACK-003",
                ValidationLevel::Error,
                &format!(
                    "rack file '{}' is missing the root 'racks' key",
                    rf.file_path
                ),
                &rf.file_path,
            ));
            continue;
        }

        for rack in &rf.racks {
            let id = rack.id.as_deref().unwrap_or("");
            let code = rack.code.as_deref().unwrap_or("");

            // VAL-RACK-004: id, code, name, height_u required
            // height_u counts as missing only when absent, not when present but invalid
            let missing: Vec<&str> = [
                rack.id.is_none().then_some("id"),
                rack.code.is_none().then_some("code"),
                rack.name.is_none().then_some("name"),
                (rack.height_u.is_none() && !rack.height_u_bad).then_some("height_u"),
            ]
            .into_iter()
            .flatten()
            .collect();
            if !missing.is_empty() {
                issues.push(issue_for_f(
                    "VAL-RACK-004",
                    ValidationLevel::Error,
                    &format!("rack is missing required field(s): {}", missing.join(", ")),
                    "rack",
                    id,
                    code,
                    &rf.file_path,
                ));
            }

            // VAL-RACK-005: height_u must be a positive integer
            if rack.height_u_bad {
                issues.push(issue_for_f(
                    "VAL-RACK-005",
                    ValidationLevel::Error,
                    &format!(
                        "rack '{}' has invalid height_u; must be a positive integer",
                        code
                    ),
                    "rack",
                    id,
                    code,
                    &rf.file_path,
                ));
            } else if let Some(h) = rack.height_u {
                if h == 0 {
                    issues.push(issue_for_f(
                        "VAL-RACK-005",
                        ValidationLevel::Error,
                        &format!("rack '{}' has height_u=0; must be a positive integer", code),
                        "rack",
                        id,
                        code,
                        &rf.file_path,
                    ));
                }
            }

            // VAL-RACK-006: rack without placement file (WARNING)
            if let Some(rid) = &rack.id {
                if !rack_ids_with_placement_file.contains(rid.as_str()) {
                    issues.push(issue_for_f(
                        "VAL-RACK-006",
                        ValidationLevel::Warning,
                        &format!("rack '{}' has no placement file", code),
                        "rack",
                        id,
                        code,
                        &rf.file_path,
                    ));
                }

                // VAL-RACK-007: rack without placements (WARNING)
                if rack_ids_with_placement_file.contains(rid.as_str())
                    && !rack_ids_with_placements.contains(rid.as_str())
                {
                    issues.push(issue_for_f(
                        "VAL-RACK-007",
                        ValidationLevel::Warning,
                        &format!("rack '{}' has a placement file but no placements", code),
                        "rack",
                        id,
                        code,
                        &rf.file_path,
                    ));
                }
            }
        }
    }

    issues
}
