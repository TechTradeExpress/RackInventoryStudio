use std::path::{Path, PathBuf};

use ris_repository::{load, write_if_changed, write_repository, WriteError, WriteStatus};
use tempfile::TempDir;

// ── helpers ───────────────────────────────────────────────────────────────────

fn fixture(name: &str) -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tests/fixtures")
        .join(name)
}

fn load_example() -> ris_repository::RepositoryData {
    load(&fixture("valid-repository")).expect("load valid-repository fixture")
}

fn write_example(tmp: &TempDir) -> ris_repository::WriteReport {
    let data = load_example();
    write_repository(tmp.path(), &data).expect("write_repository")
}

fn count_yaml_files(dir: &Path) -> usize {
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == "yaml"))
        .count()
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

// ── writer basics ─────────────────────────────────────────────────────────────

#[test]
fn writes_repo_yaml() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    assert!(tmp.path().join("inventory/repo.yaml").exists());
}

#[test]
fn writes_locations_yaml() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    assert!(tmp.path().join("inventory/locations.yaml").exists());
}

#[test]
fn writes_rack_files() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let count = count_yaml_files(&tmp.path().join("inventory/racks"));
    assert!(count >= 1, "expected at least one rack file, got {count}");
}

#[test]
fn writes_device_model_files() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let count = count_yaml_files(&tmp.path().join("inventory/device-models"));
    assert!(
        count >= 1,
        "expected at least one device-model file, got {count}"
    );
}

#[test]
fn writes_device_files() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let count = count_yaml_files(&tmp.path().join("inventory/devices"));
    assert!(count >= 1, "expected at least one device file, got {count}");
}

#[test]
fn writes_placement_files() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let count = count_yaml_files(&tmp.path().join("inventory/placements"));
    assert_eq!(
        count, 1,
        "valid-repository has one rack, expected one placement file"
    );
}

// ── stability ─────────────────────────────────────────────────────────────────

#[test]
fn second_write_reports_all_unchanged() {
    let data = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &data).unwrap();
    let second = write_repository(tmp.path(), &data).unwrap();

    assert!(
        second.created.is_empty(),
        "second write created: {:?}",
        second.created
    );
    assert!(
        second.updated.is_empty(),
        "second write updated: {:?}",
        second.updated
    );
    assert!(
        !second.unchanged.is_empty(),
        "second write should report unchanged files"
    );
}

#[test]
fn generated_yaml_has_no_null_optional_fields() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);

    let inv = tmp.path().join("inventory");
    let files = [inv.join("repo.yaml"), inv.join("locations.yaml")];
    for f in &files {
        let content = std::fs::read_to_string(f).unwrap();
        assert!(
            !content.contains("null"),
            "{} should not contain 'null', got:\n{content}",
            f.display()
        );
    }

    // Check every yaml file in the inventory tree
    for dir in &["racks", "device-models", "devices", "placements"] {
        let dir_path = inv.join(dir);
        if !dir_path.exists() {
            continue;
        }
        for entry in std::fs::read_dir(&dir_path).unwrap().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().is_some_and(|x| x == "yaml") {
                let content = std::fs::read_to_string(&path).unwrap();
                assert!(
                    !content.contains("null"),
                    "{} should not contain 'null'",
                    path.display()
                );
            }
        }
    }
}

#[test]
fn generated_yaml_has_stable_field_order_across_two_writes() {
    let data = load_example();
    let tmp1 = TempDir::new().unwrap();
    let tmp2 = TempDir::new().unwrap();
    write_repository(tmp1.path(), &data).unwrap();
    write_repository(tmp2.path(), &data).unwrap();

    for rel in &[
        "inventory/repo.yaml",
        "inventory/locations.yaml",
        "inventory/devices/servers.yaml",
    ] {
        let c1 = std::fs::read_to_string(tmp1.path().join(rel)).unwrap();
        let c2 = std::fs::read_to_string(tmp2.path().join(rel)).unwrap();
        assert_eq!(c1, c2, "Field order differs for {rel}");
    }
}

#[test]
fn repo_yaml_field_order_is_format_version_repository() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let content = std::fs::read_to_string(tmp.path().join("inventory/repo.yaml")).unwrap();
    let format_pos = content.find("format:").unwrap();
    let version_pos = content.find("version:").unwrap();
    let repo_pos = content.find("repository:").unwrap();
    assert!(format_pos < version_pos, "format must come before version");
    assert!(
        version_pos < repo_pos,
        "version must come before repository"
    );
}

