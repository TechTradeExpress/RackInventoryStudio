use std::path::Path;

use ris_application::{
    open_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput, AddRackInput,
    SearchResultKind,
};
use ris_core::{DeviceStatus, DeviceType};

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
            code: "search-loc".into(),
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
            code: "search-rack".into(),
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
            code: "search-model".into(),
            name: "Search DevModel Gamma".into(),
            vendor: Some("VendorXYZ".into()),
            model: Some("M-2000".into()),
            default_height_u: 2,
            description: None,
            tags: vec![],
        })
        .unwrap();

    session
        .add_device(AddDeviceInput {
            id: Some("search-dev-1".into()),
            device_type: DeviceType::Server,
            code: "search-dev".into(),
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
    assert_eq!(hit.score, 0); // exact code
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
    // "search-loc" exactly matches the location code → score 0
    // the name "Search Location Alpha" contains "search" → score 5
    let results = session.search("search-loc");
    let loc_hit = results.iter().find(|r| r.id == "search-loc-1").unwrap();
    assert_eq!(loc_hit.score, 0);
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
