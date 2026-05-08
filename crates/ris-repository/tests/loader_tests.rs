use std::path::Path;

use ris_core::{DeviceType, PlacementSide};
use ris_repository::{loader, LoadError, RepositoryIndex};

fn example_repo() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/example-repository")
}

fn valid_fixture() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/valid-repository")
}

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

// --- loading ---

#[test]
fn loads_example_repository_successfully() {
    loader::load(&example_repo()).expect("example repository should load without error");
}

#[test]
fn loads_valid_fixture_successfully() {
    loader::load(&valid_fixture()).expect("valid-repository fixture should load without error");
}

#[test]
fn loads_repo_metadata_correctly() {
    let data = loader::load(&example_repo()).unwrap();
    assert_eq!(data.metadata.id, "9ad7c7fa-1178-4c83-a678-d3fd2b482d1b");
    assert_eq!(data.metadata.code, "example-rack-inventory");
    assert_eq!(data.metadata.name, "Example Rack Inventory Repository");
    assert_eq!(data.metadata.format, "rack-inventory-studio");
    assert_eq!(data.metadata.version, "0.1");
}

#[test]
fn loads_locations() {
    let data = loader::load(&example_repo()).unwrap();
    assert_eq!(data.locations.len(), 1);
    let loc = &data.locations[0];
    assert_eq!(loc.id, "79f0b3c0-f4d3-47ad-89e1-9efae2ad5c87");
    assert_eq!(loc.code, "warsaw-serverroom-a");
    assert_eq!(loc.name, "Warszawa - Serwerownia A");
}

#[test]
fn loads_racks_and_preserves_location_id() {
    let data = loader::load(&example_repo()).unwrap();
    assert!(!data.racks.is_empty(), "should have at least one rack");
    for rack in &data.racks {
        assert_eq!(
            rack.location_id, "79f0b3c0-f4d3-47ad-89e1-9efae2ad5c87",
            "rack '{}' should reference the expected location",
            rack.code
        );
    }
    let rack_a01 = data.racks.iter().find(|r| r.code == "rack-a01").unwrap();
    assert_eq!(rack_a01.height_u, 42);
}

#[test]
fn loads_device_models_and_preserves_device_type() {
    let data = loader::load(&example_repo()).unwrap();
    assert!(!data.device_models.is_empty());

    let server_model = data
        .device_models
        .iter()
        .find(|m| m.code == "dell-r650")
        .expect("dell-r650 model should be present");
    assert_eq!(server_model.device_type, DeviceType::Server);

    let rack_obj = data
        .device_models
        .iter()
        .find(|m| m.code == "blank-panel-1u")
        .expect("blank-panel-1u model should be present");
    assert_eq!(rack_obj.device_type, DeviceType::RackObject);

    let network_model = data
        .device_models
        .iter()
        .find(|m| m.code == "cisco-c9300")
        .expect("cisco-c9300 model should be present");
    assert_eq!(network_model.device_type, DeviceType::Network);
}

#[test]
fn loads_devices_and_preserves_device_type() {
    let data = loader::load(&example_repo()).unwrap();
    assert!(!data.devices.is_empty());

    let server = data
        .devices
        .iter()
        .find(|d| d.code == "srv-db-01")
        .expect("srv-db-01 should be present");
    assert_eq!(server.device_type, DeviceType::Server);

    let network_dev = data
        .devices
        .iter()
        .find(|d| d.code == "sw-core-01")
        .expect("sw-core-01 should be present");
    assert_eq!(network_dev.device_type, DeviceType::Network);
}

#[test]
fn loads_placement_files_and_preserves_rack_id() {
    let data = loader::load(&example_repo()).unwrap();
    assert!(!data.placement_files.is_empty());

    let pf = data
        .placement_files
        .iter()
        .find(|pf| pf.rack_id == "7d73b40f-53c3-4b11-9a33-9fd5f15f72d2")
        .expect("placement file for rack-a01 should be present");

    assert!(
        !pf.front.is_empty(),
        "rack-a01 should have front placements"
    );
    assert!(!pf.rear.is_empty(), "rack-a01 should have rear placements");
}

// --- indexing ---

#[test]
fn indexes_locations_by_id_and_code() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let id = "79f0b3c0-f4d3-47ad-89e1-9efae2ad5c87";
    let code = "warsaw-serverroom-a";

    let by_id = index
        .get_location_by_id(id)
        .expect("location should be found by id");
    assert_eq!(by_id.code, code);

    let by_code = index
        .get_location_by_code(code)
        .expect("location should be found by code");
    assert_eq!(by_code.id, id);

    assert!(index.get_location_by_id("nonexistent").is_none());
    assert!(index.get_location_by_code("nonexistent").is_none());
}

#[test]
fn indexes_racks_by_id_and_code() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let id = "7d73b40f-53c3-4b11-9a33-9fd5f15f72d2";
    let code = "rack-a01";

    let by_id = index
        .get_rack_by_id(id)
        .expect("rack should be found by id");
    assert_eq!(by_id.code, code);

    let by_code = index
        .get_rack_by_code(code)
        .expect("rack should be found by code");
    assert_eq!(by_code.id, id);

    assert!(index.get_rack_by_id("nonexistent").is_none());
    assert!(index.get_rack_by_code("nonexistent").is_none());
}

#[test]
fn indexes_device_models_by_id_and_code() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let id = "4a7d5a62-36f4-4cd9-818e-66eac20351a1";
    let code = "dell-r650";

    let by_id = index
        .get_device_model_by_id(id)
        .expect("model should be found by id");
    assert_eq!(by_id.code, code);

    let by_code = index
        .get_device_model_by_code(code)
        .expect("model should be found by code");
    assert_eq!(by_code.id, id);

    assert!(index.get_device_model_by_id("nonexistent").is_none());
    assert!(index.get_device_model_by_code("nonexistent").is_none());
}

