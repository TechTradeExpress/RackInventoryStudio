use std::path::Path;

use ris_core::{ValidationIssue, ValidationLevel};

use crate::helpers::issue;

pub fn validate_structure(repo_path: &Path) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let inv = repo_path.join("inventory");

    if !inv.join("repo.yaml").exists() {
        issues.push(issue(
            "VAL-REPO-001",
            ValidationLevel::Error,
            "inventory/repo.yaml not found",
        ));
        return issues; // no point continuing
    }

    issues
}

pub fn validate_metadata(format: &str, version: &str, issues: &mut Vec<ValidationIssue>) {
    if format != "rack-inventory-studio" {
        issues.push(issue(
            "VAL-REPO-002",
            ValidationLevel::Error,
            &format!("repo.yaml: expected format 'rack-inventory-studio', got '{format}'"),
        ));
    }
    if version != "0.1" {
        issues.push(issue(
            "VAL-REPO-003",
            ValidationLevel::Error,
            &format!("repo.yaml: expected version '0.1', got '{version}'"),
        ));
    }
}

pub fn validate_directories(repo_path: &Path, issues: &mut Vec<ValidationIssue>) {
    let inv = repo_path.join("inventory");
    let required = [
        ("inventory/locations.yaml", inv.join("locations.yaml")),
        ("inventory/racks/", inv.join("racks")),
        ("inventory/device-models/", inv.join("device-models")),
        ("inventory/devices/", inv.join("devices")),
        ("inventory/placements/", inv.join("placements")),
    ];
    for (label, path) in &required {
        if !path.exists() {
            issues.push(issue(
                "VAL-REPO-004",
                ValidationLevel::Error,
                &format!("required path missing: {label}"),
            ));
        }
    }
}
