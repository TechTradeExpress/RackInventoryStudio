use std::path::Path;

use ris_application::{
    open_repository, validate_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput,
    AddRackInput, MovePlacementInput, PlaceDeviceInput, PlaceRackObjectInput, RemovePlacementInput,
};
use ris_core::{DeviceStatus, DeviceType, PlacementSide, ValidationLevel};
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

// ── helpers ───────────────────────────────────────────────────────────────────

fn new_server(code: &str) -> AddDeviceInput {
    AddDeviceInput {
        id: None,
        device_type: DeviceType::Server,
        code: code.to_string(),
        name: Some(code.to_string()),
        device_model_id: None,
        device_model_code: Some("dell-r650".to_string()),
        serial_number: None,
        asset_tag: None,
        external_ref: None,
        status: DeviceStatus::InStock,
        description: None,
        tags: vec![],
    }
}

fn new_server_no_model(code: &str) -> AddDeviceInput {
    AddDeviceInput {
        id: None,
        device_type: DeviceType::Server,
        code: code.to_string(),
        name: Some(code.to_string()),
        device_model_id: None,
        device_model_code: None,
        serial_number: None,
        asset_tag: None,
        external_ref: None,
        status: DeviceStatus::InStock,
        description: None,
        tags: vec![],
    }
}

// ── place_device ──────────────────────────────────────────────────────────────

#[test]
fn place_device_success() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let dev_id = session.add_device(new_server("srv-new")).unwrap();

    let pid = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id.clone()),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();

    assert!(!pid.is_empty());
    let unplaced = session.get_unplaced_devices();
    assert!(
        !unplaced.iter().any(|d| d.id == dev_id),
        "device should no longer be unplaced"
    );
}

#[test]
fn place_device_unknown_device_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some("nonexistent-id".into()),
            device_code: None,
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn place_device_already_placed_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // srv-01 is already placed at front U10
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: None,
            device_code: Some("srv-01".into()),
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(
            err,
            ris_application::ApplicationError::DeviceAlreadyPlaced(_)
        ),
        "expected DeviceAlreadyPlaced, got {err:?}"
    );
}

#[test]
fn place_device_outside_rack_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // rack-main is 42U; start_u=42 height_u=2 → end_u=43 > 42
    let dev_id = session.add_device(new_server("srv-oob")).unwrap();
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id),
            device_code: None,
            start_u: 42,
            height_u: Some(2),
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::OutOfRackBounds(_)),
        "expected OutOfRackBounds, got {err:?}"
    );
}

#[test]
fn place_device_collision_same_side_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // front U10 is already occupied by srv-01 (1U via model default)
    let dev_id = session.add_device(new_server("srv-collide")).unwrap();
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id),
            device_code: None,
            start_u: 10,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::Collision(_)),
        "expected Collision, got {err:?}"
    );
}

#[test]
fn place_device_same_u_opposite_side_allowed() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // front U20 is occupied (blank panel); rear U20 is free — placing on rear U20 must succeed
    let dev_id = session.add_device(new_server("srv-rear-u20")).unwrap();
    let result = session.place_device(PlaceDeviceInput {
        id: None,
        code: None,
        rack_id: None,
        rack_code: Some("rack-main".into()),
        side: PlacementSide::Rear,
        device_id: Some(dev_id),
        device_code: None,
        start_u: 20,
        height_u: None,
        note: None,
        tags: vec![],
    });
    assert!(
        result.is_ok(),
        "placing on rear at a front-occupied U should succeed, got {:?}",
        result.err()
    );
}

#[test]
fn place_device_without_model_requires_height_u() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let dev_id = session
        .add_device(new_server_no_model("srv-nomodel"))
        .unwrap();

    // no height_u and no model → EffectiveHeightMissing
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id.clone()),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(
            err,
            ris_application::ApplicationError::EffectiveHeightMissing(_)
        ),
        "expected EffectiveHeightMissing, got {err:?}"
    );

    // with explicit height_u it must succeed
    let result = session.place_device(PlaceDeviceInput {
        id: None,
        code: None,
        rack_id: None,
        rack_code: Some("rack-main".into()),
        side: PlacementSide::Front,
        device_id: Some(dev_id),
        device_code: None,
        start_u: 1,
        height_u: Some(2),
        note: None,
        tags: vec![],
    });
    assert!(
        result.is_ok(),
        "with explicit height_u should succeed: {:?}",
        result.err()
    );
}