// ── round-trip ────────────────────────────────────────────────────────────────

#[test]
fn round_trip_loads_successfully() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    load(tmp.path()).expect("round-trip load should succeed");
}

#[test]
fn round_trip_preserves_location_count() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.locations.len(), original.locations.len());
}

#[test]
fn round_trip_preserves_rack_count() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.racks.len(), original.racks.len());
}

#[test]
fn round_trip_preserves_device_model_count() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.device_models.len(), original.device_models.len());
}

#[test]
fn round_trip_preserves_device_count() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.devices.len(), original.devices.len());
}

#[test]
fn round_trip_preserves_placement_file_count() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.placement_files.len(), original.placement_files.len());
}

#[test]
fn round_trip_preserves_placement_front_rear_sides() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();

    let orig_pf = &original.placement_files[0];
    let loaded_pf = loaded
        .placement_files
        .iter()
        .find(|pf| pf.rack_id == orig_pf.rack_id)
        .expect("placement file with same rack_id must exist after round-trip");

    assert_eq!(
        loaded_pf.front.len(),
        orig_pf.front.len(),
        "front placement count mismatch"
    );
    assert_eq!(
        loaded_pf.rear.len(),
        orig_pf.rear.len(),
        "rear placement count mismatch"
    );
}

#[test]
fn round_trip_preserves_location_codes() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();

    let orig_codes: std::collections::HashSet<_> =
        original.locations.iter().map(|l| l.code.as_str()).collect();
    let loaded_codes: std::collections::HashSet<_> =
        loaded.locations.iter().map(|l| l.code.as_str()).collect();
    assert_eq!(orig_codes, loaded_codes);
}

#[test]
fn round_trip_preserves_device_ids() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();

    let orig_ids: std::collections::HashSet<_> =
        original.devices.iter().map(|d| d.id.as_str()).collect();
    let loaded_ids: std::collections::HashSet<_> =
        loaded.devices.iter().map(|d| d.id.as_str()).collect();
    assert_eq!(orig_ids, loaded_ids);
}

#[test]
fn round_trip_preserves_placement_codes() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();

    let orig_pf = &original.placement_files[0];
    let loaded_pf = loaded
        .placement_files
        .iter()
        .find(|pf| pf.rack_id == orig_pf.rack_id)
        .unwrap();

    let orig_front_codes: std::collections::HashSet<_> =
        orig_pf.front.iter().map(|p| p.code.as_str()).collect();
    let loaded_front_codes: std::collections::HashSet<_> =
        loaded_pf.front.iter().map(|p| p.code.as_str()).collect();
    assert_eq!(orig_front_codes, loaded_front_codes);
}

// ── change detection ──────────────────────────────────────────────────────────

#[test]
fn write_if_changed_returns_created_for_new_file() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("test.yaml");
    let status = write_if_changed(&path, "key: value\n").unwrap();
    assert_eq!(status, WriteStatus::Created);
}

#[test]
fn write_if_changed_returns_unchanged_for_same_content() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("test.yaml");
    write_if_changed(&path, "key: value\n").unwrap();
    let status = write_if_changed(&path, "key: value\n").unwrap();
    assert_eq!(status, WriteStatus::Unchanged);
}

#[test]
fn write_if_changed_returns_updated_for_different_content() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("test.yaml");
    write_if_changed(&path, "key: v1\n").unwrap();
    let status = write_if_changed(&path, "key: v2\n").unwrap();
    assert_eq!(status, WriteStatus::Updated);
}

#[test]
fn write_if_changed_creates_parent_directories() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join("nested/deep/test.yaml");
    let status = write_if_changed(&path, "key: value\n").unwrap();
    assert_eq!(status, WriteStatus::Created);
    assert!(path.exists());
}

#[test]
fn write_repository_report_lists_created_files_on_first_write() {
    let data = load_example();
    let tmp = TempDir::new().unwrap();
    let report = write_repository(tmp.path(), &data).unwrap();

    assert!(
        !report.created.is_empty(),
        "first write should create files"
    );
    assert!(report.updated.is_empty());
    assert!(report.unchanged.is_empty());
}

