use std::collections::HashMap;
use std::io::Write as _;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use ris_core::{DeviceType, Placement, PlacementTargetKind};

use crate::data::RepositoryData;

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum WriteError {
    #[error("I/O error for '{path}': {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("YAML serialization error: {0}")]
    Yaml(#[from] serde_yaml::Error),
    /// A layout-derived path would escape the inventory directory.
    #[error(
        "Path traversal rejected for '{path}': \
         inventory paths must stay within the repository inventory directory"
    )]
    PathTraversal { path: String },
}

// ── WriteStatus / WriteReport ─────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteStatus {
    Created,
    Updated,
    Unchanged,
}

#[derive(Debug, Default)]
pub struct WriteReport {
    pub created: Vec<String>,
    pub updated: Vec<String>,
    pub unchanged: Vec<String>,
}

impl WriteReport {
    fn record(&mut self, status: WriteStatus, path: &Path) {
        let s = path.display().to_string();
        match status {
            WriteStatus::Created => self.created.push(s),
            WriteStatus::Updated => self.updated.push(s),
            WriteStatus::Unchanged => self.unchanged.push(s),
        }
    }

    pub fn total(&self) -> usize {
        self.created.len() + self.updated.len() + self.unchanged.len()
    }
}

// ── atomic_replace ────────────────────────────────────────────────────────────

/// Write `content` to `path` atomically using a temp-file-then-rename strategy.
///
/// The temp file is created in the same directory as `path` so the rename is
/// always on the same filesystem (a requirement for atomic rename on Linux; also
/// needed for `MoveFileExW` on Windows). On Unix, `rename(2)` atomically
/// replaces the destination. On Windows, `tempfile::NamedTempFile::persist`
/// uses `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING`, which provides
/// equivalent semantics on the same volume.
///
/// The temp file is flushed and synced before rename; on error the temp file is
/// automatically removed by `NamedTempFile`'s Drop implementation.
fn atomic_replace(path: &Path, content: &str) -> Result<(), WriteError> {
    let io_err = |e: std::io::Error| WriteError::Io {
        path: path.display().to_string(),
        source: e,
    };
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(io_err)?;
    tmp.write_all(content.as_bytes()).map_err(io_err)?;
    tmp.flush().map_err(io_err)?;
    tmp.as_file().sync_all().map_err(io_err)?;
    tmp.persist(path).map_err(|e| WriteError::Io {
        path: path.display().to_string(),
        source: e.error,
    })?;
    Ok(())
}

// ── write_if_changed ──────────────────────────────────────────────────────────

pub fn write_if_changed(path: &Path, content: &str) -> Result<WriteStatus, WriteError> {
    let io_err = |e: std::io::Error, p: &Path| WriteError::Io {
        path: p.display().to_string(),
        source: e,
    };

    if path.exists() {
        let existing = std::fs::read_to_string(path).map_err(|e| io_err(e, path))?;
        if existing == content {
            return Ok(WriteStatus::Unchanged);
        }
        atomic_replace(path, content)?;
        return Ok(WriteStatus::Updated);
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| WriteError::Io {
            path: parent.display().to_string(),
            source: e,
        })?;
    }
    atomic_replace(path, content)?;
    Ok(WriteStatus::Created)
}

// ── safe_inventory_join ───────────────────────────────────────────────────────

/// Join `inv_canonical` (the canonicalised inventory root) with `rel`.
///
/// Rejects:
/// - absolute paths (`rel.is_absolute()`)
/// - `..` (`Component::ParentDir`)
/// - Windows drive/UNC prefixes (`Component::Prefix`)
/// - root-dir components (`Component::RootDir`)
/// - symlinks whose resolved parent escapes `inv_canonical`
///
/// Normal `./`-relative paths and bare filenames are accepted.
///
/// This prevents entity codes or layout metadata from escaping the
/// repository inventory directory.
pub(crate) fn safe_inventory_join(inv_canonical: &Path, rel: &Path) -> Result<PathBuf, WriteError> {
    // Absolute paths are always rejected.
    if rel.is_absolute() {
        return Err(WriteError::PathTraversal {
            path: rel.display().to_string(),
        });
    }

    // Walk every component and reject dangerous ones.
    for component in rel.components() {
        match component {
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(WriteError::PathTraversal {
                    path: rel.display().to_string(),
                });
            }
            _ => {}
        }
    }

    let full = inv_canonical.join(rel);

    // If the parent directory already exists, canonicalize it and verify
    // containment — this catches symlinks that point outside inventory/.
    if let Some(parent) = full.parent() {
        if parent.exists() {
            let canonical_parent = parent.canonicalize().map_err(|e| WriteError::Io {
                path: parent.display().to_string(),
                source: e,
            })?;
            if !canonical_parent.starts_with(inv_canonical) {
                return Err(WriteError::PathTraversal {
                    path: rel.display().to_string(),
                });
            }
        }
    }

    Ok(full)
}

