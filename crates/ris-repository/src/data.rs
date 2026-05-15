use std::path::PathBuf;

use ris_core::{
    Device, DeviceModel, DeviceType, Location, PlacementFile, Rack, RepositoryMetadata,
};

pub struct RackFileLayout {
    pub path: PathBuf,
    pub location_id: String,
    pub rack_ids: Vec<String>,
}

pub struct DeviceModelFileLayout {
    pub path: PathBuf,
    pub device_type: DeviceType,
    pub model_ids: Vec<String>,
}

pub struct DeviceFileLayout {
    pub path: PathBuf,
    pub device_type: DeviceType,
    pub device_ids: Vec<String>,
}

pub struct PlacementFileLayout {
    pub path: PathBuf,
    pub rack_id: String,
}

#[derive(Default)]
pub struct RepositoryLayout {
    pub rack_files: Vec<RackFileLayout>,
    pub device_model_files: Vec<DeviceModelFileLayout>,
    pub device_files: Vec<DeviceFileLayout>,
    pub placement_files: Vec<PlacementFileLayout>,
}

pub struct RepositoryData {
    pub metadata: RepositoryMetadata,
    pub locations: Vec<Location>,
    pub racks: Vec<Rack>,
    pub device_models: Vec<DeviceModel>,
    pub devices: Vec<Device>,
    pub placement_files: Vec<PlacementFile>,
    pub layout: RepositoryLayout,
}
