use ris_application::{create_repository, CreateRepositoryInput};
use ris_core::ValidationLevel;

// ── helpers ───────────────────────────────────────────────────────────────────

fn make_input(dir: &std::path::Path, code: &str, name: &str) -> CreateRepositoryInput {
    CreateRepositoryInput {
        path: dir.to_path_buf(),
        code: code.to_string(),
        name: name.to_string(),
        id: Some("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string()),
    }
}

// ── create_repository ─────────────────────────────────────────────────────────

#[test]
fn creates_minimal_repository_in_empty_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let result = create_repository(make_input(tmp.path(), "test-repo", "Test Repository"));
    assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    let session = result.unwrap();
    assert_eq!(session.data.metadata.code, "test-repo");
    assert_eq!(session.data.metadata.name, "Test Repository");
    assert!(session.data.locations.is_empty());
    assert!(session.data.racks.is_empty());
    assert!(session.data.devices.is_empty());
    assert!(
        session.data.device_models.is_empty(),
        "fresh scaffold has no model entries"
    );
    assert!(
        !session.data.layout.device_model_files.is_empty(),
        "scaffold should have device model layout files"
    );
}

#[test]
fn creates_missing_target_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let new_dir = tmp.path().join("does-not-exist").join("nested");
    let result = create_repository(make_input(&new_dir, "new-repo", "New Repo"));
    assert!(result.is_ok(), "expected Ok, got: {:?}", result.err());
    assert!(new_dir.join("inventory").join("repo.yaml").exists());
}

#[test]
fn generated_repository_loads_successfully() {
    let tmp = tempfile::tempdir().unwrap();
    let session = create_repository(make_input(tmp.path(), "load-test", "Load Test")).unwrap();
    // Verify key scaffold files exist on disk
    assert!(tmp.path().join("inventory").join("repo.yaml").exists());
    assert!(tmp.path().join("inventory").join("locations.yaml").exists());
    assert!(tmp
        .path()
        .join("inventory")
        .join("device-models")
        .join("servers.yaml")
        .exists());
    assert!(tmp
        .path()
        .join("inventory")
        .join("devices")
        .join("servers.yaml")
        .exists());
    assert!(tmp.path().join("inventory").join("racks").is_dir());
    assert!(tmp.path().join("inventory").join("placements").is_dir());
    // Session should have the correct metadata
    assert_eq!(session.data.metadata.code, "load-test");
}

#[test]
fn generated_repository_validates_without_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let session =
        create_repository(make_input(tmp.path(), "valid-repo", "Valid Repository")).unwrap();
    let issues = session.validate();
    let errors: Vec<_> = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "expected no validation errors, got: {:#?}",
        errors
    );
}

#[test]
fn refuses_to_overwrite_existing_inventory() {
    let tmp = tempfile::tempdir().unwrap();
    // Create a first repository
    create_repository(make_input(tmp.path(), "first-repo", "First")).unwrap();
    // Attempt to create again in the same directory
    let result = create_repository(make_input(tmp.path(), "second-repo", "Second"));
    assert!(result.is_err());
    let msg = result.err().unwrap().to_string();
    assert!(
        msg.contains("inventory"),
        "expected error about 'inventory', got: {msg}"
    );
}

#[test]
fn rejects_blank_code() {
    let tmp = tempfile::tempdir().unwrap();
    let result = create_repository(make_input(tmp.path(), "   ", "Some Name"));
    assert!(result.is_err());
    let msg = result.err().unwrap().to_string();
    assert!(
        msg.contains("code"),
        "expected error about code, got: {msg}"
    );
}

#[test]
fn rejects_invalid_code_format() {
    let tmp = tempfile::tempdir().unwrap();
    let result = create_repository(make_input(tmp.path(), "My Repo!", "Some Name"));
    assert!(result.is_err());
    let msg = result.err().unwrap().to_string();
    assert!(
        msg.contains("invalid"),
        "expected error about invalid code, got: {msg}"
    );
}

#[test]
fn rejects_blank_name() {
    let tmp = tempfile::tempdir().unwrap();
    let result = create_repository(make_input(tmp.path(), "valid-code", "  "));
    assert!(result.is_err());
    let msg = result.err().unwrap().to_string();
    assert!(
        msg.contains("name"),
        "expected error about name, got: {msg}"
    );
}

#[test]
fn scaffold_contains_all_device_model_files() {
    let tmp = tempfile::tempdir().unwrap();
    create_repository(make_input(tmp.path(), "dm-test", "DM Test")).unwrap();
    let dm_dir = tmp.path().join("inventory").join("device-models");
    for name in &[
        "servers.yaml",
        "network.yaml",
        "storage.yaml",
        "ups.yaml",
        "appliances.yaml",
        "other.yaml",
        "rack-objects.yaml",
    ] {
        assert!(dm_dir.join(name).exists(), "missing device-models/{name}");
    }
}

#[test]
fn scaffold_contains_device_files_but_not_rack_objects() {
    let tmp = tempfile::tempdir().unwrap();
    create_repository(make_input(tmp.path(), "dev-test", "Dev Test")).unwrap();
    let dev_dir = tmp.path().join("inventory").join("devices");
    for name in &[
        "servers.yaml",
        "network.yaml",
        "storage.yaml",
        "ups.yaml",
        "appliances.yaml",
        "other.yaml",
    ] {
        assert!(dev_dir.join(name).exists(), "missing devices/{name}");
    }
    // rack_object is not a valid device type
    assert!(
        !dev_dir.join("rack-objects.yaml").exists(),
        "devices/rack-objects.yaml must not be created"
    );
}
