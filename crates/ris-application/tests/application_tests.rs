use std::path::Path;

use ris_application::{
    open_repository, validate_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput,
    AddRackInput, MovePlacementInput, MovePlacementToTargetInput, PlaceDeviceInput,
    PlaceRackObjectInput, RemovePlacementInput, UpdateDeviceInput, UpdateDeviceModelInput,
    UpdateLocationInput, UpdateRackInput,
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
            code: Some("new-room".to_string()),
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
            code: Some("another-room".to_string()),
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
            code: Some("room-b".to_string()),
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
            code: Some("server-room-a".to_string()),
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
            code: Some("rack-b02".to_string()),
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
            code: Some("rack-x".to_string()),
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
            code: Some("rack-main".to_string()),
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
            code: Some("rack-zero".to_string()),
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
            code: Some("rack-saved".to_string()),
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
            code: Some("cisco-sw-01".to_string()),
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
            code: Some("dell-r650".to_string()),
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
            code: Some("zero-model".to_string()),
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
            code: Some("netapp-a300".to_string()),
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
            code: Some("srv-02".to_string()),
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
            code: Some("srv-unplaced".to_string()),
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
            code: Some("srv-01".to_string()),
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
            code: Some("srv-no-identity".to_string()),
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
            code: Some("net-mismatch".to_string()),
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
            code: Some("ro-inst".to_string()),
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
            code: Some("srv-dup-sn".to_string()),
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
            code: Some("srv-persisted".to_string()),
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
            code: Some("cross-type-loc".to_string()),
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
            code: Some("cross-type-rack".to_string()),
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
            code: Some("cross-type-model".to_string()),
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
            code: Some("cross-type-dev".to_string()),
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
            code: Some("room-dup-id".to_string()),
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
            code: Some("rack-dup-id".to_string()),
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
            code: Some("model-dup-id".to_string()),
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
            code: Some("dev-dup-id".to_string()),
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

// ── code generation ───────────────────────────────────────────────────────────

#[test]
fn add_location_without_code_generates_unique_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_location(AddLocationInput {
            id: None,
            code: None,
            name: "Generated Location".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    let loc = session.index.locations_by_id.get(&id).unwrap();
    assert!(!loc.code.is_empty(), "generated code must be non-empty");
    assert!(
        loc.code.starts_with("location-"),
        "generated code should start with 'location-'"
    );
}

#[test]
fn add_location_with_blank_code_generates_unique_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_location(AddLocationInput {
            id: None,
            code: Some("  ".to_string()),
            name: "Generated Location 2".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    let loc = session.index.locations_by_id.get(&id).unwrap();
    assert!(!loc.code.is_empty(), "generated code must be non-empty");
}

#[test]
fn add_location_empty_name_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_location(AddLocationInput {
            id: None,
            code: Some("valid-code".to_string()),
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
fn add_rack_without_code_generates_unique_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_rack(AddRackInput {
            id: None,
            location_code: Some("server-room-a".to_string()),
            location_id: None,
            code: None,
            name: "Generated Rack".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let rack = session.index.racks_by_id.get(&id).unwrap();
    assert!(!rack.code.is_empty(), "generated code must be non-empty");
    assert!(
        rack.code.contains("rack-"),
        "generated rack code should contain 'rack-'"
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
            code: Some("rack-blank-name".to_string()),
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
fn add_device_model_without_code_generates_unique_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: "Generated Model".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let model = session.index.device_models_by_id.get(&id).unwrap();
    assert!(!model.code.is_empty(), "generated code must be non-empty");
    assert!(
        model.code.starts_with("model-server-"),
        "generated server model code should start with 'model-server-'"
    );
}

#[test]
fn add_device_model_empty_name_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("valid-code".to_string()),
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
fn add_device_without_code_generates_unique_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("Generated Device".to_string()),
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
    let device = session.index.devices_by_id.get(&id).unwrap();
    assert!(!device.code.is_empty(), "generated code must be non-empty");
    assert!(
        device.code.starts_with("device-"),
        "generated device code should start with 'device-'"
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
            code: Some("srv-blank-identity".to_string()),
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
            code: Some("srv-with-at".to_string()),
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
            code: Some("srv-dup-at".to_string()),
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
        code: Some(code.to_string()),
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
        code: Some(code.to_string()),
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

// ── move_placement (full: same rack, cross-side, cross-rack) ──────────────────

fn add_rack_b(session: &mut ris_application::RepositorySession) -> String {
    session
        .add_rack(AddRackInput {
            id: None,
            location_id: None,
            location_code: Some("server-room-a".to_string()),
            code: Some("rack-b".to_string()),
            name: "Rack B".to_string(),
            height_u: 42,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap()
}

#[test]
fn move_placement_same_rack_same_side() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // plc-blank-rear is on rack-main rear at U10 — move it to U1
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: None,
            new_side: None,
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let ip = session
        .index
        .get_placement_by_code("plc-blank-rear")
        .unwrap();
    assert_eq!(ip.placement.start_u, 1);
    assert_eq!(ip.side, PlacementSide::Rear);
    let rack_id = session.list_racks()[0].id.clone();
    assert_eq!(ip.rack_id, rack_id);
}

#[test]
fn move_placement_same_rack_front_to_rear() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // plc-blank-front is on rack-main front U20 — move it to rear U1
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_rack_id: None,
            new_side: Some(PlacementSide::Rear),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let ip = session
        .index
        .get_placement_by_code("plc-blank-front")
        .unwrap();
    assert_eq!(ip.placement.start_u, 1);
    assert_eq!(ip.side, PlacementSide::Rear);
}

#[test]
fn move_placement_rack_to_rack() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_b_id = add_rack_b(&mut session);

    // plc-blank-rear is on rack-main rear — move it to rack-b front U1
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: Some(rack_b_id.clone()),
            new_side: Some(PlacementSide::Front),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let ip = session
        .index
        .get_placement_by_code("plc-blank-rear")
        .unwrap();
    assert_eq!(ip.rack_id, rack_b_id);
    assert_eq!(ip.side, PlacementSide::Front);
    assert_eq!(ip.placement.start_u, 1);

    // placement no longer in rack-main
    let rack_main_id = session
        .index
        .get_rack_by_code("rack-main")
        .unwrap()
        .id
        .clone();
    let rack_main_placements = session.get_placements_for_rack(&rack_main_id);
    assert!(
        !rack_main_placements
            .iter()
            .any(|ip| ip.placement.code == "plc-blank-rear"),
        "placement should not remain in rack-main after cross-rack move"
    );
}

#[test]
fn move_placement_overlap_on_destination_rejected() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // Move plc-blank-front (front U20) to front U10 where plc-srv-01 already is
    let err = session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_rack_id: None,
            new_side: None,
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
fn move_placement_missing_placement_rejected() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .move_placement(MovePlacementToTargetInput {
            placement_id: Some("nonexistent".into()),
            placement_code: None,
            new_rack_id: None,
            new_side: None,
            new_start_u: 1,
            new_height_u: Some(1),
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn move_placement_missing_destination_rack_rejected() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: Some("nonexistent-rack".into()),
            new_side: None,
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::NotFound(_)),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn move_placement_out_of_bounds_on_destination_rejected() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // rack-main is 42U; start_u=42, height=2 → end_u=43 > 42
    let err = session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: None,
            new_side: None,
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
fn move_placement_rack_to_rack_save_reload_persists() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    let mut session = open_repository(tmp.path()).unwrap();
    let rack_b_id = add_rack_b(&mut session);

    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: Some(rack_b_id.clone()),
            new_side: Some(PlacementSide::Front),
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
    assert_eq!(ip.rack_id, rack_b_id);
    assert_eq!(ip.side, PlacementSide::Front);
    assert_eq!(ip.placement.start_u, 5);
}

// ── placement counts (front / rear / total) ───────────────────────────────────

fn get_counts(session: &ris_application::RepositorySession, rack_id: &str) -> (usize, usize) {
    session
        .data
        .placement_files
        .iter()
        .find(|pf| pf.rack_id == rack_id)
        .map(|pf| (pf.front.len(), pf.rear.len()))
        .unwrap_or((0, 0))
}

#[test]
fn placement_counts_initial_fixture() {
    // valid-repository: rack-main has 2 front, 1 rear in the fixture
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let (front, rear) = get_counts(&session, &rack_id);
    assert_eq!(front, 2);
    assert_eq!(rear, 1);
}

#[test]
fn placement_counts_after_place_device_front() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let (front_before, rear_before) = get_counts(&session, &rack_id);

    let dev_id = session.add_device(new_server("srv-new-count")).unwrap();
    session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: Some(rack_id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: Some(dev_id),
            device_code: None,
            start_u: 30,
            height_u: Some(1),
            note: None,
            tags: vec![],
        })
        .unwrap();

    let (front_after, rear_after) = get_counts(&session, &rack_id);
    assert_eq!(front_after, front_before + 1);
    assert_eq!(rear_after, rear_before);
}

#[test]
fn placement_counts_after_remove_placement() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let (front_before, rear_before) = get_counts(&session, &rack_id);

    let ip = session
        .index
        .get_placement_by_code("plc-blank-front")
        .unwrap();
    let pid = ip.placement.id.clone();
    session
        .remove_placement(RemovePlacementInput {
            placement_id: Some(pid),
            placement_code: None,
        })
        .unwrap();

    let (front_after, rear_after) = get_counts(&session, &rack_id);
    assert_eq!(front_after, front_before - 1);
    assert_eq!(rear_after, rear_before);
}

#[test]
fn placement_counts_after_move_same_side_unchanged() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let (front_before, rear_before) = get_counts(&session, &rack_id);

    // move plc-blank-front to a different slot on the same side
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_rack_id: None,
            new_side: None,
            new_start_u: 5,
            new_height_u: None,
        })
        .unwrap();

    let (front_after, rear_after) = get_counts(&session, &rack_id);
    assert_eq!(front_after, front_before);
    assert_eq!(rear_after, rear_before);
}

#[test]
fn placement_counts_after_move_front_to_rear() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_id = session.list_racks()[0].id.clone();
    let (front_before, rear_before) = get_counts(&session, &rack_id);

    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-front".into()),
            new_rack_id: None,
            new_side: Some(PlacementSide::Rear),
            new_start_u: 5,
            new_height_u: None,
        })
        .unwrap();

    let (front_after, rear_after) = get_counts(&session, &rack_id);
    assert_eq!(front_after, front_before - 1);
    assert_eq!(rear_after, rear_before + 1);
}

