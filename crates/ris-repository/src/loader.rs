use std::path::Path;
use std::str::FromStr;

use ris_core::{
    Device, DeviceModel, DeviceStatus, DeviceType, Location, Placement, PlacementFile,
    PlacementTargetKind, Rack, RepositoryMetadata,
};

use crate::data::RepositoryData;
use crate::error::LoadError;
use crate::yaml::{
    device::YamlDevicesFile, device_model::YamlDeviceModelsFile, location::YamlLocationsFile,
    placement::YamlPlacementsFile, rack::YamlRacksFile, repo::YamlRepoFile,
};

fn read_yaml<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, LoadError> {
    let text = std::fs::read_to_string(path).map_err(|e| LoadError::Io {
        path: path.display().to_string(),
        source: e,
    })?;
    serde_yaml::from_str(&text).map_err(|e| LoadError::Yaml {
        path: path.display().to_string(),
        source: e,
    })
}

fn read_yaml_glob<T: serde::de::DeserializeOwned>(
    dir: &Path,
) -> Result<Vec<(String, T)>, LoadError> {
    let mut results = Vec::new();
    if !dir.exists() {
        return Ok(results);
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| LoadError::Io {
            path: dir.display().to_string(),
            source: e,
        })?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == "yaml"))
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let parsed: T = read_yaml(&path)?;
        results.push((path.display().to_string(), parsed));
    }
    Ok(results)
}

pub fn load(repo_path: &Path) -> Result<RepositoryData, LoadError> {
    let inv = repo_path.join("inventory");

    // repo.yaml
    let repo_file: YamlRepoFile = read_yaml(&inv.join("repo.yaml"))?;
    let metadata = RepositoryMetadata {
        id: repo_file.repository.id,
        code: repo_file.repository.code,
        name: repo_file.repository.name,
        format: repo_file.format,
        version: repo_file.version,
    };

    // locations
    let loc_file: YamlLocationsFile = read_yaml(&inv.join("locations.yaml"))?;
    let locations: Vec<Location> = loc_file
        .locations
        .into_iter()
        .map(|y| Location {
            id: y.id,
            code: y.code,
            name: y.name,
            description: y.description,
            address: y.address,
            tags: y.tags,
        })
        .collect();

    // device-models
    let mut device_models: Vec<DeviceModel> = Vec::new();
    for (path, file) in read_yaml_glob::<YamlDeviceModelsFile>(&inv.join("device-models"))? {
        let dt = DeviceType::from_str(&file.device_type).map_err(|_| LoadError::InvalidValue {
            path: path.clone(),
            value: file.device_type.clone(),
            message: "unknown device_type".into(),
        })?;
        for y in file.models {
            let name = y.name.ok_or_else(|| LoadError::MissingField {
                path: path.clone(),
                field: "name",
                code: "VAL-MODEL-004",
            })?;
            let default_height_u = y.default_height_u.ok_or_else(|| LoadError::MissingField {
                path: path.clone(),
                field: "default_height_u",
                code: "VAL-MODEL-004",
            })?;
            device_models.push(DeviceModel {
                id: y.id,
                code: y.code,
                device_type: dt.clone(),
                name,
                vendor: y.vendor,
                model: y.model,
                default_height_u,
                description: y.description,
                tags: y.tags,
            });
        }
    }

    // devices
    let mut devices: Vec<Device> = Vec::new();
    for (path, file) in read_yaml_glob::<YamlDevicesFile>(&inv.join("devices"))? {
        let dt = DeviceType::from_str(&file.device_type).map_err(|_| LoadError::InvalidValue {
            path: path.clone(),
            value: file.device_type.clone(),
            message: "unknown device_type".into(),
        })?;
        for y in file.devices {
            let status =
                DeviceStatus::from_str(&y.status).map_err(|_| LoadError::InvalidValue {
                    path: path.clone(),
                    value: y.status.clone(),
                    message: "unknown status".into(),
                })?;
            devices.push(Device {
                id: y.id,
                code: y.code,
                device_type: dt.clone(),
                name: y.name,
                device_model_id: y.device_model_id,
                serial_number: y.serial_number,
                asset_tag: y.asset_tag,
                external_ref: y.external_ref,
                status,
                description: y.description,
                tags: y.tags,
            });
        }
    }

    // racks
    let mut racks: Vec<Rack> = Vec::new();
    for (path, file) in read_yaml_glob::<YamlRacksFile>(&inv.join("racks"))? {
        for y in file.racks {
            let name = y.name.ok_or_else(|| LoadError::MissingField {
                path: path.clone(),
                field: "name",
                code: "VAL-RACK-004",
            })?;
            let height_u = y.height_u.ok_or_else(|| LoadError::MissingField {
                path: path.clone(),
                field: "height_u",
                code: "VAL-RACK-004",
            })?;
            racks.push(Rack {
                id: y.id,
                code: y.code,
                name,
                location_id: file.location_id.clone(),
                height_u,
                row: y.row,
                description: y.description,
                tags: y.tags,
            });
        }
    }

    // placements
    let mut placement_files: Vec<PlacementFile> = Vec::new();
    for (path, file) in read_yaml_glob::<YamlPlacementsFile>(&inv.join("placements"))? {
        let map_placement = |y: crate::yaml::placement::YamlPlacement| {
            let target_kind = PlacementTargetKind::from_str(&y.target_kind).map_err(|_| {
                LoadError::InvalidValue {
                    path: path.clone(),
                    value: y.target_kind.clone(),
                    message: "unknown target_kind".into(),
                }
            })?;
            Ok::<Placement, LoadError>(Placement {
                id: y.id,
                code: y.code,
                target_kind,
                target_id: y.target_id,
                start_u: y.start_u,
                height_u: y.height_u,
                note: y.note,
                tags: y.tags,
            })
        };

        let front: Result<Vec<_>, _> = file
            .placements
            .front
            .into_iter()
            .map(&map_placement)
            .collect();
        let rear: Result<Vec<_>, _> = file
            .placements
            .rear
            .into_iter()
            .map(&map_placement)
            .collect();

        placement_files.push(PlacementFile {
            rack_id: file.rack_id,
            front: front?,
            rear: rear?,
        });
    }

    Ok(RepositoryData {
        metadata,
        locations,
        racks,
        device_models,
        devices,
        placement_files,
    })
}
