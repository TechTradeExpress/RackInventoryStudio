use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::RawRepositoryData;

use crate::helpers::{issue, issue_f, issue_for_f};

pub fn validate(raw: &RawRepositoryData) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    let lf = match &raw.locations_file {
        Some(f) => f,
        None => {
            // VAL-LOC-001: inventory/locations.yaml must exist
            issues.push(issue(
                "VAL-LOC-001",
                ValidationLevel::Error,
                "inventory/locations.yaml does not exist",
            ));
            return issues;
        }
    };

    if !lf.locations_key_present {
        issues.push(issue_f(
            "VAL-LOC-002",
            ValidationLevel::Error,
            "locations.yaml is missing the root 'locations' key",
            &lf.file_path,
        ));
        return issues;
    }

    // Collect rack location_ids to detect VAL-LOC-005
    let location_ids_with_racks: std::collections::HashSet<&str> = raw
        .rack_files
        .iter()
        .filter_map(|rf| rf.location_id.as_deref())
        .collect();

    for loc in &lf.locations {
        let id = loc.id.as_deref().unwrap_or("");
        let code = loc.code.as_deref().unwrap_or("");

        // VAL-LOC-003: id, code, name required
        if loc.id.is_none() || loc.code.is_none() || loc.name.is_none() {
            let missing: Vec<&str> = [
                loc.id.is_none().then_some("id"),
                loc.code.is_none().then_some("code"),
                loc.name.is_none().then_some("name"),
            ]
            .into_iter()
            .flatten()
            .collect();
            issues.push(issue_for_f(
                "VAL-LOC-003",
                ValidationLevel::Error,
                &format!(
                    "location is missing required field(s): {}",
                    missing.join(", ")
                ),
                "location",
                id,
                code,
                &lf.file_path,
            ));
        }

        // VAL-LOC-004: name non-empty
        if let Some(name) = &loc.name {
            if name.is_empty() {
                issues.push(issue_for_f(
                    "VAL-LOC-004",
                    ValidationLevel::Error,
                    "location name must not be empty",
                    "location",
                    id,
                    code,
                    &lf.file_path,
                ));
            }
        }

        // VAL-LOC-005: location without racks (INFO)
        if let Some(lid) = &loc.id {
            if !location_ids_with_racks.contains(lid.as_str()) {
                issues.push(issue_for_f(
                    "VAL-LOC-005",
                    ValidationLevel::Info,
                    &format!("location '{}' has no racks", code),
                    "location",
                    id,
                    code,
                    &lf.file_path,
                ));
            }
        }
    }

    if lf.locations.is_empty() && lf.locations_key_present {
        issues.push(issue(
            "VAL-LOC-005",
            ValidationLevel::Info,
            "locations.yaml has no locations defined",
        ));
    }

    issues
}
