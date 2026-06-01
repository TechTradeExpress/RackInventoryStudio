use std::path::Path;

use serde::Deserialize;

use crate::raw::{
    RawDevice, RawDeviceFile, RawDeviceModel, RawDeviceModelFile, RawLocation, RawLocationsFile,
    RawPlacement, RawPlacementFile, RawRack, RawRackFile, RawRepoFile, RawRepositoryData,
};

// ── private DTOs ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct DtoRepoFile {
    format: Option<String>,
    version: Option<serde_yml::Value>, // accept number or string
    repository: Option<DtoRepoMeta>,
}

#[derive(Deserialize)]
struct DtoRepoMeta {
    id: Option<String>,
    code: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct DtoLocationsFile {
    locations: Option<Vec<DtoLocation>>,
}

#[derive(Deserialize)]
struct DtoLocation {
    id: Option<String>,
    code: Option<String>,
    name: Option<String>,
    tags: Option<serde_yml::Value>,
}

#[derive(Deserialize)]
struct DtoRackFile {
    location_id: Option<String>,
    racks: Option<Vec<DtoRack>>,
}

#[derive(Deserialize)]
struct DtoRack {
    id: Option<String>,
    code: Option<String>,
    name: Option<String>,
    height_u: Option<serde_yml::Value>,
    tags: Option<serde_yml::Value>,
}

#[derive(Deserialize)]
struct DtoDeviceModelFile {
    device_type: Option<String>,
    models: Option<Vec<DtoDeviceModel>>,
}

#[derive(Deserialize)]
struct DtoDeviceModel {
    id: Option<String>,
    code: Option<String>,
    name: Option<String>,
    default_height_u: Option<serde_yml::Value>,
    tags: Option<serde_yml::Value>,
}

#[derive(Deserialize)]
struct DtoDeviceFile {
    device_type: Option<String>,
    devices: Option<Vec<DtoDevice>>,
}

#[derive(Deserialize)]
struct DtoDevice {
    id: Option<String>,
    code: Option<String>,
    name: Option<String>,
    device_model_id: Option<String>,
    serial_number: Option<String>,
    asset_tag: Option<String>,
    status: Option<String>,
    tags: Option<serde_yml::Value>,
}

#[derive(Deserialize)]
struct DtoPlacementsFile {
    rack_id: Option<String>,
    placements: Option<DtoPlacementSides>,
}

#[derive(Deserialize, Default)]
struct DtoPlacementSides {
    front: Option<Vec<DtoPlacement>>,
    rear: Option<Vec<DtoPlacement>>,
}

#[derive(Deserialize)]
struct DtoPlacement {
    id: Option<String>,
    code: Option<String>,
    target_kind: Option<String>,
    target_id: Option<String>,
    start_u: Option<serde_yml::Value>,
    height_u: Option<serde_yml::Value>,
    tags: Option<serde_yml::Value>,
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn read_yaml<T: serde::de::DeserializeOwned + 'static>(
    path: &Path,
    errors: &mut Vec<(String, String)>,
) -> Option<T> {
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => {
            errors.push((path.display().to_string(), format!("IO error: {e}")));
            return None;
        }
    };
    match serde_yml::from_str(&text) {
        Ok(v) => Some(v),
        Err(e) => {
            errors.push((path.display().to_string(), format!("YAML parse error: {e}")));
            None
        }
    }
}

fn read_yaml_dir<T: serde::de::DeserializeOwned + 'static>(
    dir: &Path,
    errors: &mut Vec<(String, String)>,
) -> Vec<(String, T)> {
    let mut results = Vec::new();
    if !dir.exists() {
        return results;
    }
    let mut entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|x| x == "yaml"))
            .collect(),
        Err(e) => {
            errors.push((dir.display().to_string(), format!("IO error: {e}")));
            return results;
        }
    };
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if let Some(dto) = read_yaml(&path, errors) {
            results.push((path.display().to_string(), dto));
        }
    }
    results
}