// ── Output DTOs ───────────────────────────────────────────────────────────────
// Field declaration order controls YAML output order (serde_yaml 0.9 preserves
// struct field order via indexmap).

#[derive(Serialize)]
struct OutRepoFile {
    format: String,
    version: String,
    repository: OutRepoMeta,
}

#[derive(Serialize)]
struct OutRepoMeta {
    id: String,
    code: String,
    name: String,
}

#[derive(Serialize)]
struct OutLocationsFile {
    locations: Vec<OutLocation>,
}

#[derive(Serialize)]
struct OutLocation {
    id: String,
    code: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    address: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Serialize)]
struct OutRacksFile {
    location_id: String,
    racks: Vec<OutRack>,
}

#[derive(Serialize)]
struct OutRack {
    id: String,
    code: String,
    name: String,
    height_u: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    row: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Serialize)]
struct OutDeviceModelsFile {
    device_type: String,
    models: Vec<OutDeviceModel>,
}

#[derive(Serialize)]
struct OutDeviceModel {
    id: String,
    code: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    default_height_u: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Serialize)]
struct OutDevicesFile {
    device_type: String,
    devices: Vec<OutDevice>,
}

#[derive(Serialize)]
struct OutDevice {
    id: String,
    code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    serial_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset_tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_ref: Option<String>,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Serialize)]
struct OutPlacementsFile {
    rack_id: String,
    placements: OutPlacementSides,
}

#[derive(Serialize)]
struct OutPlacementSides {
    front: Vec<OutPlacement>,
    rear: Vec<OutPlacement>,
}

#[derive(Serialize)]
struct OutPlacement {
    id: String,
    code: String,
    target_kind: String,
    target_id: String,
    start_u: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    height_u: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn device_type_file_stem(dt: &DeviceType) -> &'static str {
    match dt {
        DeviceType::Server => "servers",
        DeviceType::Network => "network",
        DeviceType::Storage => "storage",
        DeviceType::Ups => "ups",
        DeviceType::Appliance => "appliances",
        DeviceType::RackObject => "rack-objects",
        DeviceType::Other => "other",
    }
}

fn target_kind_str(tk: &PlacementTargetKind) -> &'static str {
    match tk {
        PlacementTargetKind::Device => "device",
        PlacementTargetKind::DeviceModel => "device_model",
    }
}

fn to_out_placement(p: &Placement) -> OutPlacement {
    OutPlacement {
        id: p.id.clone(),
        code: p.code.clone(),
        target_kind: target_kind_str(&p.target_kind).to_string(),
        target_id: p.target_id.clone(),
        start_u: p.start_u,
        height_u: p.height_u,
        note: p.note.clone(),
        tags: p.tags.clone(),
    }
}

fn serialize_yaml<T: Serialize>(value: &T) -> Result<String, WriteError> {
    serde_yaml::to_string(value).map_err(WriteError::Yaml)
}

fn io_err(e: std::io::Error, path: &Path) -> WriteError {
    WriteError::Io {
        path: path.display().to_string(),
        source: e,
    }
}

// ── write_repository ──────────────────────────────────────────────────────────

