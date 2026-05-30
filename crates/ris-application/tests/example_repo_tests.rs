/// Structural integrity tests for the example repository in examples/example-repository/.
///
/// These tests verify that the hand-authored demo data satisfies the minimum
/// shape required for beta QA: enough locations, racks, models, and devices,
/// with a mix of placed and unplaced devices and no fatal validation errors.
use std::path::Path;

use ris_application::{open_repository, validate_repository};
use ris_core::ValidationLevel;
use ris_import::CsvRowAction;

fn example_repo() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/example-repository")
}

#[test]
fn example_repo_opens_successfully() {
    open_repository(&example_repo()).expect("example repository should open without error");
}

#[test]
fn example_repo_has_minimum_locations() {
    let session = open_repository(&example_repo()).unwrap();
    assert!(
        session.list_locations().len() >= 3,
        "expected ≥3 locations, got {}",
        session.list_locations().len()
    );
}

#[test]
fn example_repo_has_minimum_racks() {
    let session = open_repository(&example_repo()).unwrap();
    assert!(
        session.list_racks().len() >= 5,
        "expected ≥5 racks, got {}",
        session.list_racks().len()
    );
}

#[test]
fn example_repo_has_minimum_device_models() {
    let session = open_repository(&example_repo()).unwrap();
    assert!(
        session.list_device_models().len() >= 15,
        "expected ≥15 device models, got {}",
        session.list_device_models().len()
    );
}

#[test]
fn example_repo_has_minimum_devices() {
    let session = open_repository(&example_repo()).unwrap();
    assert!(
        session.list_devices().len() >= 50,
        "expected ≥50 devices, got {}",
        session.list_devices().len()
    );
}

#[test]
fn example_repo_has_both_placed_and_unplaced_devices() {
    let session = open_repository(&example_repo()).unwrap();
    let unplaced = session.get_unplaced_devices();
    let total = session.list_devices().len();
    assert!(
        !unplaced.is_empty(),
        "expected some unplaced devices, got none"
    );
    assert!(
        unplaced.len() < total,
        "expected some placed devices, but all {} devices are unplaced",
        total
    );
}

#[test]
fn example_repo_has_multiple_locations_with_racks() {
    let session = open_repository(&example_repo()).unwrap();
    let locations_with_racks = session
        .list_locations()
        .iter()
        .filter(|loc| session.list_racks().iter().any(|r| r.location_id == loc.id))
        .count();
    assert!(
        locations_with_racks >= 2,
        "expected ≥2 locations with racks, got {}",
        locations_with_racks
    );
}

#[test]
fn example_repo_csv_preview_no_unknown_column_warning() {
    let session = open_repository(&example_repo()).unwrap();
    let csv_path = example_repo().join("inventory/examples/devices-import-example.csv");
    let csv_content =
        std::fs::read_to_string(&csv_path).expect("devices-import-example.csv should be readable");

    let preview = session.preview_devices_csv(&csv_content);

    assert_eq!(
        preview.rows.len(),
        4,
        "expected 4 preview rows, got {}",
        preview.rows.len()
    );

    let has_val_csv_002 = preview.issues.iter().any(|i| i.code == "VAL-CSV-002");
    assert!(
        !has_val_csv_002,
        "unexpected VAL-CSV-002 warning — CSV still contains an unknown column"
    );

    let error_rows: Vec<_> = preview
        .rows
        .iter()
        .filter(|r| r.action == CsvRowAction::SkipDueToError)
        .collect();
    assert!(
        error_rows.is_empty(),
        "expected all rows to be Create, but {} row(s) have SkipDueToError",
        error_rows.len()
    );
}

#[test]
fn example_repo_has_no_fatal_validation_errors() {
    let issues = validate_repository(&example_repo())
        .expect("validate_repository should not fail on example repo");
    let errors: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "example repository has {} validation error(s):\n{}",
        errors.len(),
        errors
            .iter()
            .map(|e| format!("  - [{}] {}", e.code, e.message))
            .collect::<Vec<_>>()
            .join("\n")
    );
}