fn version_to_string(v: Option<serde_yml::Value>) -> Option<String> {
    match v? {
        serde_yml::Value::String(s) => Some(s),
        serde_yml::Value::Number(n) => Some(n.to_string()),
        other => Some(format!("{other:?}")),
    }
}

/// Parse a YAML value as a non-negative integer that fits in u32.
///
/// Returns `(Some(n), false)` for a valid value (including 0),
/// `(None, false)` when the field was absent,
/// `(None, true)` when present but not a valid non-negative integer.
fn parse_raw_u32(v: Option<serde_yml::Value>) -> (Option<u32>, bool) {
    match v {
        None => (None, false),
        Some(serde_yml::Value::Number(n)) => {
            if let Some(u) = n.as_u64() {
                if u <= u32::MAX as u64 {
                    (Some(u as u32), false)
                } else {
                    (None, true) // overflow
                }
            } else {
                (None, true) // negative or float
            }
        }
        Some(_) => (None, true), // string, bool, sequence, etc.
    }
}

/// Parse a YAML value as a list of strings for the `tags` field.
///
/// Returns `(tags, false)` when absent or a valid list of strings,
/// `([], true)` when present but not a valid list of strings.
fn parse_tags(v: Option<serde_yml::Value>) -> (Vec<String>, bool) {
    match v {
        None => (Vec::new(), false),
        Some(serde_yml::Value::Sequence(seq)) => {
            let mut strings = Vec::new();
            for item in seq {
                match item {
                    serde_yml::Value::String(s) => strings.push(s),
                    _ => return (Vec::new(), true),
                }
            }
            (strings, false)
        }
        Some(_) => (Vec::new(), true),
    }
}

// ── public API ───────────────────────────────────────────────────────────────

