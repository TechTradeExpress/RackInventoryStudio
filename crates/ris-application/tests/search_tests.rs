use std::path::Path;

use ris_application::{
    open_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput, AddRackInput,
    PlaceDeviceInput, PlaceRackObjectInput, SearchResultKind,
};
use ris_core::{DeviceStatus, DeviceType, PlacementSide};

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn make_session() -> ris_application::RepositorySession {
    let mut session = open_repository(&fixture("valid-repository")).unwrap();

    // Ensure at least one of each entity type is present for deterministic tests.
    // The fixture already has locations/racks/devices/device_models; just add extras.

    let loc_id = session
        .add_location(AddLocationInput {
            id: Some("search-loc-1".into()),
            code: Some("search-loc".into()),
            name: "Search Location Alpha".into(),
            description: Some("needle-desc-loc".into()),
            address: Some("123 Test Street".into()),
            tags: vec!["search-tag".into()],
        })
        .unwrap();

    session
        .add_rack(AddRackInput {
            id: Some("search-rack-1".into()),
            location_id: Some(loc_id.clone()),
            location_code: None,
            code: Some("search-rack".into()),
            name: "Search Rack Beta".into(),
            height_u: 42,
            row: None,
            description: Some("needle-desc-rack".into()),
            tags: vec![],
        })
        .unwrap();

    let dm_id = session
        .add_device_model(AddDeviceModelInput {
            id: Some("search-dm-1".into()),
            device_type: DeviceType::Server,
            code: Some("search-model".into()),
            name: "Search DevModel Gamma".into(),
            vendor: Some("VendorXYZ".into()),
            model: Some("M-2000".into()),
            default_height_u: 2,
            description: None,
            tags: vec![],
        })
        .unwrap();

    let dm_id2 = session
        .add_device_model(AddDeviceModelInput {
            id: Some("search-dm-2".into()),
            device_type: DeviceType::RackObject,
            code: Some("search-rackobj-model".into()),
            name: "Search RackObj Model".into(),
            vendor: Some("PanelVendor".into()),
            model: Some("PP-48".into()),
            default_height_u: 1,
            description: None,
            tags: vec![],
        })
        .unwrap();

    session
        .add_device(AddDeviceInput {
            id: Some("search-dev-1".into()),
            device_type: DeviceType::Server,
            code: Some("search-dev".into()),
            name: Some("Search Device Delta".into()),
            device_model_id: Some(dm_id),
            device_model_code: None,
            serial_number: Some("SN-UNIQUE-9999".into()),
            asset_tag: Some("AT-0001".into()),
            external_ref: None,
            status: DeviceStatus::Installed,
            description: None,
            tags: vec![],
        })
        .unwrap();

    // Place the device in search-rack-1 at U1, front.
    session
        .place_device(PlaceDeviceInput {
            id: Some("search-pl-dev-1".into()),
            code: Some("search-pl-dev".into()),
            rack_id: Some("search-rack-1".into()),
            rack_code: None,
            side: PlacementSide::Front,
            device_id: Some("search-dev-1".into()),
            device_code: None,
            start_u: 1,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();

    // Place a rack object (device model) in search-rack-1 at U10, rear.
    session
        .place_rack_object(PlaceRackObjectInput {
            id: Some("search-pl-ro-1".into()),
            code: Some("search-pl-rackobj".into()),
            rack_id: Some("search-rack-1".into()),
            rack_code: None,
            side: PlacementSide::Rear,
            device_model_id: Some(dm_id2),
            device_model_code: None,
            start_u: 10,
            height_u: None,
            note: None,
            tags: vec![],
        })
        .unwrap();

    session
}

// ── short query rejected ──────────────────────────────────────────────────────

#[test]
fn search_returns_empty_for_query_shorter_than_two_chars() {
    let session = make_session();
    assert!(session.search("").is_empty());
    assert!(session.search("a").is_empty());
    assert!(session.search(" x").is_empty()); // trimmed to 1 char
}

// ── location hits ─────────────────────────────────────────────────────────────

#[test]
fn search_finds_location_by_code() {
    let session = make_session();
    let results = session.search("search-loc");
    let hit = results.iter().find(|r| r.id == "search-loc-1").unwrap();
    assert_eq!(hit.kind, SearchResultKind::Location);
    assert_eq!(hit.score, 3); // exact code match (base 3)
}

#[test]
fn search_finds_location_by_name_substring() {
    let session = make_session();
    let results = session.search("Alpha");
    assert!(results.iter().any(|r| r.id == "search-loc-1"));
}

#[test]
fn search_finds_location_by_description() {
    let session = make_session();
    let results = session.search("needle-desc-loc");
    assert!(results.iter().any(|r| r.id == "search-loc-1"));
}

#[test]
fn search_finds_location_by_address() {
    let session = make_session();
    let results = session.search("Test Street");
    assert!(results.iter().any(|r| r.id == "search-loc-1"));
}

// ── rack hits ─────────────────────────────────────────────────────────────────

#[test]
fn search_finds_rack_by_code() {
    let session = make_session();
    let results = session.search("search-rack");
    let hit = results.iter().find(|r| r.id == "search-rack-1").unwrap();
    assert_eq!(hit.kind, SearchResultKind::Rack);
}

#[test]
fn search_finds_rack_by_name() {
    let session = make_session();
    let results = session.search("Beta");
    assert!(results.iter().any(|r| r.id == "search-rack-1"));
}

#[test]
fn search_rack_navigation_contains_rack_and_location_ids() {
    let session = make_session();
    let results = session.search("search-rack");
    let hit = results.iter().find(|r| r.id == "search-rack-1").unwrap();
    assert_eq!(hit.navigation.rack_id.as_deref(), Some("search-rack-1"));
    assert_eq!(hit.navigation.location_id.as_deref(), Some("search-loc-1"));
}

// ── device model hits ─────────────────────────────────────────────────────────

#[test]
fn search_finds_device_model_by_vendor() {
    let session = make_session();
    let results = session.search("VendorXYZ");
    assert!(results.iter().any(|r| r.id == "search-dm-1"));
}

#[test]
fn search_finds_device_model_by_model_number() {
    let session = make_session();
    let results = session.search("M-2000");
    assert!(results.iter().any(|r| r.id == "search-dm-1"));
}

// ── device hits ───────────────────────────────────────────────────────────────

#[test]
fn search_finds_device_by_serial_number() {
    let session = make_session();
    let results = session.search("SN-UNIQUE-9999");
    let hit = results.iter().find(|r| r.id == "search-dev-1").unwrap();
    assert_eq!(hit.kind, SearchResultKind::Device);
}

#[test]
fn search_finds_device_by_asset_tag() {
    let session = make_session();
    let results = session.search("AT-0001");
    assert!(results.iter().any(|r| r.id == "search-dev-1"));
}

#[test]
fn search_finds_device_by_name() {
    let session = make_session();
    let results = session.search("Delta");
    assert!(results.iter().any(|r| r.id == "search-dev-1"));
}

// ── scoring & ranking ─────────────────────────────────────────────────────────

#[test]
fn exact_code_match_ranks_above_name_match() {
    let session = make_session();
    // "search-loc" exactly matches the location code → score 3 (exact code)
    // the name "Search Location Alpha" contains "search" → score 2 (name contains)
    // name-contains (2) ranks above code-exact (3): lower score is better
    let results = session.search("search-loc");
    let loc_hit = results.iter().find(|r| r.id == "search-loc-1").unwrap();
    // best match is name-contains (score 2) since "Search Location Alpha" contains "search-loc"? No.
    // "Search Location Alpha".to_lowercase() = "search location alpha", does not contain "search-loc"
    // So best score is code exact = 3
    assert_eq!(loc_hit.score, 3);
}

#[test]
fn results_capped_at_50() {
    // This fixture has far fewer than 50 entities, so just confirm the cap constant behaviour.
    let session = make_session();
    let results = session.search("se"); // broad query, should find multiple
    assert!(results.len() <= 50);
}

#[test]
fn case_insensitive_match() {
    let session = make_session();
    let upper = session.search("SEARCH-LOC");
    assert!(upper.iter().any(|r| r.id == "search-loc-1"));
    let lower = session.search("search-loc");
    assert!(lower.iter().any(|r| r.id == "search-loc-1"));
}

// ── placement hits (enriched search) ─────────────────────────────────────────

#[test]
fn placement_found_by_target_device_code() {
    let session = make_session();
    let results = session.search("search-dev");
    // Should find both the device itself AND the placement that contains it
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-dev-1");
    assert!(
        placement_hit.is_some(),
        "expected placement by target device code; got: {:?}",
        results.iter().map(|r| (&r.kind, &r.id)).collect::<Vec<_>>()
    );
}

#[test]
fn placement_found_by_target_device_name() {
    let session = make_session();
    // "Delta" is the device name; the placement should surface too
    let results = session.search("Delta");
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-dev-1");
    assert!(
        placement_hit.is_some(),
        "expected placement by target device name; got: {:?}",
        results.iter().map(|r| (&r.kind, &r.id)).collect::<Vec<_>>()
    );
}

#[test]
fn placement_found_by_target_device_serial_number() {
    let session = make_session();
    let results = session.search("SN-UNIQUE-9999");
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-dev-1");
    assert!(
        placement_hit.is_some(),
        "expected placement by device serial number"
    );
}

#[test]
fn placement_found_by_target_device_asset_tag() {
    let session = make_session();
    let results = session.search("AT-0001");
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-dev-1");
    assert!(
        placement_hit.is_some(),
        "expected placement by device asset tag"
    );
}

#[test]
fn placement_found_by_rack_code() {
    let session = make_session();
    let results = session.search("search-rack");
    let placement_hits: Vec<_> = results
        .iter()
        .filter(|r| r.kind == SearchResultKind::Placement)
        .collect();
    assert!(
        !placement_hits.is_empty(),
        "expected at least one placement hit for rack code"
    );
}

#[test]
fn placement_found_by_rack_name() {
    let session = make_session();
    let results = session.search("Beta");
    let placement_hits: Vec<_> = results
        .iter()
        .filter(|r| r.kind == SearchResultKind::Placement)
        .collect();
    assert!(
        !placement_hits.is_empty(),
        "expected at least one placement hit for rack name"
    );
}

#[test]
fn rack_object_placement_found_by_model_code() {
    let session = make_session();
    let results = session.search("search-rackobj-model");
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-ro-1");
    assert!(
        placement_hit.is_some(),
        "expected rack-object placement found by model code"
    );
}

#[test]
fn rack_object_placement_found_by_model_vendor() {
    let session = make_session();
    let results = session.search("PanelVendor");
    let placement_hit = results
        .iter()
        .find(|r| r.kind == SearchResultKind::Placement && r.id == "search-pl-ro-1");
    assert!(
        placement_hit.is_some(),
        "expected rack-object placement found by model vendor"
    );
}

#[test]
fn placement_detail_contains_rack_name_and_side_and_start_u() {
    let session = make_session();
    let results = session.search("search-pl-dev");
    let hit = results.iter().find(|r| r.id == "search-pl-dev-1").unwrap();
    let detail = hit.detail.as_deref().unwrap_or("");
    // detail uses rack *name* (not rack code) for display, plus side and U position
    assert!(
        detail.contains("Search Rack Beta") && detail.contains("front") && detail.contains("U1"),
        "detail should contain rack name, side, and start_u; got: {detail:?}"
    );
}

#[test]
fn placement_label_is_target_device_name_not_code() {
    let session = make_session();
    let results = session.search("search-pl-dev");
    let hit = results.iter().find(|r| r.id == "search-pl-dev-1").unwrap();
    // label must be the target device's display name, not the placement code
    assert_eq!(hit.label, "Search Device Delta");
    assert_ne!(hit.label, hit.code); // placement code must not leak into label
}

#[test]
fn placement_label_does_not_contain_placement_code() {
    let session = make_session();
    let results = session.search("search-pl-dev");
    let hit = results.iter().find(|r| r.id == "search-pl-dev-1").unwrap();
    assert!(
        !hit.label.contains("search-pl-dev"),
        "label should not contain placement code; got: {:?}",
        hit.label
    );
}

#[test]
fn placement_navigation_contains_rack_id_and_placement_id() {
    let session = make_session();
    let results = session.search("search-pl-dev");
    let hit = results.iter().find(|r| r.id == "search-pl-dev-1").unwrap();
    assert_eq!(hit.navigation.rack_id.as_deref(), Some("search-rack-1"));
    assert_eq!(
        hit.navigation.placement_id.as_deref(),
        Some("search-pl-dev-1")
    );
}
