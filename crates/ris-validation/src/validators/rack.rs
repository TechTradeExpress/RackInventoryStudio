use ris_core::{ValidationIssue, ValidationLevel};
use ris_repository::{RepositoryData, RepositoryIndex};

use crate::helpers::issue_for;

pub fn validate(data: &RepositoryData, index: &RepositoryIndex) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    for rack in &data.racks {
        if !index.locations_by_id.contains_key(&rack.location_id) {
            issues.push(issue_for(
                "VAL-RACK-001",
                ValidationLevel::Error,
                &format!(
                    "rack '{}' references unknown location_id '{}'",
                    rack.code, rack.location_id
                ),
                "rack",
                &rack.id,
                &rack.code,
            ));
        }
    }

    issues
}
