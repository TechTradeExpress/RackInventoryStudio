use std::path::{Path, PathBuf};

use ris_core::{
    Device, DeviceModel, DeviceStatus, DeviceType, Location, PlacementFile, Rack, ValidationIssue,
};
use ris_import::{preview_csv_import, CsvDeviceImportPreview, CsvImportContext};
use ris_repository::{IndexedPlacement, RepositoryData, RepositoryIndex, WriteReport};
use ris_validation::ValidationEngine;

use crate::error::ApplicationError;

pub struct RepositorySession {
    pub repo_path: PathBuf,
    pub data: RepositoryData,
    pub index: RepositoryIndex,
}

// ── Input types ───────────────────────────────────────────────────────────────

pub struct AddLocationInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
}

pub struct AddRackInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    /// One of location_id or location_code must be provided.
    pub location_id: Option<String>,
    pub location_code: Option<String>,
    pub code: String,
    pub name: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

pub struct AddDeviceModelInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    pub device_type: DeviceType,
    pub code: String,
    pub name: String,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

pub struct AddDeviceInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    pub device_type: DeviceType,
    pub code: String,
    pub name: Option<String>,
    /// Provide model id directly, or use device_model_code for code-based lookup.
    pub device_model_id: Option<String>,
    pub device_model_code: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: DeviceStatus,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

// ── Validation helpers ────────────────────────────────────────────────────────

fn is_blank(s: &str) -> bool {
    s.trim().is_empty()
}

fn opt_has_nonblank(opt: &Option<String>) -> bool {
    opt.as_deref().map(|s| !is_blank(s)).unwrap_or(false)
}

impl RepositorySession {
    fn id_exists_globally(&self, id: &str) -> bool {
        self.index.locations_by_id.contains_key(id)
            || self.index.racks_by_id.contains_key(id)
            || self.index.device_models_by_id.contains_key(id)
            || self.index.devices_by_id.contains_key(id)
            || self.index.placements_by_id.contains_key(id)
    }
}

// ── Free functions ────────────────────────────────────────────────────────────

pub fn open_repository(path: &Path) -> Result<RepositorySession, ApplicationError> {
    let data = ris_repository::load(path)?;
    let index = RepositoryIndex::build(&data);
    Ok(RepositorySession {
        repo_path: path.to_path_buf(),
        data,
        index,
    })
}

pub fn validate_repository(path: &Path) -> Result<Vec<ValidationIssue>, ApplicationError> {
    Ok(ValidationEngine::validate(path))
}

// ── RepositorySession ─────────────────────────────────────────────────────────

impl RepositorySession {
    fn rebuild_index(&mut self) {
        self.index = RepositoryIndex::build(&self.data);
    }

    /// Validate the current on-disk state via ValidationEngine.
    pub fn validate(&self) -> Vec<ValidationIssue> {
        ValidationEngine::validate(&self.repo_path)
    }

    /// Write the current in-memory data to disk using the YAML writer.
    pub fn save(&mut self) -> Result<WriteReport, ApplicationError> {
        Ok(ris_repository::write_repository(
            &self.repo_path,
            &self.data,
        )?)
    }

    // ── Query helpers ─────────────────────────────────────────────────────────

    pub fn list_locations(&self) -> &[Location] {
        &self.data.locations
    }

    pub fn list_racks(&self) -> &[Rack] {
        &self.data.racks
    }

    pub fn list_device_models(&self) -> &[DeviceModel] {
        &self.data.device_models
    }

    pub fn list_devices(&self) -> &[Device] {
        &self.data.devices
    }

    pub fn get_unplaced_devices(&self) -> Vec<&Device> {
        self.data
            .devices
            .iter()
            .filter(|d| {
                self.index
                    .placements_by_device_id
                    .get(&d.id)
                    .map(|v| v.is_empty())
                    .unwrap_or(true)
            })
            .collect()
    }