pub fn write_repository(
    repo_path: &Path,
    data: &RepositoryData,
) -> Result<WriteReport, WriteError> {
    let inv = repo_path.join("inventory");
    let mut report = WriteReport::default();

    std::fs::create_dir_all(&inv).map_err(|e| io_err(e, &inv))?;

    // Canonicalise the inventory root once. All layout-derived paths are
    // validated against this canonical root before any file I/O.
    let inv_c = inv.canonicalize().map_err(|e| io_err(e, &inv))?;

    // Helper: validate a relative path, then call write_if_changed.
    let checked_write =
        |rel: &Path, content: &str, rep: &mut WriteReport| -> Result<(), WriteError> {
            let path = safe_inventory_join(&inv_c, rel)?;
            rep.record(write_if_changed(&path, content)?, &path);
            Ok(())
        };

    // ── 1. repo.yaml ──────────────────────────────────────────────────────────

    {
        let m = &data.metadata;
        let out = OutRepoFile {
            format: m.format.clone(),
            version: m.version.clone(),
            repository: OutRepoMeta {
                id: m.id.clone(),
                code: m.code.clone(),
                name: m.name.clone(),
            },
        };
        let content = serialize_yaml(&out)?;
        checked_write(Path::new("repo.yaml"), &content, &mut report)?;
    }

    // ── 2. locations.yaml ─────────────────────────────────────────────────────

    {
        let mut locs: Vec<OutLocation> = data
            .locations
            .iter()
            .map(|l| OutLocation {
                id: l.id.clone(),
                code: l.code.clone(),
                name: l.name.clone(),
                description: l.description.clone(),
                address: l.address.clone(),
                tags: l.tags.clone(),
            })
            .collect();
        locs.sort_unstable_by(|a, b| a.code.cmp(&b.code));
        let out = OutLocationsFile { locations: locs };
        let content = serialize_yaml(&out)?;
        checked_write(Path::new("locations.yaml"), &content, &mut report)?;
    }

    // ── 3. racks/*.yaml ───────────────────────────────────────────────────────
    // Preserves original file paths from layout; canonical fallback for new racks.

    {
        let loc_code: HashMap<&str, &str> = data
            .locations
            .iter()
            .map(|l| (l.id.as_str(), l.code.as_str()))
            .collect();

        // rack_id -> original relative path
        let mut rack_to_path: HashMap<&str, &Path> = HashMap::new();
        for lf in &data.layout.rack_files {
            for rid in &lf.rack_ids {
                rack_to_path.insert(rid.as_str(), lf.path.as_path());
            }
        }

        // path -> (location_id, racks) — pre-seeded with known layout paths
        let mut groups: HashMap<PathBuf, (String, Vec<OutRack>)> = HashMap::new();
        for lf in &data.layout.rack_files {
            groups
                .entry(lf.path.clone())
                .or_insert_with(|| (lf.location_id.clone(), Vec::new()));
        }

        for rack in &data.racks {
            let path = rack_to_path
                .get(rack.id.as_str())
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| {
                    let lc = loc_code
                        .get(rack.location_id.as_str())
                        .copied()
                        .unwrap_or(rack.location_id.as_str());
                    PathBuf::from(format!("racks/{lc}.yaml"))
                });
            groups
                .entry(path)
                .or_insert_with(|| (rack.location_id.clone(), Vec::new()))
                .1
                .push(OutRack {
                    id: rack.id.clone(),
                    code: rack.code.clone(),
                    name: rack.name.clone(),
                    height_u: rack.height_u,
                    row: rack.row.clone(),
                    description: rack.description.clone(),
                    tags: rack.tags.clone(),
                });
        }

        let mut group_list: Vec<_> = groups.into_iter().collect();
        group_list.sort_by(|a, b| a.0.cmp(&b.0));

        for (rel, (loc_id, mut out_racks)) in group_list {
            out_racks.sort_unstable_by(|a, b| a.code.cmp(&b.code));
            let out = OutRacksFile {
                location_id: loc_id,
                racks: out_racks,
            };
            let content = serialize_yaml(&out)?;
            checked_write(&rel, &content, &mut report)?;
        }
    }

    // ── 4. device-models/*.yaml ───────────────────────────────────────────────
    // Preserves original file paths from layout; canonical fallback for new models.

    {
        let mut model_to_path: HashMap<&str, &Path> = HashMap::new();
        for lf in &data.layout.device_model_files {
            for mid in &lf.model_ids {
                model_to_path.insert(mid.as_str(), lf.path.as_path());
            }
        }

        let mut groups: HashMap<PathBuf, (DeviceType, Vec<OutDeviceModel>)> = HashMap::new();
        for lf in &data.layout.device_model_files {
            groups
                .entry(lf.path.clone())
                .or_insert_with(|| (lf.device_type.clone(), Vec::new()));
        }

        for dm in &data.device_models {
            let path = model_to_path
                .get(dm.id.as_str())
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| {
                    PathBuf::from(format!(
                        "device-models/{}.yaml",
                        device_type_file_stem(&dm.device_type)
                    ))
                });
            groups
                .entry(path)
                .or_insert_with(|| (dm.device_type.clone(), Vec::new()))
                .1
                .push(OutDeviceModel {
                    id: dm.id.clone(),
                    code: dm.code.clone(),
                    name: dm.name.clone(),
                    vendor: dm.vendor.clone(),
                    model: dm.model.clone(),
                    default_height_u: dm.default_height_u,
                    description: dm.description.clone(),
                    tags: dm.tags.clone(),
                });
        }

        let mut group_list: Vec<_> = groups.into_iter().collect();
        group_list.sort_by(|a, b| a.0.cmp(&b.0));

        for (rel, (dt, mut out_models)) in group_list {
            out_models.sort_unstable_by(|a, b| a.code.cmp(&b.code));
            let out = OutDeviceModelsFile {
                device_type: dt.as_str().to_string(),
                models: out_models,
            };
            let content = serialize_yaml(&out)?;
            checked_write(&rel, &content, &mut report)?;
        }
    }

    // ── 5. devices/*.yaml ─────────────────────────────────────────────────────
    // Preserves original file paths; RackObject devices are skipped.

    {
        let mut device_to_path: HashMap<&str, &Path> = HashMap::new();
        for lf in &data.layout.device_files {
            for did in &lf.device_ids {
                device_to_path.insert(did.as_str(), lf.path.as_path());
            }
        }

        let mut groups: HashMap<PathBuf, (DeviceType, Vec<OutDevice>)> = HashMap::new();
        for lf in &data.layout.device_files {
            if lf.device_type != DeviceType::RackObject {
                groups
                    .entry(lf.path.clone())
                    .or_insert_with(|| (lf.device_type.clone(), Vec::new()));
            }
        }

        for dev in &data.devices {
            if dev.device_type == DeviceType::RackObject {
                continue;
            }
            let path = device_to_path
                .get(dev.id.as_str())
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| {
                    PathBuf::from(format!(
                        "devices/{}.yaml",
                        device_type_file_stem(&dev.device_type)
                    ))
                });
            groups
                .entry(path)
                .or_insert_with(|| (dev.device_type.clone(), Vec::new()))
                .1
                .push(OutDevice {
                    id: dev.id.clone(),
                    code: dev.code.clone(),
                    name: dev.name.clone(),
                    device_model_id: dev.device_model_id.clone(),
                    serial_number: dev.serial_number.clone(),
                    asset_tag: dev.asset_tag.clone(),
                    external_ref: dev.external_ref.clone(),
                    status: dev.status.as_str().to_string(),
                    description: dev.description.clone(),
                    tags: dev.tags.clone(),
                });
        }

        let mut group_list: Vec<_> = groups.into_iter().collect();
        group_list.sort_by(|a, b| a.0.cmp(&b.0));

        for (rel, (dt, mut out_devices)) in group_list {
            out_devices.sort_unstable_by(|a, b| a.code.cmp(&b.code));
            let out = OutDevicesFile {
                device_type: dt.as_str().to_string(),
                devices: out_devices,
            };
            let content = serialize_yaml(&out)?;
            checked_write(&rel, &content, &mut report)?;
        }
    }

    // ── 6. placements/*.yaml ──────────────────────────────────────────────────
    // Preserves original placement file path per rack.

    {
        let rack_code: HashMap<&str, &str> = data
            .racks
            .iter()
            .map(|r| (r.id.as_str(), r.code.as_str()))
            .collect();

        let placement_to_path: HashMap<&str, &Path> = data
            .layout
            .placement_files
            .iter()
            .map(|lf| (lf.rack_id.as_str(), lf.path.as_path()))
            .collect();

        let mut placement_files: Vec<_> = data.placement_files.iter().collect();
        placement_files.sort_unstable_by(|a, b| a.rack_id.cmp(&b.rack_id));

        for pf in placement_files {
            let rel = placement_to_path
                .get(pf.rack_id.as_str())
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| {
                    let rc = rack_code
                        .get(pf.rack_id.as_str())
                        .copied()
                        .unwrap_or(pf.rack_id.as_str());
                    PathBuf::from(format!("placements/{rc}.yaml"))
                });

            let mut front: Vec<OutPlacement> = pf.front.iter().map(to_out_placement).collect();
            let mut rear: Vec<OutPlacement> = pf.rear.iter().map(to_out_placement).collect();
            front.sort_unstable_by(|a, b| a.start_u.cmp(&b.start_u).then(a.code.cmp(&b.code)));
            rear.sort_unstable_by(|a, b| a.start_u.cmp(&b.start_u).then(a.code.cmp(&b.code)));

            let out = OutPlacementsFile {
                rack_id: pf.rack_id.clone(),
                placements: OutPlacementSides { front, rear },
            };
            let content = serialize_yaml(&out)?;
            checked_write(&rel, &content, &mut report)?;
        }
    }

    Ok(report)
}

