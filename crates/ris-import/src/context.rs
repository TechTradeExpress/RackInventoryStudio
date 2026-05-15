use std::collections::{HashMap, HashSet};

use ris_core::DeviceType;
use ris_repository::RepositoryIndex;

#[derive(Debug, Clone)]
pub struct DeviceModelInfo {
    pub id: String,
    pub device_type: DeviceType,
}

/// Repository data needed for CSV import validation.
///
/// Built from `RepositoryIndex`; owns its data so it can outlive the index.
pub struct CsvImportContext {
    device_codes: HashSet<String>,
    serial_numbers: HashSet<String>,
    asset_tags: HashSet<String>,
    device_models_by_code: HashMap<String, DeviceModelInfo>,
}

impl CsvImportContext {
    pub fn from_index(index: &RepositoryIndex) -> Self {
        let device_codes = index.devices_by_code.keys().cloned().collect();

        let mut serial_numbers = HashSet::new();
        let mut asset_tags = HashSet::new();
        for dev in index.devices_by_id.values() {
            if let Some(sn) = &dev.serial_number {
                serial_numbers.insert(sn.clone());
            }
            if let Some(at) = &dev.asset_tag {
                asset_tags.insert(at.clone());
            }
        }

        let device_models_by_code = index
            .device_models_by_code
            .iter()
            .map(|(code, model)| {
                (
                    code.clone(),
                    DeviceModelInfo {
                        id: model.id.clone(),
                        device_type: model.device_type.clone(),
                    },
                )
            })
            .collect();

        Self {
            device_codes,
            serial_numbers,
            asset_tags,
            device_models_by_code,
        }
    }

    /// An empty context — no existing devices or models.  Useful in tests.
    pub fn empty() -> Self {
        Self {
            device_codes: HashSet::new(),
            serial_numbers: HashSet::new(),
            asset_tags: HashSet::new(),
            device_models_by_code: HashMap::new(),
        }
    }

    pub fn has_device_code(&self, code: &str) -> bool {
        self.device_codes.contains(code)
    }

    pub fn has_serial_number(&self, sn: &str) -> bool {
        self.serial_numbers.contains(sn)
    }

    pub fn has_asset_tag(&self, at: &str) -> bool {
        self.asset_tags.contains(at)
    }

    pub fn get_device_model_by_code(&self, code: &str) -> Option<&DeviceModelInfo> {
        self.device_models_by_code.get(code)
    }
}