/// Load the repository in tolerant mode.  Never returns `Err`; instead
/// collects parse problems in `RawRepositoryData::parse_errors`.
pub fn load_raw(repo_path: &Path) -> RawRepositoryData {
    let mut parse_errors: Vec<(String, String)> = Vec::new();
    let inv = repo_path.join("inventory");

    // repo.yaml
    let repo_file = {
        let path = inv.join("repo.yaml");
        if let Some(dto) = read_yaml::<DtoRepoFile>(&path, &mut parse_errors) {
            let meta = dto.repository.unwrap_or(DtoRepoMeta {
                id: None,
                code: None,
                name: None,
            });
            RawRepoFile {
                file_path: path.display().to_string(),
                format: dto.format,
                version: version_to_string(dto.version),
                id: meta.id,
                code: meta.code,
                name: meta.name,
            }
        } else {
            RawRepoFile {
                file_path: path.display().to_string(),
                ..Default::default()
            }
        }
    };

    // locations.yaml
    let locations_file = {
        let path = inv.join("locations.yaml");
        if path.exists() {
            if let Some(dto) = read_yaml::<DtoLocationsFile>(&path, &mut parse_errors) {
                let locations_key_present = dto.locations.is_some();
                let locations = dto
                    .locations
                    .unwrap_or_default()
                    .into_iter()
                    .map(|d| {
                        let (tags, tags_malformed) = parse_tags(d.tags);
                        RawLocation {
                            id: d.id,
                            code: d.code,
                            name: d.name,
                            tags,
                            tags_malformed,
                        }
                    })
                    .collect();
                Some(RawLocationsFile {
                    file_path: path.display().to_string(),
                    locations_key_present,
                    locations,
                })
            } else {
                Some(RawLocationsFile {
                    file_path: path.display().to_string(),
                    locations_key_present: false,
                    locations: Vec::new(),
                })
            }
        } else {
            None
        }
    };

    // racks/*
    let rack_files = read_yaml_dir::<DtoRackFile>(&inv.join("racks"), &mut parse_errors)
        .into_iter()
        .map(|(fp, dto)| {
            let racks_key_present = dto.racks.is_some();
            let racks = dto
                .racks
                .unwrap_or_default()
                .into_iter()
                .map(|r| {
                    let (height_u, height_u_bad) = parse_raw_u32(r.height_u);
                    let (tags, tags_malformed) = parse_tags(r.tags);
                    RawRack {
                        id: r.id,
                        code: r.code,
                        name: r.name,
                        height_u,
                        height_u_bad,
                        tags,
                        tags_malformed,
                    }
                })
                .collect();
            RawRackFile {
                file_path: fp,
                location_id: dto.location_id,
                racks_key_present,
                racks,
            }
        })
        .collect();

    // device-models/*
    let device_model_files =
        read_yaml_dir::<DtoDeviceModelFile>(&inv.join("device-models"), &mut parse_errors)
            .into_iter()
            .map(|(fp, dto)| {
                let models_key_present = dto.models.is_some();
                let models = dto
                    .models
                    .unwrap_or_default()
                    .into_iter()
                    .map(|m| {
                        let (default_height_u, default_height_u_bad) =
                            parse_raw_u32(m.default_height_u);
                        let (tags, tags_malformed) = parse_tags(m.tags);
                        RawDeviceModel {
                            id: m.id,
                            code: m.code,
                            name: m.name,
                            default_height_u,
                            default_height_u_bad,
                            tags,
                            tags_malformed,
                        }
                    })
                    .collect();
                RawDeviceModelFile {
                    file_path: fp,
                    device_type: dto.device_type,
                    models_key_present,
                    models,
                }
            })
            .collect();

    // devices/*
    let device_files = read_yaml_dir::<DtoDeviceFile>(&inv.join("devices"), &mut parse_errors)
        .into_iter()
        .map(|(fp, dto)| {
            let devices_key_present = dto.devices.is_some();
            let devices = dto
                .devices
                .unwrap_or_default()
                .into_iter()
                .map(|d| {
                    let (tags, tags_malformed) = parse_tags(d.tags);
                    RawDevice {
                        id: d.id,
                        code: d.code,
                        name: d.name,
                        device_model_id: d.device_model_id,
                        serial_number: d.serial_number,
                        asset_tag: d.asset_tag,
                        status: d.status,
                        tags,
                        tags_malformed,
                    }
                })
                .collect();
            RawDeviceFile {
                file_path: fp,
                device_type: dto.device_type,
                devices_key_present,
                devices,
            }
        })
        .collect();

    // placements/*
    let placement_files =
        read_yaml_dir::<DtoPlacementsFile>(&inv.join("placements"), &mut parse_errors)
            .into_iter()
            .map(|(fp, dto)| {
                let placements_key_present = dto.placements.is_some();
                let sides = dto.placements.unwrap_or_default();
                let front_key_present = sides.front.is_some();
                let rear_key_present = sides.rear.is_some();
                let map_p = |p: DtoPlacement| {
                    let (start_u, start_u_bad) = parse_raw_u32(p.start_u);
                    let (height_u, height_u_bad) = parse_raw_u32(p.height_u);
                    let (tags, tags_malformed) = parse_tags(p.tags);
                    RawPlacement {
                        id: p.id,
                        code: p.code,
                        target_kind: p.target_kind,
                        target_id: p.target_id,
                        start_u,
                        start_u_bad,
                        height_u,
                        height_u_bad,
                        tags,
                        tags_malformed,
                    }
                };
                let front = sides
                    .front
                    .unwrap_or_default()
                    .into_iter()
                    .map(map_p)
                    .collect();
                let rear = sides
                    .rear
                    .unwrap_or_default()
                    .into_iter()
                    .map(map_p)
                    .collect();
                RawPlacementFile {
                    file_path: fp,
                    rack_id: dto.rack_id,
                    placements_key_present,
                    front_key_present,
                    rear_key_present,
                    front,
                    rear,
                }
            })
            .collect();

    RawRepositoryData {
        repo_file,
        locations_file,
        rack_files,
        device_model_files,
        device_files,
        placement_files,
        parse_errors,
    }
}
