/// MVP Smoke Test
///
/// Automated backend/application-layer equivalent of the manual
/// docs/MVP_SMOKE_TEST_CHECKLIST_EN.md. Covers the core non-Git
/// inventory workflow end-to-end using a temp copy of the valid fixture.
use std::path::Path;

use ris_application::{
    open_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput, AddRackInput,
    MovePlacementToTargetInput, PlaceDeviceInput, PlaceRackObjectInput, RemovePlacementInput,
};
use ris_core::{DeviceStatus, DeviceType, PlacementSide, ValidationLevel};
use ris_import::CsvRowAction;

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── full MVP flow smoke test ──────────────────────────────────────────────────

#[test]
fn mvp_smoke_full_workflow() {
    let tmp = tempfile::TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());

    // ── 1. Open repository ────────────────────────────────────────────────────
    let mut session = open_repository(tmp.path()).unwrap();
    let initial_locations = session.list_locations().len();
    let initial_racks = session.list_racks().len();
    let initial_models = session.list_device_models().len();
    let initial_devices = session.list_devices().len();

    // ── 2. Add location ───────────────────────────────────────────────────────
    let loc_id = session
        .add_location(AddLocationInput {
            id: None,
            code: Some("smoke-dc".to_string()),
            name: "Smoke Data Center".to_string(),
            description: None,
            address: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_locations().len(), initial_locations + 1);
    assert!(session.index.get_location_by_code("smoke-dc").is_some());

    // ── 3. Add rack ───────────────────────────────────────────────────────────
    let rack_id = session
        .add_rack(AddRackInput {
            id: None,
            location_id: Some(loc_id.clone()),
            location_code: None,
            code: Some("smoke-rack-01".to_string()),
            name: "Smoke Rack 01".to_string(),
            height_u: 42,
            row: None,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_racks().len(), initial_racks + 1);
    assert!(session.index.get_rack_by_code("smoke-rack-01").is_some());

    // ── 4. Add device model (server, 2U) ──────────────────────────────────────
    session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("smoke-server-model".to_string()),
            name: "Smoke Server Model".to_string(),
            vendor: None,
            model: None,
            default_height_u: 2,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_device_models().len(), initial_models + 1);
    assert!(session
        .index
        .get_device_model_by_code("smoke-server-model")
        .is_some());

    // ── 5. Add rack_object device model (1U) ──────────────────────────────────
    session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type: DeviceType::RackObject,
            code: Some("smoke-patch".to_string()),
            name: "Smoke Patch Panel".to_string(),
            vendor: None,
            model: None,
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_device_models().len(), initial_models + 2);
    assert!(session
        .index
        .get_device_model_by_code("smoke-patch")
        .is_some());

    // ── 6. Add concrete device manually ──────────────────────────────────────
    let manual_dev_id = session
        .add_device(AddDeviceInput {
            id: None,
            device_type: DeviceType::Server,
            code: Some("smoke-srv-01".to_string()),
            name: Some("Smoke Server 01".to_string()),
            device_model_id: None,
            device_model_code: Some("smoke-server-model".to_string()),
            serial_number: Some("SMOKE-SN-001".to_string()),
            asset_tag: None,
            external_ref: None,
            status: DeviceStatus::Planned,
            description: None,
            tags: vec![],
        })
        .unwrap();
    assert_eq!(session.list_devices().len(), initial_devices + 1);
    assert!(session.index.get_device_by_code("smoke-srv-01").is_some());
    // should be unplaced
    assert!(session
        .get_unplaced_devices()
        .iter()
        .any(|d| d.id == manual_dev_id));

    // ── 7. Preview valid CSV (2 new devices) ──────────────────────────────────
    let csv = concat!(
        "device_type,status,name\n",
        "server,in_stock,Smoke CSV Server 01\n",
        "network,planned,Smoke CSV Switch 01\n",
    );
    let preview = session.preview_devices_csv(csv);
    assert_eq!(preview.rows.len(), 2);
    assert!(preview.issues.is_empty(), "unexpected file-level issues");
    assert!(preview
        .rows
        .iter()
        .all(|r| r.action == CsvRowAction::Create));
    // preview must not mutate session
    assert_eq!(session.list_devices().len(), initial_devices + 1);

    // ── 8. Import CSV ─────────────────────────────────────────────────────────
    let import_result = session.import_devices_csv(csv).unwrap();
    assert_eq!(import_result.created_count, 2);
    assert_eq!(session.list_devices().len(), initial_devices + 3);
    // Codes are auto-generated; verify by name instead
    let csv01_id = session
        .data
        .devices
        .iter()
        .find(|d| d.name.as_deref() == Some("Smoke CSV Server 01"))
        .map(|d| d.id.clone())
        .expect("CSV server 01 must exist");
    assert!(session
        .data
        .devices
        .iter()
        .any(|d| d.name.as_deref() == Some("Smoke CSV Switch 01")));
    // imported devices are unplaced
    assert!(session
        .get_unplaced_devices()
        .iter()
        .any(|d| d.id == csv01_id));

    // ── 9. Place manually added device (front U5) ─────────────────────────────
    let plc_manual_id = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: Some("smoke-plc-srv-01".to_string()),
            rack_id: Some(rack_id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: Some(manual_dev_id.clone()),
            device_code: None,
            start_u: 5,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();
    assert!(!plc_manual_id.is_empty());
    // device is no longer unplaced
    assert!(!session
        .get_unplaced_devices()
        .iter()
        .any(|d| d.id == manual_dev_id));

    // ── 10. Place CSV-imported device (front U10) ─────────────────────────────
    // smoke-csv-01 has no device model, so height_u must be explicit.
    let plc_csv01_id = session
        .place_device(PlaceDeviceInput {
            id: None,
            code: Some("smoke-plc-csv-01".to_string()),
            rack_id: Some(rack_id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: Some(csv01_id.clone()),
            device_code: None,
            start_u: 10,
            height_u: Some(2),
            note: None,
            tags: vec![],
        })
        .unwrap();
    assert!(!plc_csv01_id.is_empty());

    // ── 11. Place rack object (front U1) ──────────────────────────────────────
    let plc_patch_id = session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: Some("smoke-plc-patch".to_string()),
            rack_id: Some(rack_id.clone()),
            rack_code: None,
            side: PlacementSide::Front,
            device_model_id: None,
            device_model_code: Some("smoke-patch".to_string()),
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();
    assert!(!plc_patch_id.is_empty());

    // front side should have 3 placements in smoke-rack-01
    let front_before_move = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();
    assert_eq!(front_before_move, 3);

    // ── 12. Move manual device placement (front U5 → rear U1) ─────────────────
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: Some(plc_manual_id.clone()),
            placement_code: None,
            new_rack_id: None,
            new_side: Some(PlacementSide::Rear),
            new_start_u: 1,
            new_height_u: None,
        })
        .unwrap();
    // moved to rear; front loses 1
    let front_after_move = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();
    assert_eq!(front_after_move, 2);
    let rear_after_move = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Rear)
        .len();
    assert_eq!(rear_after_move, 1);
    // placement is at U1 rear
    let moved_ip = session
        .index
        .get_placement_by_code("smoke-plc-srv-01")
        .unwrap();
    assert_eq!(moved_ip.placement.start_u, 1);
    assert_eq!(moved_ip.side, PlacementSide::Rear);

    // ── 13. Remove CSV device placement ───────────────────────────────────────
    session
        .remove_placement(RemovePlacementInput {
            placement_id: Some(plc_csv01_id),
            placement_code: None,
        })
        .unwrap();
    // front now has 1 (patch only)
    let front_after_remove = session
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();
    assert_eq!(front_after_remove, 1);
    // csv-01 is unplaced again
    assert!(session
        .get_unplaced_devices()
        .iter()
        .any(|d| d.id == csv01_id));

    // ── 14. Validate — no errors on smoke objects ─────────────────────────────
    let issues = session.validate();
    let smoke_errors: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .filter(|i| {
            i.object_code
                .as_deref()
                .map(|c| c.starts_with("smoke-"))
                .unwrap_or(false)
        })
        .collect();
    assert!(
        smoke_errors.is_empty(),
        "unexpected errors for smoke objects: {smoke_errors:?}"
    );

    // ── 15. Save ──────────────────────────────────────────────────────────────
    session.save().unwrap();

    // ── 16. Reload and verify persistence ────────────────────────────────────
    let s2 = open_repository(tmp.path()).unwrap();

    // catalog entities persist
    assert!(s2.index.get_location_by_code("smoke-dc").is_some());
    assert!(s2.index.get_rack_by_code("smoke-rack-01").is_some());
    assert!(s2
        .index
        .get_device_model_by_code("smoke-server-model")
        .is_some());
    assert!(s2.index.get_device_model_by_code("smoke-patch").is_some());
    assert!(s2.index.get_device_by_code("smoke-srv-01").is_some());
    // CSV-imported devices have auto-generated codes; verify by name
    assert!(s2.data.devices.iter().any(|d| d.name.as_deref() == Some("Smoke CSV Server 01")));
    assert!(s2.data.devices.iter().any(|d| d.name.as_deref() == Some("Smoke CSV Switch 01")));

    // placement state persists:
    // front: 1 (patch), rear: 1 (srv-01 at U1)
    let front_final = s2
        .get_rack_side_placements(&rack_id, &PlacementSide::Front)
        .len();
    let rear_final = s2
        .get_rack_side_placements(&rack_id, &PlacementSide::Rear)
        .len();
    assert_eq!(front_final, 1, "front should have 1 placement after reload");
    assert_eq!(rear_final, 1, "rear should have 1 placement after reload");

    // srv-01 is at rear U1
    let srv_ip = s2.index.get_placement_by_code("smoke-plc-srv-01").unwrap();
    assert_eq!(srv_ip.side, PlacementSide::Rear);
    assert_eq!(srv_ip.placement.start_u, 1);

    // removed placement stays removed
    assert!(
        s2.index.get_placement_by_code("smoke-plc-csv-01").is_none(),
        "removed placement must not reappear after reload"
    );

    // csv-01 device is still present but unplaced (identified by the saved id)
    assert!(s2.data.devices.iter().any(|d| d.id == csv01_id));
    let unplaced2: Vec<_> = s2.get_unplaced_devices();
    assert!(
        unplaced2.iter().any(|d| d.id == csv01_id),
        "csv server 01 should be unplaced after reload"
    );
}

