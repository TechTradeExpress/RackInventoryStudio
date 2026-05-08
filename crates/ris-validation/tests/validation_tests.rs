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
fn invalid_uuid_reports_val_gen_002() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-002"),
        "expected VAL-GEN-002, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn invalid_code_format_reports_val_gen_005() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-005"),
        "expected VAL-GEN-005, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn duplicate_id_reports_val_gen_006() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-GEN-006"),
        "expected VAL-GEN-006, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn tags_not_a_list_reports_val_gen_008() {
    let issues = ValidationEngine::validate(&fixture("val-gen-008-tags-not-list"));
    assert!(
        has_code(&issues, "VAL-GEN-008"),
        "expected VAL-GEN-008, got: {:?}",
        issues
            .iter()
            .map(|i| (&i.code, &i.message))
            .collect::<Vec<_>>()
    );
}

#[test]
fn tags_with_non_string_item_reports_val_gen_008() {
    let issues = ValidationEngine::validate(&fixture("val-gen-008-tags-non-string"));
    assert!(
        has_code(&issues, "VAL-GEN-008"),
        "expected VAL-GEN-008, got: {:?}",
        issues
            .iter()
            .map(|i| (&i.code, &i.message))
            .collect::<Vec<_>>()
    );
}

// --- location validation ---

#[test]
fn missing_locations_yaml_reports_val_loc_001() {
    let issues = ValidationEngine::validate(&fixture("missing-locations"));
    assert!(
        has_code(&issues, "VAL-LOC-001"),
        "expected VAL-LOC-001, got: {:?}",
        issues
            .iter()
            .map(|i| (&i.code, &i.message))
            .collect::<Vec<_>>()
    );
}

// --- rack validation ---

