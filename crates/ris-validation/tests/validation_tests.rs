use std::path::Path;

use ris_core::ValidationLevel;
use ris_validation::ValidationEngine;

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

fn errors(issues: &[ris_core::ValidationIssue]) -> Vec<&str> {
    issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .map(|i| i.code.as_str())
        .collect()
}

fn has_code(issues: &[ris_core::ValidationIssue], code: &str) -> bool {
    issues.iter().any(|i| i.code == code)
}

// --- valid repository ---

#[test]
fn valid_repository_loads_without_errors() {
    let issues = ValidationEngine::validate(&fixture("valid-repository"));
    let errs: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errs.is_empty(),
        "expected no errors, got: {:#?}",
        errs.iter().map(|i| &i.message).collect::<Vec<_>>()
    );
}

#[test]
fn valid_repository_loads_example_repo() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/example-repository");
    let issues = ValidationEngine::validate(&path);
    let errs: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errs.is_empty(),
        "expected no errors in example-repository, got: {:#?}",
        errs.iter().map(|i| &i.message).collect::<Vec<_>>()
    );
}

// --- repo.yaml checks ---

#[test]
fn missing_repo_yaml_reports_val_repo_001() {
    // use a temp dir that has no inventory/repo.yaml
    let tmp = std::env::temp_dir().join("ris-test-missing-repo");
    std::fs::create_dir_all(&tmp).unwrap();
    let issues = ValidationEngine::validate(&tmp);
    assert!(
        has_code(&issues, "VAL-REPO-001"),
        "expected VAL-REPO-001, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn wrong_version_reports_val_repo_003() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-REPO-003"),
        "expected VAL-REPO-003, got: {:?}",
        errors(&issues)
    );
}

// --- general validation ---

#[test]
fn invalid_uuid_reports_val_gen_001() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-001"),
        "expected VAL-GEN-001, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn invalid_code_format_reports_val_gen_003() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-003"),
        "expected VAL-GEN-003, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn duplicate_id_reports_val_gen_002() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-002"),
        "expected VAL-GEN-002, got: {:?}",
        errors(&issues)
    );
}

// --- rack validation ---

#[test]
fn unknown_location_id_reports_val_rack_001() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-RACK-001"),
        "expected VAL-RACK-001, got: {:?}",
        errors(&issues)
    );
}

// --- placement validation ---

#[test]
fn placement_outside_rack_reports_val_plc_012() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-PLC-012"),
        "expected VAL-PLC-012, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_collision_reports_val_plc_013() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-PLC-013"),
        "expected VAL-PLC-013, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_missing_device_reports_val_plc_007() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-PLC-007"),
        "expected VAL-PLC-007, got: {:?}",
        errors(&issues)
    );
}