// ── grouping ──────────────────────────────────────────────────────────────────

#[test]
fn device_models_grouped_by_device_type() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let dm_dir = tmp.path().join("inventory/device-models");
    // valid-repository has server models and rack-object models
    assert!(
        dm_dir.join("servers.yaml").exists(),
        "expected device-models/servers.yaml"
    );
    assert!(
        dm_dir.join("rack-objects.yaml").exists(),
        "expected device-models/rack-objects.yaml"
    );
}

#[test]
fn devices_grouped_by_device_type() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    assert!(
        tmp.path().join("inventory/devices/servers.yaml").exists(),
        "expected devices/servers.yaml"
    );
}

#[test]
fn placements_written_per_rack() {
    let original = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let yaml_count = count_yaml_files(&tmp.path().join("inventory/placements"));
    assert_eq!(
        yaml_count,
        original.placement_files.len(),
        "one placement file per rack"
    );
}

#[test]
fn rack_object_devices_are_not_written() {
    // The valid-repository fixture has no rack_object devices (only rack_object models).
    // Ensure no rack-objects.yaml appears in devices/.
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    assert!(
        !tmp.path()
            .join("inventory/devices/rack-objects.yaml")
            .exists(),
        "rack_object devices must not be written"
    );
}

// ── write-back safety ─────────────────────────────────────────────────────────

#[test]
fn write_back_preserves_existing_rack_file_path() {
    // valid-repository has racks/room-a.yaml but location code is server-room-a.
    // Write back must reuse room-a.yaml and must not create server-room-a.yaml.
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&fixture("valid-repository"), tmp.path());
    let data = load(tmp.path()).expect("load");
    write_repository(tmp.path(), &data).expect("write");
    assert!(
        tmp.path().join("inventory/racks/room-a.yaml").exists(),
        "original rack file must still exist"
    );
    assert!(
        !tmp.path()
            .join("inventory/racks/server-room-a.yaml")
            .exists(),
        "canonical rack file must not be created alongside original"
    );
    let reloaded = load(tmp.path()).expect("reload");
    assert_eq!(
        reloaded.racks.len(),
        data.racks.len(),
        "rack count must be unchanged"
    );
}

#[test]
fn write_back_preserves_existing_placement_file_path() {
    // non-canonical-paths has placements/custom-placement.yaml; rack code is rack-main.
    // Write back must reuse custom-placement.yaml and must not create rack-main.yaml.
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&fixture("non-canonical-paths"), tmp.path());
    let data = load(tmp.path()).expect("load");
    write_repository(tmp.path(), &data).expect("write");
    assert!(
        tmp.path()
            .join("inventory/placements/custom-placement.yaml")
            .exists(),
        "original placement file must still exist"
    );
    assert!(
        !tmp.path()
            .join("inventory/placements/rack-main.yaml")
            .exists(),
        "canonical placement file must not be created alongside original"
    );
    let reloaded = load(tmp.path()).expect("reload");
    assert_eq!(
        reloaded.placement_files.len(),
        data.placement_files.len(),
        "placement file count must be unchanged"
    );
}

#[test]
fn write_back_preserves_existing_device_model_file_path() {
    // non-canonical-paths has device-models/custom-models.yaml for device_type server.
    // Write back must reuse custom-models.yaml and must not create servers.yaml.
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&fixture("non-canonical-paths"), tmp.path());
    let data = load(tmp.path()).expect("load");
    write_repository(tmp.path(), &data).expect("write");
    assert!(
        tmp.path()
            .join("inventory/device-models/custom-models.yaml")
            .exists(),
        "original device-model file must still exist"
    );
    assert!(
        !tmp.path()
            .join("inventory/device-models/servers.yaml")
            .exists(),
        "canonical device-model file must not be created alongside original"
    );
    let reloaded = load(tmp.path()).expect("reload");
    assert_eq!(
        reloaded.device_models.len(),
        data.device_models.len(),
        "device model count must be unchanged"
    );
}