#[test]
fn place_device_save_reload_preserves_placement() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    let dev_id = session.add_device(new_server("srv-persist-plc")).unwrap();
    let pid = session
        .place_device(PlaceDeviceInput {
            id: Some("a1a1a1a1-0000-0000-0000-000000000001".into()),
            code: Some("plc-srv-persist-plc".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id.clone()),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let s2 = open_repository(tmp.path()).unwrap();
    let ip = s2
        .index
        .get_placement_by_id(&pid)
        .expect("placement not found after reload");
    assert_eq!(ip.placement.start_u, 1);
    assert_eq!(ip.placement.target_id, dev_id);
}

#[test]
fn place_device_blank_placement_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let dev_id = session.add_device(new_server("srv-blank-code")).unwrap();
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: Some("   ".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn place_device_duplicate_placement_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let dev_id = session.add_device(new_server("srv-dup-code")).unwrap();
    // plc-srv-01 is an existing placement code in the fixture
    let err = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: Some("plc-srv-01".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_id: Some(dev_id),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateCode(_)),
        "expected DuplicateCode, got {err:?}"
    );
}

// ── place_rack_object ─────────────────────────────────────────────────────────

#[test]
fn place_rack_object_success() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let pid = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("blank-1u".into()),
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();
    assert!(!pid.is_empty());
    let rack_id = session.list_racks()[0].id.clone();
    let front = session.get_rack_side_placements(&rack_id, &PlacementSide::Front);
    assert!(
        front.iter().any(|p| p.id == pid),
        "new placement should appear in front side"
    );
}

#[test]
fn place_rack_object_non_rack_object_model_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // dell-r650 is device_type=server, not rack_object
    let err = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("dell-r650".into()),
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidTargetKind(_)),
        "expected InvalidTargetKind, got {err:?}"
    );
}

#[test]
fn place_rack_object_unknown_model_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("nonexistent-model".into()),
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn place_rack_object_collision_blocked() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // front U10 is occupied by srv-01 (1U); placing rack_object at U10 front must collide
    let err = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: None,
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("blank-1u".into()),
            start_u: 10,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::Collision(_)),
        "expected Collision, got {err:?}"
    );
}

#[test]
fn place_rack_object_save_reload_preserves_placement() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    let pid = session
        .place_rack_object(PlaceRackObjectInput {
            id: Some("b2b2b2b2-0000-0000-0000-000000000002".into()),
            code: Some("plc-blank-persist".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Rear,
            device_model_id: None,
            device_model_code: Some("blank-1u".into()),
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let s2 = open_repository(tmp.path()).unwrap();
    let ip = s2
        .index
        .get_placement_by_id(&pid)
        .expect("placement not found after reload");
    assert_eq!(ip.placement.start_u, 1);
    assert_eq!(ip.side, PlacementSide::Rear);
}

#[test]
fn place_rack_object_blank_placement_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: Some("".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("blank-1u".into()),
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::InvalidInput(_)),
        "expected InvalidInput, got {err:?}"
    );
}

#[test]
fn place_rack_object_duplicate_placement_code_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // plc-blank-front is an existing placement code in the fixture
    let err = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: Some("plc-blank-front".into()),
            rack_id: None,
            rack_code: Some("rack-main".into()),
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("blank-1u".into()),
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateCode(_)),
        "expected DuplicateCode, got {err:?}"
    );
}

// ── move_placement_within_side ────────────────────────────────────────────────

#[test]
fn move_placement_success() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // move plc-blank-rear from U10 to U1
    session
        .move_placement_within_side(MovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let rack_id = session.list_racks()[0].id.clone();
    let rear = session.get_rack_side_placements(&rack_id, &PlacementSide::Rear);
    let moved = rear.iter().find(|p| p.code == "plc-blank-rear").unwrap();
    assert_eq!(moved.start_u, 1);
}

#[test]
fn move_placement_blocked_by_collision() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // move plc-blank-front (front U20) to front U10 → collides with plc-srv-01
    let err = session
        .move_placement_within_side(MovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_start_u: 10,
            new_height_u: None,
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::Collision(_)),
        "expected Collision, got {err:?}"
    );
}