#[test]
fn unknown_location_id_reports_val_rack_002() {
    let issues = ValidationEngine::validate(&fixture("invalid-repository"));
    assert!(
        has_code(&issues, "VAL-RACK-002"),
        "expected VAL-RACK-002, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn rack_height_u_invalid_string_reports_val_rack_005() {
    let issues = ValidationEngine::validate(&fixture("val-rack-005-height-invalid"));
    assert!(
        has_code(&issues, "VAL-RACK-005"),
        "expected VAL-RACK-005, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn rack_height_u_negative_reports_val_rack_005() {
    let issues = ValidationEngine::validate(&fixture("val-rack-005-height-negative"));
    assert!(
        has_code(&issues, "VAL-RACK-005"),
        "expected VAL-RACK-005, got: {:?}",
        errors(&issues)
    );
}

// --- device_model validation ---

#[test]
fn invalid_model_device_type_reports_val_model_002() {
    let issues = ValidationEngine::validate(&fixture("val-model-002"));
    assert!(
        has_code(&issues, "VAL-MODEL-002"),
        "expected VAL-MODEL-002, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn model_default_height_u_invalid_string_reports_val_model_005() {
    let issues = ValidationEngine::validate(&fixture("val-model-005-height-invalid"));
    assert!(
        has_code(&issues, "VAL-MODEL-005"),
        "expected VAL-MODEL-005, got: {:?}",
        errors(&issues)
    );
}

// --- device validation ---

#[test]
fn rack_object_in_device_file_reports_val_dev_002() {
    let issues = ValidationEngine::validate(&fixture("val-dev-002"));
    assert!(
        has_code(&issues, "VAL-DEV-002"),
        "expected VAL-DEV-002, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_missing_status_reports_val_dev_004() {
    let issues = ValidationEngine::validate(&fixture("val-dev-004"));
    assert!(
        has_code(&issues, "VAL-DEV-004"),
        "expected VAL-DEV-004, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_invalid_status_reports_val_dev_006() {
    let issues = ValidationEngine::validate(&fixture("val-dev-006"));
    assert!(
        has_code(&issues, "VAL-DEV-006"),
        "expected VAL-DEV-006, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_unknown_model_reports_val_dev_007() {
    let issues = ValidationEngine::validate(&fixture("val-dev-007"));
    assert!(
        has_code(&issues, "VAL-DEV-007"),
        "expected VAL-DEV-007, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_type_mismatch_reports_val_dev_008() {
    let issues = ValidationEngine::validate(&fixture("val-dev-008"));
    assert!(
        has_code(&issues, "VAL-DEV-008"),
        "expected VAL-DEV-008, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_rack_object_model_reports_val_dev_009() {
    let issues = ValidationEngine::validate(&fixture("val-dev-009"));
    assert!(
        has_code(&issues, "VAL-DEV-009"),
        "expected VAL-DEV-009, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn duplicate_serial_reports_val_dev_010() {
    let issues = ValidationEngine::validate(&fixture("val-dev-010"));
    assert!(
        has_code(&issues, "VAL-DEV-010"),
        "expected VAL-DEV-010, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn installed_without_placement_reports_val_dev_014() {
    let issues = ValidationEngine::validate(&fixture("val-dev-014"));
    assert!(
        has_code(&issues, "VAL-DEV-014"),
        "expected VAL-DEV-014, got: {:?}",
        issues
            .iter()
            .map(|i| (&i.code, &i.message))
            .collect::<Vec<_>>()
    );
}

// --- placement validation ---

#[test]
fn placement_missing_rack_id_reports_val_plc_001() {
    let issues = ValidationEngine::validate(&fixture("val-plc-001"));
    assert!(
        has_code(&issues, "VAL-PLC-001"),
        "expected VAL-PLC-001, got: {:?}",
        errors(&issues)
    );
}

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

#[test]
fn placement_invalid_target_kind_reports_val_plc_006() {
    let issues = ValidationEngine::validate(&fixture("val-plc-006"));
    assert!(
        has_code(&issues, "VAL-PLC-006"),
        "expected VAL-PLC-006, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn non_rack_object_as_device_model_target_reports_val_plc_008() {
    let issues = ValidationEngine::validate(&fixture("val-plc-008"));
    assert!(
        has_code(&issues, "VAL-PLC-008"),
        "expected VAL-PLC-008, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_zero_start_u_reports_val_plc_009() {
    let issues = ValidationEngine::validate(&fixture("val-plc-009"));
    assert!(
        has_code(&issues, "VAL-PLC-009"),
        "expected VAL-PLC-009, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_invalid_start_u_string_reports_val_plc_009() {
    let issues = ValidationEngine::validate(&fixture("val-plc-009-start-invalid"));
    assert!(
        has_code(&issues, "VAL-PLC-009"),
        "expected VAL-PLC-009, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_zero_height_u_reports_val_plc_010() {
    let issues = ValidationEngine::validate(&fixture("val-plc-010"));
    assert!(
        has_code(&issues, "VAL-PLC-010"),
        "expected VAL-PLC-010, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_invalid_height_u_string_reports_val_plc_010() {
    let issues = ValidationEngine::validate(&fixture("val-plc-010-height-invalid"));
    assert!(
        has_code(&issues, "VAL-PLC-010"),
        "expected VAL-PLC-010, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn placement_no_effective_height_reports_val_plc_011() {
    let issues = ValidationEngine::validate(&fixture("val-plc-011"));
    assert!(
        has_code(&issues, "VAL-PLC-011"),
        "expected VAL-PLC-011, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn device_placed_multiple_times_reports_val_plc_014() {
    let issues = ValidationEngine::validate(&fixture("val-plc-014"));
    assert!(
        has_code(&issues, "VAL-PLC-014"),
        "expected VAL-PLC-014, got: {:?}",
        errors(&issues)
    );
}

#[test]
fn height_override_differs_from_default_reports_val_plc_015() {
    let issues = ValidationEngine::validate(&fixture("val-plc-015"));
    let plc015: Vec<_> = issues.iter().filter(|i| i.code == "VAL-PLC-015").collect();
    assert!(
        !plc015.is_empty(),
        "expected VAL-PLC-015, got: {:?}",
        issues
            .iter()
            .map(|i| (&i.code, &i.message))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        plc015[0].level,
        ValidationLevel::Warning,
        "VAL-PLC-015 should be Warning, got {:?}",
        plc015[0].level
    );
}
