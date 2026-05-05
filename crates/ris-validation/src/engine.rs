use std::path::Path;

use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::{loader, RepositoryIndex};

use crate::helpers::issue;
use crate::validators::{general, placement, rack, repository};

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

        // Phase 2: load data
        let data = match loader::load(repo_path) {
            Ok(d) => d,
            Err(e) => {
                issues.push(issue(
                    "VAL-LOAD-000",
                    ValidationLevel::Error,
                    &format!("Failed to load repository: {e}"),
                ));
                return issues;
            }
        };

        // Phase 3: metadata
        repository::validate_metadata(&data.metadata.format, &data.metadata.version, &mut issues);

        // Phase 4: build index
        let index = RepositoryIndex::build(&data);

        // Phase 5: domain validators
        issues.extend(general::validate(&data));
        issues.extend(rack::validate(&data, &index));
        issues.extend(placement::validate(&data, &index));

        issues
    }
}
