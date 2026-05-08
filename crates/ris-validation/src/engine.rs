use std::path::Path;

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::load_raw;

use crate::helpers::issue;
use crate::validators::{device, device_model, general, location, placement, rack, repository};

pub struct ValidationEngine;

impl ValidationEngine {
    pub fn validate(repo_path: &Path) -> Vec<ValidationIssue> {
        let mut issues = Vec::new();

        // Phase 1: filesystem structure
        issues.extend(repository::validate_structure(repo_path));
        if issues.iter().any(|i| i.level == ValidationLevel::Error) {
            return issues;
        }
        repository::validate_directories(repo_path, &mut issues);

        // Phase 2: tolerant load — never fails, collects parse errors
        let raw = load_raw(repo_path);

        for (path, msg) in &raw.parse_errors {
            issues.push(issue(
                "VAL-LOAD-000",
                ValidationLevel::Error,
                &format!("{path}: {msg}"),
            ));
        }

        // Phase 3: repo.yaml metadata
        repository::validate_metadata(
            raw.repo_file.format.as_deref().unwrap_or(""),
            raw.repo_file.version.as_deref().unwrap_or(""),
            &mut issues,
        );

        // Phase 4: domain validators
        issues.extend(general::validate(&raw));
        issues.extend(location::validate(&raw));
        issues.extend(rack::validate(&raw));
        issues.extend(device_model::validate(&raw));
        issues.extend(device::validate(&raw));
        issues.extend(placement::validate(&raw));

        issues
    }
}