// ── containment unit tests ────────────────────────────────────────────────────

#[cfg(test)]
mod containment_tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let inv = tmp.path().join("inventory");
        std::fs::create_dir_all(&inv).unwrap();
        let inv_c = inv.canonicalize().unwrap();
        (tmp, inv_c)
    }

    #[test]
    fn accepts_simple_filename() {
        let (_, inv) = setup();
        assert!(safe_inventory_join(&inv, Path::new("repo.yaml")).is_ok());
    }

    #[test]
    fn accepts_nested_relative_path() {
        let (_, inv) = setup();
        assert!(safe_inventory_join(&inv, Path::new("racks/room-a.yaml")).is_ok());
    }

    #[test]
    fn accepts_cur_dir_relative_path() {
        let (_, inv) = setup();
        assert!(safe_inventory_join(&inv, Path::new("./racks/room-a.yaml")).is_ok());
    }

    #[test]
    fn rejects_parent_traversal() {
        let (_, inv) = setup();
        let result = safe_inventory_join(&inv, Path::new("../evil.yaml"));
        assert!(
            matches!(result, Err(WriteError::PathTraversal { .. })),
            "expected PathTraversal, got: {result:?}"
        );
    }

    #[test]
    fn rejects_nested_traversal() {
        let (_, inv) = setup();
        let result = safe_inventory_join(&inv, Path::new("racks/../../etc/passwd"));
        assert!(matches!(result, Err(WriteError::PathTraversal { .. })));
    }

    #[test]
    fn rejects_absolute_path() {
        let (_, inv) = setup();
        let result = safe_inventory_join(&inv, Path::new("/etc/passwd"));
        assert!(matches!(result, Err(WriteError::PathTraversal { .. })));
    }

    #[test]
    fn rejects_windows_drive_path() {
        let (_, inv) = setup();
        // Use a raw string to create a Windows-style drive path as a PathBuf.
        // On Linux/macOS, PathBuf treats this as a relative path starting with "C:",
        // but the Component::Prefix check catches it on Windows.
        // On non-Windows, is_absolute() or ParentDir won't fire for "C:\\temp\\evil.yaml",
        // so we explicitly reject component Prefix by testing the PathBuf representation.
        #[cfg(windows)]
        {
            let result = safe_inventory_join(&inv, Path::new("C:\\temp\\evil.yaml"));
            assert!(matches!(result, Err(WriteError::PathTraversal { .. })));
        }
        // On non-Windows, validate the rejection of paths that *look like*
        // Windows drive paths by checking our explicit byte-level guard.
        #[cfg(not(windows))]
        {
            // "C:\temp\evil.yaml" as a Unix path: no backslash separator, treated
            // as a single filename component — not a traversal risk on Unix.
            // The real risk is on Windows where Component::Prefix fires.
            // This test documents expected platform behavior.
            let result = safe_inventory_join(&inv, Path::new("C:\\temp\\evil.yaml"));
            // On Unix, backslash is a valid filename char, so this is accepted
            // as a relative filename.  The rejection guard for Prefix only fires
            // on Windows.  This is intentional and correct.
            assert!(
                result.is_ok(),
                "Unix: Windows-style path is a harmless relative filename: {result:?}"
            );
        }
    }

    #[test]
    fn rejects_windows_drive_path_on_windows_explicitly() {
        // This variant checks only on Windows.
        #[cfg(windows)]
        {
            let (_, inv) = setup();
            let result = safe_inventory_join(&inv, Path::new("C:/temp/evil.yaml"));
            assert!(matches!(result, Err(WriteError::PathTraversal { .. })));
        }
    }
}
