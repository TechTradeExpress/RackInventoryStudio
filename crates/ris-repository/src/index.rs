use std::collections::HashMap;

use ris_core::{
    Device, DeviceModel, Location, Placement, PlacementFile, PlacementSide, PlacementTargetKind,
    Rack,
};

use crate::data::RepositoryData;

#[derive(Debug, Clone)]
pub struct IndexedPlacement {
    pub rack_id: String,
    pub side: PlacementSide,
    pub placement: Placement,
}

pub struct RepositoryIndex {
    pub locations_by_id: HashMap<String, Location>,
    pub locations_by_code: HashMap<String, Location>,
    pub racks_by_id: HashMap<String, Rack>,
    pub racks_by_code: HashMap<String, Rack>,
    pub device_models_by_id: HashMap<String, DeviceModel>,
    pub device_models_by_code: HashMap<String, DeviceModel>,
    pub devices_by_id: HashMap<String, Device>,
    pub devices_by_code: HashMap<String, Device>,
    pub placements_by_id: HashMap<String, IndexedPlacement>,
    pub placements_by_code: HashMap<String, IndexedPlacement>,
    pub placements_by_device_id: HashMap<String, Vec<IndexedPlacement>>,
    pub placements_by_rack_id: HashMap<String, Vec<IndexedPlacement>>,
    pub placement_file_by_rack_id: HashMap<String, PlacementFile>,
}

impl RepositoryIndex {
    pub fn build(data: &RepositoryData) -> Self {
        let mut locations_by_id = HashMap::new();
        let mut locations_by_code = HashMap::new();
        for loc in &data.locations {
            locations_by_id.insert(loc.id.clone(), loc.clone());
            locations_by_code.insert(loc.code.clone(), loc.clone());
        }

        let mut racks_by_id = HashMap::new();
        let mut racks_by_code = HashMap::new();
        for rack in &data.racks {
            racks_by_id.insert(rack.id.clone(), rack.clone());
            racks_by_code.insert(rack.code.clone(), rack.clone());
        }

        let mut device_models_by_id = HashMap::new();
        let mut device_models_by_code = HashMap::new();
        for dm in &data.device_models {
            device_models_by_id.insert(dm.id.clone(), dm.clone());
            device_models_by_code.insert(dm.code.clone(), dm.clone());
        }

        let mut devices_by_id = HashMap::new();
        let mut devices_by_code = HashMap::new();
        for dev in &data.devices {
            devices_by_id.insert(dev.id.clone(), dev.clone());
            devices_by_code.insert(dev.code.clone(), dev.clone());
        }

        let mut placements_by_id: HashMap<String, IndexedPlacement> = HashMap::new();
        let mut placements_by_code: HashMap<String, IndexedPlacement> = HashMap::new();
        let mut placements_by_device_id: HashMap<String, Vec<IndexedPlacement>> = HashMap::new();
        let mut placements_by_rack_id: HashMap<String, Vec<IndexedPlacement>> = HashMap::new();
        let mut placement_file_by_rack_id: HashMap<String, PlacementFile> = HashMap::new();

        for pf in &data.placement_files {
            placement_file_by_rack_id.insert(pf.rack_id.clone(), pf.clone());

            let sides: [(&Vec<Placement>, PlacementSide); 2] = [
                (&pf.front, PlacementSide::Front),
                (&pf.rear, PlacementSide::Rear),
            ];
            for (placements, side) in sides {
                for p in placements {
                    let ip = IndexedPlacement {
                        rack_id: pf.rack_id.clone(),
                        side: side.clone(),
                        placement: p.clone(),
                    };
                    placements_by_id.insert(p.id.clone(), ip.clone());
                    placements_by_code.insert(p.code.clone(), ip.clone());

                    placements_by_rack_id
                        .entry(pf.rack_id.clone())
                        .or_default()
                        .push(ip.clone());

                    if p.target_kind == PlacementTargetKind::Device {
                        placements_by_device_id
                            .entry(p.target_id.clone())
                            .or_default()
                            .push(ip);
                    }
                }
            }
        }

        Self {
            locations_by_id,
            locations_by_code,
            racks_by_id,
            racks_by_code,
            device_models_by_id,
            device_models_by_code,
            devices_by_id,
            devices_by_code,
            placements_by_id,
            placements_by_code,
            placements_by_device_id,
            placements_by_rack_id,
            placement_file_by_rack_id,
        }
    }

    pub fn get_location_by_id(&self, id: &str) -> Option<&Location> {
        self.locations_by_id.get(id)
    }

    pub fn get_location_by_code(&self, code: &str) -> Option<&Location> {
        self.locations_by_code.get(code)
    }

    pub fn get_rack_by_id(&self, id: &str) -> Option<&Rack> {
        self.racks_by_id.get(id)
    }

    pub fn get_rack_by_code(&self, code: &str) -> Option<&Rack> {
        self.racks_by_code.get(code)
    }

    pub fn get_device_model_by_id(&self, id: &str) -> Option<&DeviceModel> {
        self.device_models_by_id.get(id)
    }

    pub fn get_device_model_by_code(&self, code: &str) -> Option<&DeviceModel> {
        self.device_models_by_code.get(code)
    }

    pub fn get_device_by_id(&self, id: &str) -> Option<&Device> {
        self.devices_by_id.get(id)
    }

    pub fn get_device_by_code(&self, code: &str) -> Option<&Device> {
        self.devices_by_code.get(code)
    }

    pub fn get_placement_by_id(&self, id: &str) -> Option<&IndexedPlacement> {
        self.placements_by_id.get(id)
    }

    pub fn get_placement_by_code(&self, code: &str) -> Option<&IndexedPlacement> {
        self.placements_by_code.get(code)
    }

    pub fn get_placements_for_rack(&self, rack_id: &str) -> &[IndexedPlacement] {
        self.placements_by_rack_id
            .get(rack_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn get_placements_for_device(&self, device_id: &str) -> &[IndexedPlacement] {
        self.placements_by_device_id
            .get(device_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }
}