#[test]
fn placement_counts_after_cross_rack_move() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack_a_id = session.list_racks()[0].id.clone();
    let rack_b_id = add_rack_b(&mut session);

    let (front_a_before, rear_a_before) = get_counts(&session, &rack_a_id);

    // move plc-blank-rear from rack-a to rack-b front
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: None,
            placement_code: Some("plc-blank-rear".into()),
            new_rack_id: Some(rack_b_id.clone()),
            new_side: Some(PlacementSide::Front),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();

    let (front_a_after, rear_a_after) = get_counts(&session, &rack_a_id);
    let (front_b_after, rear_b_after) = get_counts(&session, &rack_b_id);

    // rack-a rear loses one
    assert_eq!(front_a_after, front_a_before);
    assert_eq!(rear_a_after, rear_a_before - 1);
    // rack-b front gains one
    assert_eq!(front_b_after, 1);
    assert_eq!(rear_b_after, 0);
}

// ── import_devices_csv ────────────────────────────────────────────────────────

const VALID_CSV: &str = "code,device_type,status,name,serial_number\n\
srv-import-01,server,in_stock,Import Server One,SN-IMP-001\n\
srv-import-02,server,planned,Import Server Two,SN-IMP-002\n";

const INVALID_CSV_MISSING_HEADER: &str = "code,status,name\nsrv-x,in_stock,No Type\n";

