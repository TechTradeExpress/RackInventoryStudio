use std::path::Path;

use ris_application::{
    open_repository, validate_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput,
    AddRackInput,
};
use ris_core::{DeviceStatus, DeviceType, ValidationLevel};
use ris_import::CsvRowAction;

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

fn copy_dir_all(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).unwrap();
    for entry in std::fs::read_dir(src).unwrap().filter_map(|e| e.ok()) {
        let ty = entry.file_type().unwrap();
        let dst_entry = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst_entry);
        } else {
            std::fs::copy(entry.path(), &dst_entry).unwrap();
        }
    }
}

// ── open_repository ───────────────────────────────────────────────────────────

#[test]
fn open_repository_loads_valid_fixture() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    assert!(!session.data.locations.is_empty());
    assert!(!session.data.racks.is_empty());
    assert!(!session.data.device_models.is_empty());
    assert!(!session.data.devices.is_empty());
}

#[test]
fn open_repository_builds_index() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    assert!(session.index.get_rack_by_code("rack-main").is_some());
    assert!(session
        .index
        .get_location_by_code("server-room-a")
        .is_some());
    assert!(session.index.get_device_by_code("srv-01").is_some());
    assert!(session
        .index
        .get_device_model_by_code("dell-r650")
        .is_some());
}

// ── validate_repository ───────────────────────────────────────────────────────

#[test]
fn validate_repository_clean_on_valid_fixture() {
    let issues = validate_repository(&fixture("valid-repository")).unwrap();
    let errors: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(errors.is_empty(), "unexpected errors: {errors:?}");
}

#[test]
fn validate_repository_returns_errors_on_invalid_fixture() {
    let issues = validate_repository(&fixture("invalid-repository")).unwrap();
    assert!(
        issues.iter().any(|i| i.level == ValidationLevel::Error),
        "expected at least one ERROR in invalid-repository"
    );
}

#[test]
fn session_validate_clean_on_valid_fixture() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let issues = session.validate();
    let errors: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(errors.is_empty(), "unexpected errors: {errors:?}");
}

// ── save ──────────────────────────────────────────────────────────────────────

#[test]
fn save_then_reload_persists_added_location() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    let initial_count = session.list_locations().len();

    session
        .add_location(AddLocationInput {
            id: None,
            code: "new-room".to_string(),
            name: "New Room".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let session2 = open_repository(tmp.path()).unwrap();
    assert_eq!(session2.list_locations().len(), initial_count + 1);
    assert!(session2.index.get_location_by_code("new-room").is_some());
}

#[test]
fn second_save_is_unchanged() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .add_location(AddLocationInput {
            id: None,
            code: "another-room".to_string(),
            name: "Another Room".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();

    let first = session.save().unwrap();
    assert!(
        first.created.len() + first.updated.len() > 0,
        "first save should write something"
    );

    let second = session.save().unwrap();
    assert!(second.created.is_empty());
    assert!(second.updated.is_empty());
    assert!(!second.unchanged.is_empty());
}

// ── query helpers ─────────────────────────────────────────────────────────────

#[test]
fn list_helpers_return_expected_counts() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    assert_eq!(session.list_locations().len(), 1);
    assert_eq!(session.list_racks().len(), 1);
    assert_eq!(session.list_devices().len(), 1);
    // servers.yaml (1 model) + rack-objects.yaml (1 model) = 2
    assert_eq!(session.list_device_models().len(), 2);
}

#[test]
fn get_unplaced_devices_empty_when_all_placed() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    // srv-01 has a placement in rack-main
    assert!(
        session.get_unplaced_devices().is_empty(),
        "srv-01 is placed, should not appear in unplaced list"
    );
}

#[test]
fn get_placements_for_rack_returns_all_placements() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let rack = session.index.get_rack_by_code("rack-main").unwrap();
    let placements = session.get_placements_for_rack(&rack.id);
    // rack-main.yaml: 2 front + 1 rear = 3 placements
    assert_eq!(placements.len(), 3);
}

// ── add_location ──────────────────────────────────────────────────────────────

#[test]
fn add_location_success_increases_count() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let initial = session.list_locations().len();
    session
        .add_location(AddLocationInput {
            id: None,
            code: "room-b".to_string(),
            name: "Room B".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_locations().len(), initial + 1);
    assert!(session.index.get_location_by_code("room-b").is_some());
}

#[test]
fn add_location_duplicate_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_location(AddLocationInput {
            id: None,
            code: "server-room-a".to_string(),
            name: "Duplicate".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateCode(_)),
        "expected DuplicateCode, got {err:?}"
    );
}

// ── add_rack ──────────────────────────────────────────────────────────────────