#[test]
fn write_back_preserves_existing_device_file_path() {
    // non-canonical-paths has devices/custom-devices.yaml for device_type server.
    // Write back must reuse custom-devices.yaml and must not create servers.yaml.
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&fixture("non-canonical-paths"), tmp.path());
    let data = load(tmp.path()).expect("load");
    write_repository(tmp.path(), &data).expect("write");
    assert!(
        tmp.path()
            .join("inventory/devices/custom-devices.yaml")
            .exists(),
        "original device file must still exist"
    );
    assert!(
        !tmp.path().join("inventory/devices/servers.yaml").exists(),
        "canonical device file must not be created alongside original"
    );
    let reloaded = load(tmp.path()).expect("reload");
    assert_eq!(
        reloaded.devices.len(),
        data.devices.len(),
        "device count must be unchanged"
    );
}

#[test]
fn writing_to_empty_directory_still_uses_canonical_fallback() {
    // Data with no layout (cleared) must fall back to canonical filenames.
    let mut data = load_example();
    data.layout.rack_files.clear();
    data.layout.device_model_files.clear();
    data.layout.device_files.clear();
    data.layout.placement_files.clear();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &data).unwrap();
    // Canonical rack file: location code is server-room-a
    assert!(
        tmp.path()
            .join("inventory/racks/server-room-a.yaml")
            .exists(),
        "canonical rack file must be created when no layout is known"
    );
    // Canonical device-model file for server type
    assert!(
        tmp.path()
            .join("inventory/device-models/servers.yaml")
            .exists(),
        "canonical device-model file must be created when no layout is known"
    );
    // Canonical device file for server type
    assert!(
        tmp.path().join("inventory/devices/servers.yaml").exists(),
        "canonical device file must be created when no layout is known"
    );
    // Canonical placement file: rack code is rack-main
    assert!(
        tmp.path()
            .join("inventory/placements/rack-main.yaml")
            .exists(),
        "canonical placement file must be created when no layout is known"
    );
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.racks.len(), data.racks.len());
    assert_eq!(loaded.devices.len(), data.devices.len());
    assert_eq!(loaded.placement_files.len(), data.placement_files.len());
}

// ── atomic writes ─────────────────────────────────────────────────────────────

/// Walk the inventory tree and collect all files that look like temp files.
fn find_tmp_files(root: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    fn walk(dir: &Path, acc: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, acc);
            } else {
                // NamedTempFile names end with a random suffix but have no
                // extension or have a non-.yaml extension.
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext != "yaml" && ext != "gitkeep" {
                    acc.push(path);
                }
            }
        }
    }
    walk(root, &mut results);
    results
}

#[test]
fn no_tmp_files_after_successful_save() {
    let tmp = TempDir::new().unwrap();
    write_example(&tmp);
    let tmp_files = find_tmp_files(tmp.path());
    assert!(
        tmp_files.is_empty(),
        "no temp files must remain after a successful save; found: {tmp_files:?}"
    );
}

#[test]
fn no_tmp_files_after_second_save() {
    let data = load_example();
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &data).unwrap();
    write_repository(tmp.path(), &data).unwrap();
    let tmp_files = find_tmp_files(tmp.path());
    assert!(
        tmp_files.is_empty(),
        "no temp files after second save; found: {tmp_files:?}"
    );
}

#[test]
fn failed_write_preserves_existing_file() {
    // Attempt to write to a path whose "parent directory" is actually a
    // regular file — this causes the NamedTempFile::new_in to fail.
    // The original file at the unrelated path must be unaffected.
    let tmp = TempDir::new().unwrap();
    let existing = tmp.path().join("existing.yaml");
    std::fs::write(&existing, "original content\n").unwrap();

    // This path is *inside* an existing file, which cannot be a directory.
    let bad_path = existing.join("nested").join("file.yaml");
    let result = write_if_changed(&bad_path, "new content\n");
    assert!(result.is_err(), "write to inside a regular file must fail");

    // Original file must be intact and unmodified.
    let content = std::fs::read_to_string(&existing).unwrap();
    assert_eq!(
        content, "original content\n",
        "original file must be intact after failed atomic write"
    );
}

/// Round-trip using the enriched example repository (3 locations, 6 racks, 50+ devices).
fn example_repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/example-repository")
}

#[test]
fn example_repo_round_trip_preserves_location_count() {
    let original = load(&example_repo()).expect("load example-repository");
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(
        loaded.locations.len(),
        original.locations.len(),
        "location count must be preserved"
    );
}