const INVALID_CSV_ERROR_ROW: &str = "device_type,status\n\
not_a_real_type,in_stock\n";

#[test]
fn import_devices_csv_valid_creates_devices() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let before = session.data.devices.len();
    let result = session.import_devices_csv(VALID_CSV).unwrap();
    assert_eq!(result.created_count, 2);
    assert_eq!(session.data.devices.len(), before + 2);
    assert!(session.index.get_device_by_code("srv-import-01").is_some());
    assert!(session.index.get_device_by_code("srv-import-02").is_some());
}

#[test]
fn import_devices_csv_save_reload_persists_devices() {
    let tmp = tempfile::tempdir().unwrap();
    let dst = tmp.path().join("repo");
    copy_dir_all(&fixture("valid-repository"), &dst);
    let mut session = open_repository(&dst).unwrap();
    session.import_devices_csv(VALID_CSV).unwrap();
    session.save().unwrap();
    let reloaded = open_repository(&dst).unwrap();
    assert!(reloaded.index.get_device_by_code("srv-import-01").is_some());
    assert!(reloaded.index.get_device_by_code("srv-import-02").is_some());
}

#[test]
fn import_devices_csv_rejects_missing_required_header() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let before = session.data.devices.len();
    let err = session
        .import_devices_csv(INVALID_CSV_MISSING_HEADER)
        .unwrap_err();
    assert!(
        err.to_string().contains("errors"),
        "expected error message, got: {err}"
    );
    assert_eq!(
        session.data.devices.len(),
        before,
        "session must not be mutated"
    );
}