    pub fn get_placements_for_rack(&self, rack_id: &str) -> &[IndexedPlacement] {
        self.index.get_placements_for_rack(rack_id)
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    pub fn add_location(&mut self, input: AddLocationInput) -> Result<String, ApplicationError> {
        if is_blank(&input.code) {
            return Err(ApplicationError::InvalidInput(
                "code must not be blank".into(),
            ));
        }
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if let Some(ref id) = input.id {
            if self.id_exists_globally(id) {
                return Err(ApplicationError::DuplicateId(id.clone()));
            }
        }
        if self.index.locations_by_code.contains_key(&input.code) {
            return Err(ApplicationError::DuplicateCode(input.code));
        }
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.locations.push(Location {
            id: id.clone(),
            code: input.code,
            name: input.name,
            description: input.description,
            address: input.address,
            tags: input.tags,
        });
        self.rebuild_index();
        Ok(id)
    }

    pub fn add_rack(&mut self, input: AddRackInput) -> Result<String, ApplicationError> {
        if is_blank(&input.code) {
            return Err(ApplicationError::InvalidInput(
                "code must not be blank".into(),
            ));
        }
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if let Some(ref id) = input.id {
            if self.id_exists_globally(id) {
                return Err(ApplicationError::DuplicateId(id.clone()));
            }
        }
        let location_id = match (input.location_id, input.location_code) {
            (Some(lid), _) => {
                if !self.index.locations_by_id.contains_key(&lid) {
                    return Err(ApplicationError::NotFound(format!("location id: {lid}")));
                }
                lid
            }
            (None, Some(lcode)) => self
                .index
                .locations_by_code
                .get(&lcode)
                .map(|l| l.id.clone())
                .ok_or_else(|| ApplicationError::NotFound(format!("location code: {lcode}")))?,
            (None, None) => {
                return Err(ApplicationError::InvalidInput(
                    "location_id or location_code is required".into(),
                ))
            }
        };

        if input.height_u == 0 {
            return Err(ApplicationError::InvalidInput(
                "height_u must be > 0".into(),
            ));
        }
        if self.index.racks_by_code.contains_key(&input.code) {
            return Err(ApplicationError::DuplicateCode(input.code));
        }

        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.racks.push(Rack {
            id: id.clone(),
            code: input.code,
            name: input.name,
            location_id,
            height_u: input.height_u,
            row: input.row,
            description: input.description,
            tags: input.tags,
        });
        // create an empty placement file for the new rack
        self.data.placement_files.push(PlacementFile {
            rack_id: id.clone(),
            front: vec![],
            rear: vec![],
        });
        self.rebuild_index();
        Ok(id)
    }

    pub fn add_device_model(
        &mut self,
        input: AddDeviceModelInput,
    ) -> Result<String, ApplicationError> {
        if is_blank(&input.code) {
            return Err(ApplicationError::InvalidInput(
                "code must not be blank".into(),
            ));
        }
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if let Some(ref id) = input.id {
            if self.id_exists_globally(id) {
                return Err(ApplicationError::DuplicateId(id.clone()));
            }
        }
        if input.default_height_u == 0 {
            return Err(ApplicationError::InvalidInput(
                "default_height_u must be > 0".into(),
            ));
        }
        if self.index.device_models_by_code.contains_key(&input.code) {
            return Err(ApplicationError::DuplicateCode(input.code));
        }
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.device_models.push(DeviceModel {
            id: id.clone(),
            code: input.code,
            device_type: input.device_type,
            name: input.name,
            vendor: input.vendor,
            model: input.model,
            default_height_u: input.default_height_u,
            description: input.description,
            tags: input.tags,
        });
        self.rebuild_index();
        Ok(id)
    }

    pub fn add_device(&mut self, input: AddDeviceInput) -> Result<String, ApplicationError> {
        if is_blank(&input.code) {
            return Err(ApplicationError::InvalidInput(
                "code must not be blank".into(),
            ));
        }
        if let Some(ref id) = input.id {
            if self.id_exists_globally(id) {
                return Err(ApplicationError::DuplicateId(id.clone()));
            }
        }
        if input.device_type == DeviceType::RackObject {
            return Err(ApplicationError::InvalidInput(
                "device_type rack_object is not allowed for device instances".into(),
            ));
        }
        if self.index.devices_by_code.contains_key(&input.code) {
            return Err(ApplicationError::DuplicateCode(input.code));
        }
        if !opt_has_nonblank(&input.name)
            && !opt_has_nonblank(&input.serial_number)
            && !opt_has_nonblank(&input.asset_tag)
        {
            return Err(ApplicationError::InvalidInput(
                "at least one of name, serial_number, or asset_tag must be non-blank".into(),
            ));
        }

        // resolve model: id takes priority over code
        let resolved_model_id: Option<String> = if let Some(ref mid) = input.device_model_id {
            let model = self
                .index
                .device_models_by_id
                .get(mid.as_str())
                .ok_or_else(|| ApplicationError::NotFound(format!("device_model id: {mid}")))?;
            if model.device_type == DeviceType::RackObject {
                return Err(ApplicationError::InvalidInput(
                    "device must not reference a rack_object model".into(),
                ));
            }
            if model.device_type != input.device_type {
                return Err(ApplicationError::InvalidInput(format!(
                    "device_type mismatch: device is {} but model is {}",
                    input.device_type.as_str(),
                    model.device_type.as_str()
                )));
            }
            Some(mid.clone())
        } else if let Some(ref mcode) = input.device_model_code {
            let model = self
                .index
                .device_models_by_code
                .get(mcode.as_str())
                .ok_or_else(|| ApplicationError::NotFound(format!("device_model code: {mcode}")))?;
            if model.device_type == DeviceType::RackObject {
                return Err(ApplicationError::InvalidInput(
                    "device must not reference a rack_object model".into(),
                ));
            }
            if model.device_type != input.device_type {
                return Err(ApplicationError::InvalidInput(format!(
                    "device_type mismatch: device is {} but model is {}",
                    input.device_type.as_str(),
                    model.device_type.as_str()
                )));
            }
            Some(model.id.clone())
        } else {
            None
        };

        // uniqueness checks for serial / asset tag
        if let Some(ref sn) = input.serial_number {
            if self
                .data
                .devices
                .iter()
                .any(|d| d.serial_number.as_deref() == Some(sn.as_str()))
            {
                return Err(ApplicationError::DuplicateSerialNumber(sn.clone()));
            }
        }
        if let Some(ref at) = input.asset_tag {
            if self
                .data
                .devices
                .iter()
                .any(|d| d.asset_tag.as_deref() == Some(at.as_str()))
            {
                return Err(ApplicationError::DuplicateAssetTag(at.clone()));
            }
        }

        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.devices.push(Device {
            id: id.clone(),
            code: input.code,
            device_type: input.device_type,
            name: input.name,
            device_model_id: resolved_model_id,
            serial_number: input.serial_number,
            asset_tag: input.asset_tag,
            external_ref: input.external_ref,
            status: input.status,
            description: input.description,
            tags: input.tags,
        });
        self.rebuild_index();
        Ok(id)
    }

    // ── CSV preview ───────────────────────────────────────────────────────────

    pub fn preview_devices_csv(&self, csv_content: &str) -> CsvDeviceImportPreview {
        let ctx = CsvImportContext::from_index(&self.index);
        preview_csv_import(csv_content, &ctx)
    }
}