#[test]
fn add_rack_success_increases_count_and_creates_placement_file() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let initial_racks = session.list_racks().len();
    let initial_pf = session.data.placement_files.len();

    session
        .add_rack(AddRackInput {
            id: None,
            location_id: None,
            location_code: Some("server-room-a".to_string()),
            code: "rack-b02".to_string(),
            name: "Rack B02".to_string(),
            height_u: 42,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();

    assert_eq!(session.list_racks().len(), initial_racks + 1);
    assert_eq!(session.data.placement_files.len(), initial_pf + 1);
}

#[test]
fn add_rack_unknown_location_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_rack(AddRackInput {
            id: None,
            location_id: None,
            location_code: Some("nonexistent-location".to_string()),
            code: "rack-x".to_string(),
            name: "Rack X".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn add_rack_duplicate_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_rack(AddRackInput {
            id: None,
            location_id: None,
            location_code: Some("server-room-a".to_string()),
            code: "rack-main".to_string(),
            name: "Rack Main Dup".to_string(),
            height_u: 42,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::DuplicateCode(_)
    ));
}

#[test]
fn add_rack_zero_height_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_rack(AddRackInput {
            id: None,
            location_id: None,
            location_code: Some("server-room-a".to_string()),
            code: "rack-zero".to_string(),
            name: "Rack Zero".to_string(),
            height_u: 0,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::InvalidInput(_)
    ));
}

#[test]
fn add_rack_save_reload_preserves_rack_and_placement_file() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .add_rack(AddRackInput {
            id: Some("12341234-1234-1234-1234-123412341234".to_string()),
            location_id: None,
            location_code: Some("server-room-a".to_string()),
            code: "rack-saved".to_string(),
            name: "Rack Saved".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let session2 = open_repository(tmp.path()).unwrap();
    assert_eq!(session2.list_racks().len(), 2);
    assert!(session2.index.get_rack_by_code("rack-saved").is_some());
    assert_eq!(session2.data.placement_files.len(), 2);
}

// ── add_device_model ──────────────────────────────────────────────────────────

#[test]
fn add_device_model_success_increases_count() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let initial = session.list_device_models().len();
    session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Network,
            code: "cisco-sw-01".to_string(),
            name: "Cisco Switch".to_string(),
            vendor: Some("Cisco".to_string()),
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_device_models().len(), initial + 1);
    assert!(session
        .index
        .get_device_model_by_code("cisco-sw-01")
        .is_some());
}

#[test]
fn add_device_model_duplicate_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: "dell-r650".to_string(),
            name: "Duplicate".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::DuplicateCode(_)
    ));
}

#[test]
fn add_device_model_zero_height_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: "zero-model".to_string(),
            name: "Zero Height".to_string(),
            vendor: None,
            model: None,
            default_height_u: 0,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::InvalidInput(_)
    ));
}

#[test]
fn add_device_model_save_reload_preserves_model() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Storage,
            code: "netapp-a300".to_string(),
            name: "NetApp AFF A300".to_string(),
            vendor: Some("NetApp".to_string()),
            model: None,
            default_height_u: 2,
            description: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let session2 = open_repository(tmp.path()).unwrap();
    assert!(session2
        .index
        .get_device_model_by_code("netapp-a300")
        .is_some());
}

// ── add_device ────────────────────────────────────────────────────────────────

#[test]
fn add_device_success_increases_count() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let initial = session.list_devices().len();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-02".to_string(),
            name: Some("Server 02".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_devices().len(), initial + 1);
}

#[test]
fn add_device_appears_in_unplaced_list() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-unplaced".to_string(),
            name: Some("Unplaced Server".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let unplaced = session.get_unplaced_devices();
    assert!(unplaced.iter().any(|d| d.code == "srv-unplaced"));
}

#[test]
fn add_device_duplicate_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-01".to_string(),
            name: Some("Dup".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Unknown,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::DuplicateCode(_)
    ));
}

#[test]
fn add_device_missing_identity_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-no-identity".to_string(),
            name: None,
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Unknown,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::InvalidInput(_)
    ));
}

#[test]
fn add_device_model_type_mismatch_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // dell-r650 is device_type=server; registering as network device should fail
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Network,
            code: "net-mismatch".to_string(),
            name: Some("Net Dev".to_string()),
            device_model_id: None,
            device_model_code: Some("dell-r650".to_string()),
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Unknown,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::InvalidInput(_)
    ));
}

#[test]
fn add_device_rack_object_type_rejected() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::RackObject,
            code: "ro-inst".to_string(),
            name: Some("Rack Object Instance".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Unknown,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::InvalidInput(_)
    ));
}

#[test]
fn add_device_duplicate_serial_number_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // srv-01 already has serial SRV001
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-dup-sn".to_string(),
            name: Some("Dup Serial".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("SRV001".to_string()),
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Unknown,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::DuplicateSerialNumber(_)
    ));
}

#[test]
fn add_device_save_reload_preserves_device() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-persisted".to_string(),
            name: Some("Persisted Server".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("PERSIST-001".to_string()),
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let session2 = open_repository(tmp.path()).unwrap();
    assert!(session2.index.get_device_by_code("srv-persisted").is_some());
    let dev = session2.index.get_device_by_code("srv-persisted").unwrap();
    assert_eq!(dev.serial_number.as_deref(), Some("PERSIST-001"));
    assert_eq!(dev.status, DeviceStatus::InStock);
}