#[test]
fn import_devices_csv_rejects_error_row() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let before = session.data.devices.len();
    let err = session
        .import_devices_csv(INVALID_CSV_ERROR_ROW)
        .unwrap_err();
    assert!(
        err.to_string().contains("errors"),
        "expected error message, got: {err}"
    );
    assert_eq!(
        session.data.devices.len(),
        before,
        "session must not be mutated"
    );
}

#[test]
fn import_devices_csv_rejects_existing_code() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // srv-01 already exists in the fixture
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Dup\n";
    let before = session.data.devices.len();
    let err = session.import_devices_csv(csv).unwrap_err();
    assert!(err.to_string().contains("errors"), "{err}");
    assert_eq!(session.data.devices.len(), before);
}

#[test]
fn import_devices_csv_rejects_rack_object_type() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let csv = "code,device_type,status,name\nrobj-new,rack_object,in_stock,Rack Obj\n";
    let before = session.data.devices.len();
    let err = session.import_devices_csv(csv).unwrap_err();
    assert!(err.to_string().contains("errors"), "{err}");
    assert_eq!(session.data.devices.len(), before);
}

// ── update_location ───────────────────────────────────────────────────────────

#[test]
fn update_location_changes_name_and_preserves_id() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let loc = session
        .index
        .get_location_by_code("server-room-a")
        .unwrap()
        .clone();
    session
        .update_location(UpdateLocationInput {
            id: loc.id.clone(),
            name: "Renamed Room".to_string(),
            description: Some("desc".to_string()),
            address: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_location_by_code("server-room-a").unwrap();
    assert_eq!(updated.id, loc.id);
    assert_eq!(updated.name, "Renamed Room");
}

#[test]
fn update_location_code_is_preserved() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let loc = session
        .index
        .get_location_by_code("server-room-a")
        .unwrap()
        .clone();
    let original_code = loc.code.clone();
    session
        .update_location(UpdateLocationInput {
            id: loc.id.clone(),
            name: "Renamed Room".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_location_by_code(&original_code).unwrap();
    assert_eq!(
        updated.code, original_code,
        "code must remain unchanged after update"
    );
}

#[test]
fn update_location_not_found_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .update_location(UpdateLocationInput {
            id: "nonexistent-id".to_string(),
            name: "Name".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::NotFound(_)
    ));
}

// ── delete_location ───────────────────────────────────────────────────────────

#[test]
fn delete_location_succeeds_when_unreferenced() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_location(AddLocationInput {
            id: None,
            code: Some("empty-room".to_string()),
            name: "Empty Room".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    let before = session.list_locations().len();
    session.delete_location(&id).unwrap();
    assert_eq!(session.list_locations().len(), before - 1);
    assert!(session.index.get_location_by_code("empty-room").is_none());
}

#[test]
fn delete_location_fails_when_racks_reference_it() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let loc = session
        .index
        .get_location_by_code("server-room-a")
        .unwrap()
        .clone();
    let err = session.delete_location(&loc.id).unwrap_err();
    assert!(
        err.to_string().contains("racks still reference"),
        "unexpected error: {err}"
    );
}

#[test]
fn delete_location_not_found_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session.delete_location("no-such-id").unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::NotFound(_)
    ));
}

