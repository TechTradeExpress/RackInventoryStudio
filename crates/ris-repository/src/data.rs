use ris_core::{Device, DeviceModel, Location, PlacementFile, Rack, RepositoryMetadata};

pub struct RepositoryData {
    pub metadata: RepositoryMetadata,
    pub locations: Vec<Location>,
    pub racks: Vec<Rack>,
    pub device_models: Vec<DeviceModel>,
    pub devices: Vec<Device>,
    pub placement_files: Vec<PlacementFile>,
}