#[test]
fn indexes_devices_by_id_and_code() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let id = "9a7c5e10-3d3a-4b31-947c-7d3cba39f314";
    let code = "srv-db-01";

    let by_id = index
        .get_device_by_id(id)
        .expect("device should be found by id");
    assert_eq!(by_id.code, code);

    let by_code = index
        .get_device_by_code(code)
        .expect("device should be found by code");
    assert_eq!(by_code.id, id);

    assert!(index.get_device_by_id("nonexistent").is_none());
    assert!(index.get_device_by_code("nonexistent").is_none());
}

#[test]
fn indexes_placements_by_id_and_code() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let id = "6d0dc8e6-9c87-4b9f-8d7d-2a4bb9953e22";
    let code = "plc-srv-db-01";

    let by_id = index
        .get_placement_by_id(id)
        .expect("placement should be found by id");
    assert_eq!(by_id.placement.code, code);

    let by_code = index
        .get_placement_by_code(code)
        .expect("placement should be found by code");
    assert_eq!(by_code.placement.id, id);

    assert!(index.get_placement_by_id("nonexistent").is_none());
    assert!(index.get_placement_by_code("nonexistent").is_none());
}

#[test]
fn placements_by_rack_id_preserves_side() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    let rack_id = "7d73b40f-53c3-4b11-9a33-9fd5f15f72d2";
    let placements = index.get_placements_for_rack(rack_id);

    assert!(!placements.is_empty());

    let has_front = placements.iter().any(|p| p.side == PlacementSide::Front);
    let has_rear = placements.iter().any(|p| p.side == PlacementSide::Rear);
    assert!(has_front, "rack-a01 should have front placements");
    assert!(has_rear, "rack-a01 should have rear placements");

    // rack-a02 has empty front and rear
    let rack_a02_id = "3cc51429-4d7d-4912-ae31-94b7c2f3fb72";
    assert_eq!(index.get_placements_for_rack(rack_a02_id).len(), 0);

    assert_eq!(index.get_placements_for_rack("nonexistent").len(), 0);
}

#[test]
fn placements_by_device_id_preserves_rack_id_and_side() {
    let data = loader::load(&example_repo()).unwrap();
    let index = RepositoryIndex::build(&data);

    // srv-db-01 placed in rack-a01 front at start_u=12
    let device_id = "9a7c5e10-3d3a-4b31-947c-7d3cba39f314";
    let placements = index.get_placements_for_device(device_id);
    assert_eq!(
        placements.len(),
        1,
        "srv-db-01 should have exactly one placement"
    );

    let ip = &placements[0];
    assert_eq!(ip.rack_id, "7d73b40f-53c3-4b11-9a33-9fd5f15f72d2");
    assert_eq!(ip.side, PlacementSide::Front);
    assert_eq!(ip.placement.start_u, 12);

    // fw-edge-01 placed in rack-a01 rear
    let fw_id = "7158dccb-145b-42c0-b346-bb13f9c349d9";
    let fw_placements = index.get_placements_for_device(fw_id);
    assert_eq!(fw_placements.len(), 1);
    assert_eq!(fw_placements[0].side, PlacementSide::Rear);

    // srv-unplaced-01 has no placement
    let unplaced_id = "55de54c1-3699-4484-b20e-26b703aef4cb";
    assert_eq!(index.get_placements_for_device(unplaced_id).len(), 0);

    assert_eq!(index.get_placements_for_device("nonexistent").len(), 0);
}

// --- missing required field errors ---

#[test]
fn missing_rack_name_returns_val_rack_004() {
    let result = loader::load(&fixture("rack-missing-name"));
    match result {
        Err(LoadError::MissingField { field, code, .. }) => {
            assert_eq!(field, "name", "expected field 'name'");
            assert_eq!(code, "VAL-RACK-004");
        }
        Err(e) => panic!("expected MissingField, got: {e:?}"),
        Ok(_) => panic!("expected error, load succeeded unexpectedly"),
    }
}

#[test]
fn missing_rack_height_u_returns_val_rack_004() {
    let result = loader::load(&fixture("rack-missing-height-u"));
    match result {
        Err(LoadError::MissingField { field, code, .. }) => {
            assert_eq!(field, "height_u", "expected field 'height_u'");
            assert_eq!(code, "VAL-RACK-004");
        }
        Err(e) => panic!("expected MissingField, got: {e:?}"),
        Ok(_) => panic!("expected error, load succeeded unexpectedly"),
    }
}

#[test]
fn missing_model_name_returns_val_model_004() {
    let result = loader::load(&fixture("model-missing-name"));
    match result {
        Err(LoadError::MissingField { field, code, .. }) => {
            assert_eq!(field, "name", "expected field 'name'");
            assert_eq!(code, "VAL-MODEL-004");
        }
        Err(e) => panic!("expected MissingField, got: {e:?}"),
        Ok(_) => panic!("expected error, load succeeded unexpectedly"),
    }
}

#[test]
fn missing_model_default_height_u_returns_val_model_004() {
    let result = loader::load(&fixture("model-missing-default-height-u"));
    match result {
        Err(LoadError::MissingField { field, code, .. }) => {
            assert_eq!(
                field, "default_height_u",
                "expected field 'default_height_u'"
            );
            assert_eq!(code, "VAL-MODEL-004");
        }
        Err(e) => panic!("expected MissingField, got: {e:?}"),
        Ok(_) => panic!("expected error, load succeeded unexpectedly"),
    }
}