// ── update_rack ───────────────────────────────────────────────────────────────

#[test]
fn update_rack_changes_name_and_preserves_id() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack = session.index.get_rack_by_code("rack-main").unwrap().clone();
    let loc_id = rack.location_id.clone();
    session
        .update_rack(UpdateRackInput {
            id: rack.id.clone(),
            location_id: loc_id,
            name: "Renamed Rack".to_string(),
            height_u: rack.height_u,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_rack_by_code("rack-main").unwrap();
    assert_eq!(updated.id, rack.id);
    assert_eq!(updated.name, "Renamed Rack");
}

#[test]
fn update_rack_height_reduction_blocked_by_placements() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack = session.index.get_rack_by_code("rack-main").unwrap().clone();
    let loc_id = rack.location_id.clone();
    let err = session
        .update_rack(UpdateRackInput {
            id: rack.id.clone(),
            location_id: loc_id,
            name: rack.name.clone(),
            height_u: 1,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        err.to_string().contains("Cannot reduce rack height"),
        "unexpected error: {err}"
    );
}

#[test]
fn update_rack_code_is_preserved() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack = session.index.get_rack_by_code("rack-main").unwrap().clone();
    let original_code = rack.code.clone();
    session
        .update_rack(UpdateRackInput {
            id: rack.id.clone(),
            location_id: rack.location_id.clone(),
            name: "Renamed Rack".to_string(),
            height_u: rack.height_u,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_rack_by_code(&original_code).unwrap();
    assert_eq!(
        updated.code, original_code,
        "code must remain unchanged after update"
    );
}

// ── delete_rack ───────────────────────────────────────────────────────────────

#[test]
fn delete_rack_succeeds_when_empty() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let loc = session
        .index
        .get_location_by_code("server-room-a")
        .unwrap()
        .clone();
    let id = session
        .add_rack(AddRackInput {
            id: None,
            location_id: Some(loc.id),
            location_code: None,
            code: Some("rack-empty".to_string()),
            name: "Empty Rack".to_string(),
            height_u: 10,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let pf_before = session.data.placement_files.len();
    session.delete_rack(&id).unwrap();
    assert!(session.index.get_rack_by_code("rack-empty").is_none());
    assert_eq!(session.data.placement_files.len(), pf_before - 1);
}

#[test]
fn delete_rack_fails_when_placements_exist() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let rack = session.index.get_rack_by_code("rack-main").unwrap().clone();
    let err = session.delete_rack(&rack.id).unwrap_err();
    assert!(
        err.to_string().contains("placements still reference"),
        "unexpected error: {err}"
    );
}

// ── update_device_model ───────────────────────────────────────────────────────

#[test]
fn update_device_model_changes_name_preserves_id() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let model = session
        .index
        .get_device_model_by_code("dell-r650")
        .unwrap()
        .clone();
    session
        .update_device_model(UpdateDeviceModelInput {
            id: model.id.clone(),
            device_type: model.device_type.clone(),
            name: "Dell R650 Updated".to_string(),
            vendor: model.vendor.clone(),
            model: model.model.clone(),
            default_height_u: model.default_height_u,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_device_model_by_code("dell-r650").unwrap();
    assert_eq!(updated.id, model.id);
    assert_eq!(updated.name, "Dell R650 Updated");
}

#[test]
fn update_device_model_type_change_blocked_by_device_reference() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let model = session
        .index
        .get_device_model_by_code("dell-r650")
        .unwrap()
        .clone();
    let err = session
        .update_device_model(UpdateDeviceModelInput {
            id: model.id.clone(),
            device_type: DeviceType::Network,
            name: model.name.clone(),
            vendor: model.vendor.clone(),
            model: model.model.clone(),
            default_height_u: model.default_height_u,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        err.to_string()
            .contains("devices or rack-object placements"),
        "unexpected error: {err}"
    );
}

// ── delete_device_model ───────────────────────────────────────────────────────

#[test]
fn delete_device_model_succeeds_when_unreferenced() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Network,
            code: Some("sw-unused".to_string()),
            name: "Unused Switch".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let before = session.list_device_models().len();
    session.delete_device_model(&id).unwrap();
    assert_eq!(session.list_device_models().len(), before - 1);
}

#[test]
fn delete_device_model_fails_when_referenced_by_device() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let model = session
        .index
        .get_device_model_by_code("dell-r650")
        .unwrap()
        .clone();
    let err = session.delete_device_model(&model.id).unwrap_err();
    assert!(
        err.to_string()
            .contains("devices or rack-object placements"),
        "unexpected error: {err}"
    );
}

#[test]
fn delete_device_model_fails_when_referenced_by_placement() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let model = session
        .index
        .get_device_model_by_code("blank-1u")
        .unwrap()
        .clone();
    let err = session.delete_device_model(&model.id).unwrap_err();
    assert!(
        err.to_string()
            .contains("devices or rack-object placements"),
        "unexpected error: {err}"
    );
}