// ── CSV preview ───────────────────────────────────────────────────────────────

#[test]
fn csv_preview_valid_row_returns_create_action() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let csv = "code,device_type,status,name\nnew-srv-01,server,in_stock,New Server\n";
    let preview = session.preview_devices_csv(csv);
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
    assert!(preview.issues.is_empty());
}

#[test]
fn csv_preview_existing_code_returns_error() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    // srv-01 already exists in the repository
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Duplicate\n";
    let preview = session.preview_devices_csv(csv);
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].action, CsvRowAction::SkipDueToError);
}

#[test]
fn csv_preview_does_not_mutate_session() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let initial_count = session.list_devices().len();
    let csv = "code,device_type,status,name\nnew-srv-99,server,in_stock,New Server\n";
    let _preview = session.preview_devices_csv(csv);
    assert_eq!(session.list_devices().len(), initial_count);
}

// ── cross-type global duplicate id protection ─────────────────────────────────

#[test]
fn add_location_with_existing_device_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let device_id = session.list_devices()[0].id.clone();
    let err = session
        .add_location(AddLocationInput {
            id: Some(device_id),
            code: "cross-type-loc".to_string(),
            name: "Cross Type Location".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_rack_with_existing_location_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let location_id = session.list_locations()[0].id.clone();
    let err = session
        .add_rack(AddRackInput {
            id: Some(location_id),
            location_code: Some("server-room-a".to_string()),
            location_id: None,
            code: "cross-type-rack".to_string(),
            name: "Cross Type Rack".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_device_model_with_existing_rack_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: Some(rack_id),
            device_type: DeviceType::Server,
            code: "cross-type-model".to_string(),
            name: "Cross Type Model".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_device_with_existing_model_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let model_id = session.list_device_models()[0].id.clone();
    let err = session
        .add_device(AddDeviceInput {
            id: Some(model_id),
            device_type: DeviceType::Server,
            code: "cross-type-dev".to_string(),
            name: Some("Cross Type Device".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

// ── per-type duplicate id protection ─────────────────────────────────────────

#[test]
fn add_location_duplicate_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let existing_id = session.list_locations()[0].id.clone();
    let err = session
        .add_location(AddLocationInput {
            id: Some(existing_id.clone()),
            code: "room-dup-id".to_string(),
            name: "Room Dup ID".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_rack_duplicate_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let existing_id = session.list_racks()[0].id.clone();
    let err = session
        .add_rack(AddRackInput {
            id: Some(existing_id.clone()),
            location_code: Some("server-room-a".to_string()),
            location_id: None,
            code: "rack-dup-id".to_string(),
            name: "Rack Dup ID".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_device_model_duplicate_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let existing_id = session.list_device_models()[0].id.clone();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: Some(existing_id.clone()),
            device_type: DeviceType::Server,
            code: "model-dup-id".to_string(),
            name: "Model Dup ID".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

#[test]
fn add_device_duplicate_id_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let existing_id = session.list_devices()[0].id.clone();
    let err = session
        .add_device(AddDeviceInput {
            id: Some(existing_id.clone()),
            device_type: DeviceType::Server,
            code: "dev-dup-id".to_string(),
            name: Some("Dev Dup ID".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateId(_)),
        "expected DuplicateId, got {err:?}"
    );
}

// ── blank required field rejection ───────────────────────────────────────────

#[test]
fn add_location_empty_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_location(AddLocationInput {
            id: None,
            code: "  ".to_string(),
            name: "Valid Name".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_location_empty_name_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_location(AddLocationInput {
            id: None,
            code: "valid-code".to_string(),
            name: "".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_rack_empty_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_rack(AddRackInput {
            id: None,
            location_code: Some("server-room-a".to_string()),
            location_id: None,
            code: "".to_string(),
            name: "Valid Name".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_rack_empty_name_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_rack(AddRackInput {
            id: None,
            location_code: Some("server-room-a".to_string()),
            location_id: None,
            code: "rack-blank-name".to_string(),
            name: "   ".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_device_model_empty_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: "".to_string(),
            name: "Valid Name".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_device_model_empty_name_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: "valid-code".to_string(),
            name: "  ".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_device_empty_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "".to_string(),
            name: Some("Valid Name".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn add_device_blank_identity_fields_fail() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // name, serial_number, and asset_tag are all blank — should reject
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-blank-identity".to_string(),
            name: Some("  ".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("".to_string()),
            asset_tag: Some("   ".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

// ── duplicate asset_tag ───────────────────────────────────────────────────────

#[test]
fn add_device_duplicate_asset_tag_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // add a device with a known asset tag first
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-with-at".to_string(),
            name: Some("Server With Asset Tag".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: Some("ASSET-001".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    // second device with the same asset tag must fail
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: "srv-dup-at".to_string(),
            name: Some("Server Dup Asset Tag".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: Some("ASSET-001".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateAssetTag(_)),
        "expected DuplicateAssetTag, got {err:?}"
    );
}
