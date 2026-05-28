use std::collections::{HashMap, HashSet};

use ris_core::DeviceType;
use ris_repository::RepositoryIndex;

#[derive(Debug, Clone)]
pub struct DeviceModelInfo {
    pub id: String,
    pub device_type: DeviceType,
}

fn norm_id(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Repository data needed for CSV import validation.
///
/// Built from `RepositoryIndex`; owns its data so it can outlive the index.
/// Identifier sets (serial_number, asset_tag, external_ref) are stored as
/// normalized (trimmed, lowercased) keys for case-insensitive uniqueness checks.
pub struct CsvImportContext {
    device_codes: HashSet<String>,
    serial_numbers: HashSet<String>,
    asset_tags: HashSet<String>,
    external_refs: HashSet<String>,
    device_models_by_code: HashMap<String, DeviceModelInfo>,
}

impl CsvImportContext {
    pub fn from_index(index: &RepositoryIndex) -> Self {
        let device_codes = index.devices_by_code.keys().cloned().collect();

        let mut serial_numbers = HashSet::new();
        let mut asset_tags = HashSet::new();
        let mut external_refs = HashSet::new();
        for dev in index.devices_by_id.values() {
            if let Some(sn) = &dev.serial_number {
                let key = norm_id(sn);
                if !key.is_empty() {
                    serial_numbers.insert(key);
                }
            }
            if let Some(at) = &dev.asset_tag {
                let key = norm_id(at);
                if !key.is_empty() {
                    asset_tags.insert(key);
                }
            }
            if let Some(er) = &dev.external_ref {
                let key = norm_id(er);
                if !key.is_empty() {
                    external_refs.insert(key);
                }
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
            external_refs,
            device_models_by_code,
        }
    }

    /// An empty context — no existing devices or models.  Useful in tests.
    pub fn empty() -> Self {
        Self {
            device_codes: HashSet::new(),
            serial_numbers: HashSet::new(),
            asset_tags: HashSet::new(),
            external_refs: HashSet::new(),
            device_models_by_code: HashMap::new(),
        }
    }

    pub fn has_device_code(&self, code: &str) -> bool {
        self.device_codes.contains(code)
    }

    /// `sn` must already be normalized (trimmed, lowercased) by the caller.
    pub fn has_serial_number(&self, sn: &str) -> bool {
        self.serial_numbers.contains(sn)
    }

    /// `at` must already be normalized (trimmed, lowercased) by the caller.
    pub fn has_asset_tag(&self, at: &str) -> bool {
        self.asset_tags.contains(at)
    }

    /// `er` must already be normalized (trimmed, lowercased) by the caller.
    pub fn has_external_ref(&self, er: &str) -> bool {
        self.external_refs.contains(er)
    }

    pub fn get_device_model_by_code(&self, code: &str) -> Option<&DeviceModelInfo> {
        self.device_models_by_code.get(code)
    }
}