// ── update_device ─────────────────────────────────────────────────────────────

#[test]
fn update_device_changes_name_preserves_id() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let device = session.index.get_device_by_code("srv-01").unwrap().clone();
    session
        .update_device(UpdateDeviceInput {
            id: device.id.clone(),
            device_type: device.device_type.clone(),
            name: Some("Server 01 Updated".to_string()),
            device_model_id: device.device_model_id.clone(),
            serial_number: device.serial_number.clone(),
            asset_tag: device.asset_tag.clone(),
            external_ref: None,
            status: device.status.clone(),
            description: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.get_device_by_code("srv-01").unwrap();
    assert_eq!(updated.id, device.id);
    assert_eq!(updated.name.as_deref(), Some("Server 01 Updated"));
}

#[test]
fn update_device_type_change_blocked_when_placed() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let device = session.index.get_device_by_code("srv-01").unwrap().clone();
    let err = session
        .update_device(UpdateDeviceInput {
            id: device.id.clone(),
            device_type: DeviceType::Network,
            name: device.name.clone(),
            device_model_id: None,
            serial_number: device.serial_number.clone(),
            asset_tag: device.asset_tag.clone(),
            external_ref: None,
            status: device.status.clone(),
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        err.to_string().contains("currently placed"),
        "unexpected error: {err}"
    );
}

#[test]
fn update_device_code_is_preserved() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("srv-preserve-test".to_string()),
            name: Some("Server Preserve".to_string()),
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
    session
        .update_device(UpdateDeviceInput {
            id: id.clone(),
            device_type: DeviceType::Server,
            name: Some("Server Preserve Updated".to_string()),
            device_model_id: None,
            serial_number: None,
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Installed,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let updated = session.index.devices_by_id.get(&id).unwrap();
    assert_eq!(updated.code, "srv-preserve-test");
    assert_eq!(updated.name.as_deref(), Some("Server Preserve Updated"));
}

// ── identity field: external_ref only ────────────────────────────────────────

#[test]
fn add_device_with_only_external_ref_succeeds() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: None,
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: Some("EXT-ONLY-001".to_string()),
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let dev = session.index.devices_by_id.get(&id).unwrap();
    assert_eq!(dev.external_ref.as_deref(), Some("EXT-ONLY-001"));
    assert!(dev.name.is_none());
    assert!(dev.serial_number.is_none());
    assert!(dev.asset_tag.is_none());
}

#[test]
fn add_device_no_identity_fields_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: None,
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
        "expected InvalidInput, got: {err}"
    );
}

// ── identifier normalization (trim + case-insensitive) ────────────────────────

#[test]
fn add_device_serial_number_deduplication_is_case_insensitive() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("First".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("SN123".to_string()),
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("Second".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some(" sn123 ".to_string()),
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(
            err,
            ris_application::ApplicationError::DuplicateSerialNumber(_)
        ),
        "expected DuplicateSerialNumber, got: {err}"
    );
}

#[test]
fn add_device_asset_tag_deduplication_is_case_insensitive() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("First".to_string()),
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
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("Second".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: Some("asset-001".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(err, ris_application::ApplicationError::DuplicateAssetTag(_)),
        "expected DuplicateAssetTag, got: {err}"
    );
}