#[test]
fn move_placement_blocked_outside_rack() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // rack-main is 42U; start_u=42 new_height_u=2 → end_u=43 > 42
    let err = session
        .move_placement_within_side(MovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_start_u: 42,
            new_height_u: Some(2),
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::OutOfRackBounds(_)),
        "expected OutOfRackBounds, got {err:?}"
    );
}

#[test]
fn move_placement_target_kind_and_id_unchanged() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let before = session
        .index
        .get_placement_by_code("plc-srv-01")
        .unwrap()
        .placement
        .clone();

    session
        .move_placement_within_side(MovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-srv-01".into()),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let after = session
        .index
        .get_placement_by_code("plc-srv-01")
        .unwrap()
        .placement
        .clone();

    assert_eq!(before.target_kind, after.target_kind);
    assert_eq!(before.target_id, after.target_id);
    assert_eq!(after.start_u, 1);
}

#[test]
fn move_placement_save_reload_preserves_new_start_u() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .move_placement_within_side(MovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_start_u: 5,
            new_height_u: None,
        })
        .unwrap();
    session.save().unwrap();

    let s2 = open_repository(tmp.path()).unwrap();
    let ip = s2
        .index
        .get_placement_by_code("plc-blank-rear")
        .expect("placement not found after reload");
    assert_eq!(ip.placement.start_u, 5);
}

// ── remove_placement ──────────────────────────────────────────────────────────

#[test]
fn remove_placement_success() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let front_before = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();

    session
        .remove_placement(RemovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
        })
        .unwrap();

    let front_after = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();
    assert_eq!(front_after, front_before - 1);
    assert!(session
        .index
        .get_placement_by_code("plc-blank-front")
        .is_none());
}

#[test]
fn remove_placement_device_becomes_unplaced() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let srv = session.index.get_device_by_code("srv-01").unwrap().clone();
    assert!(
        session.get_unplaced_devices().is_empty(),
        "srv-01 should be placed initially"
    );

    session
        .remove_placement(RemovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-srv-01".into()),
        })
        .unwrap();

    let unplaced = session.get_unplaced_devices();
    assert!(
        unplaced.iter().any(|d| d.id == srv.id),
        "srv-01 should be unplaced after its placement is removed"
    );
}

#[test]
fn remove_placement_unknown_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .remove_placement(RemovePlacementInput {
            placement_id: Some("nonexistent-placement".into()),
            placement_code: None,
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn remove_placement_save_reload_preserves_removal() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    session
        .remove_placement(RemovePlacementInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
        })
        .unwrap();
    session.save().unwrap();

    let s2 = open_repository(tmp.path()).unwrap();
    assert!(
        s2.index.get_placement_by_code("plc-blank-front").is_none(),
        "removed placement should not appear after reload"
    );
}

// ── rack without placement file ───────────────────────────────────────────────

#[test]
fn place_into_rack_without_placement_file_creates_file_in_memory() {
    // no-placement-files-repository: rack-a has NO placement file in the YAML
    let mut session = open_repository(&fixture("no-placement-files-repository")).unwrap();
    let rack = session.list_racks()[0].clone();
    assert!(
        session.data.placement_files.is_empty(),
        "fixture should have no placement files"
    );

    session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: Some(rack.id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: None,
            device_code: Some("srv-a".into()),
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap();

    assert!(
        session
            .data
            .placement_files
            .iter()
            .any(|pf| pf.rack_id == rack.id),
        "placement file should have been created in memory"
    );
}

#[test]
fn place_into_rack_without_placement_file_save_reload_works() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("no-placement-files-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let pid = session
        .place_device(PlaceDeviceInput {
            id: Some("c3c3c3c3-0000-0000-0000-000000000003".into()),
            code: Some("plc-srv-a".into()),
            rack_id: Some(rack_id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: None,
            device_code: Some("srv-a".into()),
            start_u: 1,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap();
    session.save().unwrap();

    let s2 = open_repository(tmp.path()).unwrap();
    let ip = s2
        .index
        .get_placement_by_id(&pid)
        .expect("placement not found after save/reload");
    assert_eq!(ip.placement.start_u, 1);
    assert_eq!(ip.rack_id, rack_id);
}