// ── negative CSV smoke coverage ───────────────────────────────────────────────

#[test]
fn mvp_smoke_invalid_csv_preview_has_errors() {
    let session = open_repository(&fixture("valid-repository")).unwrap();
    let csv = concat!(
        "code,device_type,status,name\n",
        // missing required 'status' value via invalid device type
        "bad-device,INVALID_TYPE,,\n",
    );
    let preview = session.preview_devices_csv(csv);
    assert!(
        preview
            .rows
            .iter()
            .any(|r| r.action == CsvRowAction::SkipDueToError),
        "bad row should be SkipDueToError"
    );
}

#[test]
fn mvp_smoke_import_invalid_csv_rejects_and_does_not_mutate() {
    let session_ro = open_repository(&fixture("valid-repository")).unwrap();
    let initial_count = session_ro.list_devices().len();
    // Need a mutable session for import attempt
    let mut session = open_repository(&fixture("valid-repository")).unwrap();
    let csv = concat!(
        "code,device_type,status,name\n",
        "bad-import,rack_object,planned,Should Fail\n",
    );
    let result = session.import_devices_csv(csv);
    assert!(result.is_err(), "import of rack_object device should fail");
    assert_eq!(
        session.list_devices().len(),
        initial_count,
        "failed import must not mutate device count"
    );
}