#[test]
fn add_device_external_ref_deduplication_is_case_insensitive_and_trims() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("First".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: Some("EXT-001".to_string()),
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    let err = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("Second".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: Some(" ext-001 ".to_string()),
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap_err();
    assert!(
        matches!(
            err,
            ris_application::ApplicationError::DuplicateExternalRef(_)
        ),
        "expected DuplicateExternalRef, got: {err}"
    );
}

#[test]
fn add_device_blank_serial_asset_external_do_not_collide() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    // Both devices have blank/whitespace-only serial, asset, external — no collision
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("First".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("   ".to_string()),
            asset_tag: Some("".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap();
    // Second device also has blank identifiers — should not collide
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: None,
            name: Some("Second".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: Some("  ".to_string()),
            asset_tag: Some("".to_string()),
            external_ref: None,
            status: DeviceStatus::InStock,
            description: None,
            tags: vec![],
        })
        .unwrap(); // must not error
}

// ── delete_device ─────────────────────────────────────────────────────────────

#[test]
fn delete_device_succeeds_when_unplaced() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("srv-unplaced".to_string()),
            name: Some("Unplaced".to_string()),
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
    let before = session.list_devices().len();
    session.delete_device(&id).unwrap();
    assert_eq!(session.list_devices().len(), before - 1);
    assert!(session.index.devices_by_id.get(&id).is_none());
}

#[test]
fn delete_device_fails_when_placed() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let device = session.index.get_device_by_code("srv-01").unwrap().clone();
    let err = session.delete_device(&device.id).unwrap_err();
    assert!(
        err.to_string().contains("placed in a rack"),
        "unexpected error: {err}"
    );
}

#[test]
fn delete_device_not_found_fails() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let err = session.delete_device("no-such-id").unwrap_err();
    assert!(matches!(
        err,
        ris_application::ApplicationError::NotFound(_)
    ));
}

// ── field-preservation tests ──────────────────────────────────────────────────

#[test]
fn update_device_preserves_external_ref_and_description_when_provided() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("srv-field-test".to_string()),
            name: Some("Field Test Server".to_string()),
            device_model_id: None,
            device_model_code: None,
            serial_number: None,
            asset_tag: None,
            external_ref: Some("EXT-001".to_string()),
            status: DeviceStatus::InStock,
            description: Some("original description".to_string()),
            tags: vec![],
        })
        .unwrap();

    // Update name only; pass through the original external_ref and description.
    session
        .update_device(UpdateDeviceInput {
            id: id.clone(),
            device_type: DeviceType::Server,
            name: Some("Field Test Server Renamed".to_string()),
            device_model_id: None,
            serial_number: None,
            asset_tag: None,
            external_ref: Some("EXT-001".to_string()),
            status: DeviceStatus::InStock,
            description: Some("original description".to_string()),
            tags: vec![],
        })
        .unwrap();

    let dev = session.index.devices_by_id.get(&id).unwrap();
    assert_eq!(dev.external_ref.as_deref(), Some("EXT-001"));
    assert_eq!(dev.description.as_deref(), Some("original description"));
    assert_eq!(dev.name.as_deref(), Some("Field Test Server Renamed"));
}

#[test]
fn update_device_model_preserves_description_when_provided() {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let id = session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Network,
            code: Some("sw-desc-test".to_string()),
            name: "Switch Desc Test".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: Some("original model description".to_string()),
            tags: vec![],
        })
        .unwrap();

    // Update vendor only; pass through the original description.
    session
        .update_device_model(UpdateDeviceModelInput {
            id: id.clone(),
            device_type: DeviceType::Network,
            name: "Switch Desc Test".to_string(),
            vendor: Some("Cisco".to_string()),
            model: None,
            default_height_u: 1,
            description: Some("original model description".to_string()),
            tags: vec![],
        })
        .unwrap();

    let model = session.index.device_models_by_id.get(&id).unwrap();
    assert_eq!(
        model.description.as_deref(),
        Some("original model description")
    );
    assert_eq!(model.vendor.as_deref(), Some("Cisco"));
}