#[test]
fn example_repo_round_trip_preserves_rack_count() {
    let original = load(&example_repo()).expect("load example-repository");
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.racks.len(), original.racks.len());
}

#[test]
fn example_repo_round_trip_preserves_device_count() {
    let original = load(&example_repo()).expect("load example-repository");
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let loaded = load(tmp.path()).unwrap();
    assert_eq!(loaded.devices.len(), original.devices.len());
}

#[test]
fn example_repo_round_trip_no_tmp_files() {
    let original = load(&example_repo()).expect("load example-repository");
    let tmp = TempDir::new().unwrap();
    write_repository(tmp.path(), &original).unwrap();
    let tmp_files = find_tmp_files(tmp.path());
    assert!(
        tmp_files.is_empty(),
        "no temp files after example-repo save; found: {tmp_files:?}"
    );
}

// ── path containment ──────────────────────────────────────────────────────────

fn is_traversal(e: &WriteError) -> bool {
    matches!(e, WriteError::PathTraversal { .. })
}

#[test]
fn write_repository_rejects_traversal_in_rack_layout() {
    let mut data = load_example();
    // Point first rack file at a path that escapes inventory/
    data.layout.rack_files[0].path = PathBuf::from("../evil-rack.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "traversal in rack layout must be rejected: {result:?}"
    );
    // The malicious file must not have been created outside the tmp dir.
    assert!(
        !tmp.path().join("evil-rack.yaml").exists(),
        "escaped file must not exist"
    );
}

#[test]
fn write_repository_rejects_traversal_in_device_model_layout() {
    let mut data = load_example();
    data.layout.device_model_files[0].path = PathBuf::from("../evil-models.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "traversal in device-model layout must be rejected: {result:?}"
    );
}

#[test]
fn write_repository_rejects_traversal_in_device_layout() {
    let mut data = load_example();
    data.layout.device_files[0].path = PathBuf::from("../../outside/devices.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "deep traversal in device layout must be rejected: {result:?}"
    );
}

#[test]
fn write_repository_rejects_traversal_in_placement_layout() {
    let mut data = load_example();
    data.layout.placement_files[0].path = PathBuf::from("../evil-placement.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "traversal in placement layout must be rejected: {result:?}"
    );
}

#[test]
fn write_repository_rejects_absolute_layout_path() {
    let mut data = load_example();
    data.layout.rack_files[0].path = PathBuf::from("/tmp/evil-absolute.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "absolute path in rack layout must be rejected: {result:?}"
    );
}

#[test]
fn write_repository_rejects_windows_drive_layout_path() {
    // Validate that a Windows-style absolute path in layout data is rejected
    // on all platforms. On Windows, Path will parse this as Prefix + RootDir;
    // on Unix, is_absolute() catches paths starting with '/'.
    let mut data = load_example();
    // Use a Unix absolute path which is invalid on all platforms.
    data.layout.placement_files[0].path = PathBuf::from("/C:/temp/evil.yaml");
    let tmp = TempDir::new().unwrap();
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_err() && is_traversal(result.as_ref().unwrap_err()),
        "Windows-style path in layout must be rejected: {result:?}"
    );
}

#[test]
fn traversal_does_not_create_file_outside_repo() {
    let mut data = load_example();
    data.layout.rack_files[0].path = PathBuf::from("../escaped.yaml");
    let tmp = TempDir::new().unwrap();
    let _ = write_repository(tmp.path(), &data);
    // Confirm no file was created at the sibling path.
    assert!(
        !tmp.path().join("../escaped.yaml").exists(),
        "escaped file must not be created"
    );
    assert!(
        !tmp.path()
            .parent()
            .unwrap_or(tmp.path())
            .join("escaped.yaml")
            .exists(),
        "escaped file must not exist in parent dir"
    );
}

#[test]
fn write_repository_accepts_valid_nested_layout_path() {
    // non-canonical-paths fixture has custom relative paths inside inventory/;
    // these must continue to be accepted.
    let tmp = TempDir::new().unwrap();
    copy_dir_all(&fixture("non-canonical-paths"), tmp.path());
    let data = load(tmp.path()).expect("load");
    let result = write_repository(tmp.path(), &data);
    assert!(
        result.is_ok(),
        "valid non-canonical layout paths must be accepted: {result:?}"
    );
}
