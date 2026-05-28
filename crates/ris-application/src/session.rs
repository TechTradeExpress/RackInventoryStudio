use std::path::{Path, PathBuf};

use ris_core::{
    Device, DeviceModel, DeviceStatus, DeviceType, Location, Placement, PlacementFile,
    PlacementRange, PlacementSide, PlacementTargetKind, Rack, ValidationIssue,
};
use ris_import::{preview_csv_import, CsvDeviceImportPreview, CsvImportContext, CsvRowAction};
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
    /// None or blank → backend generates a unique code automatically.
    pub code: Option<String>,
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
    /// None or blank → backend generates a unique code automatically.
    pub code: Option<String>,
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
    /// None or blank → backend generates a unique code automatically.
    pub code: Option<String>,
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
    /// None or blank → backend generates a unique code automatically.
    pub code: Option<String>,
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

pub struct UpdateLocationInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
}

pub struct UpdateRackInput {
    pub id: String,
    pub location_id: String,
    pub name: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

pub struct UpdateDeviceModelInput {
    pub id: String,
    pub device_type: DeviceType,
    pub name: String,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

pub struct UpdateDeviceInput {
    pub id: String,
    pub device_type: DeviceType,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: DeviceStatus,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug)]
pub struct DeviceCsvImportResult {
    pub created_count: usize,
    pub warning_count: usize,
}

// ── Validation helpers ────────────────────────────────────────────────────────

fn is_blank(s: &str) -> bool {
    s.trim().is_empty()
}

fn opt_has_nonblank(opt: &Option<String>) -> bool {
    opt.as_deref().map(|s| !is_blank(s)).unwrap_or(false)
}

/// Normalize an identifier for uniqueness comparison: trim whitespace, lowercase.
/// Returns None when the value is blank after trimming.
fn normalize_id(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_lowercase())
    }
}

fn opt_normalize_id(opt: &Option<String>) -> Option<String> {
    opt.as_deref().and_then(normalize_id)
}

// ── Code generation ───────────────────────────────────────────────────────────

fn generate_location_code(index: &ris_repository::RepositoryIndex) -> String {
    for n in 1u32.. {
        let code = format!("location-{n:02}");
        if !index.locations_by_code.contains_key(&code) {
            return code;
        }
    }
    unreachable!()
}

fn generate_rack_code(
    index: &ris_repository::RepositoryIndex,
    location_code: Option<&str>,
) -> String {
    let prefix = match location_code {
        Some(lc) if !lc.is_empty() => format!("{lc}-rack-"),
        _ => "rack-".to_string(),
    };
    for n in 1u32.. {
        let code = format!("{prefix}{n:02}");
        if !index.racks_by_code.contains_key(&code) {
            return code;
        }
    }
    unreachable!()
}

fn generate_device_model_code(
    index: &ris_repository::RepositoryIndex,
    device_type: &DeviceType,
) -> String {
    let prefix = match device_type {
        DeviceType::Server => "model-server-",
        DeviceType::Network => "model-network-",
        DeviceType::Storage => "model-storage-",
        DeviceType::Ups => "model-ups-",
        DeviceType::Appliance => "model-appliance-",
        DeviceType::RackObject => "model-rack-obj-",
        DeviceType::Other => "model-other-",
    };
    for n in 1u32.. {
        let code = format!("{prefix}{n:02}");
        if !index.device_models_by_code.contains_key(&code) {
            return code;
        }
    }
    unreachable!()
}

fn generate_device_code(index: &ris_repository::RepositoryIndex) -> String {
    for n in 1u32.. {
        let code = format!("device-{n:02}");
        if !index.devices_by_code.contains_key(&code) {
            return code;
        }
    }
    unreachable!()
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
        let code = match input.code.as_deref() {
            Some(c) if !is_blank(c) => {
                if self.index.locations_by_code.contains_key(c) {
                    return Err(ApplicationError::DuplicateCode(c.to_string()));
                }
                c.to_string()
            }
            _ => generate_location_code(&self.index),
        };
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.locations.push(Location {
            id: id.clone(),
            code,
            name: input.name,
            description: input.description,
            address: input.address,
            tags: input.tags,
        });
        self.rebuild_index();
        Ok(id)
    }

    pub fn add_rack(&mut self, input: AddRackInput) -> Result<String, ApplicationError> {
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
        let location_code = self
            .index
            .locations_by_id
            .get(&location_id)
            .map(|l| l.code.as_str());
        let code = match input.code.as_deref() {
            Some(c) if !is_blank(c) => {
                if self.index.racks_by_code.contains_key(c) {
                    return Err(ApplicationError::DuplicateCode(c.to_string()));
                }
                c.to_string()
            }
            _ => generate_rack_code(&self.index, location_code),
        };

        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.racks.push(Rack {
            id: id.clone(),
            code,
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
        let code = match input.code.as_deref() {
            Some(c) if !is_blank(c) => {
                if self.index.device_models_by_code.contains_key(c) {
                    return Err(ApplicationError::DuplicateCode(c.to_string()));
                }
                c.to_string()
            }
            _ => generate_device_model_code(&self.index, &input.device_type),
        };
        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.device_models.push(DeviceModel {
            id: id.clone(),
            code,
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
        let code = match input.code.as_deref() {
            Some(c) if !is_blank(c) => {
                if self.index.devices_by_code.contains_key(c) {
                    return Err(ApplicationError::DuplicateCode(c.to_string()));
                }
                c.to_string()
            }
            _ => generate_device_code(&self.index),
        };
        if !opt_has_nonblank(&input.name)
            && !opt_has_nonblank(&input.serial_number)
            && !opt_has_nonblank(&input.asset_tag)
            && !opt_has_nonblank(&input.external_ref)
        {
            return Err(ApplicationError::InvalidInput(
                "at least one of name, serial_number, asset_tag, or external_ref must be non-blank"
                    .into(),
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

        // uniqueness checks: trim + case-insensitive, store trimmed original
        let sn_trimmed = input
            .serial_number
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref sn) = sn_trimmed {
            let sn_norm = sn.to_lowercase();
            if self
                .data
                .devices
                .iter()
                .any(|d| opt_normalize_id(&d.serial_number).as_deref() == Some(sn_norm.as_str()))
            {
                return Err(ApplicationError::DuplicateSerialNumber(sn.clone()));
            }
        }
        let at_trimmed = input
            .asset_tag
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref at) = at_trimmed {
            let at_norm = at.to_lowercase();
            if self
                .data
                .devices
                .iter()
                .any(|d| opt_normalize_id(&d.asset_tag).as_deref() == Some(at_norm.as_str()))
            {
                return Err(ApplicationError::DuplicateAssetTag(at.clone()));
            }
        }
        let er_trimmed = input
            .external_ref
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref er) = er_trimmed {
            let er_norm = er.to_lowercase();
            if self
                .data
                .devices
                .iter()
                .any(|d| opt_normalize_id(&d.external_ref).as_deref() == Some(er_norm.as_str()))
            {
                return Err(ApplicationError::DuplicateExternalRef(er.clone()));
            }
        }

        let id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.data.devices.push(Device {
            id: id.clone(),
            code,
            device_type: input.device_type,
            name: input.name,
            device_model_id: resolved_model_id,
            serial_number: sn_trimmed,
            asset_tag: at_trimmed,
            external_ref: er_trimmed,
            status: input.status,
            description: input.description,
            tags: input.tags,
        });
        self.rebuild_index();
        Ok(id)
    }

    pub fn update_location(&mut self, input: UpdateLocationInput) -> Result<(), ApplicationError> {
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if !self.index.locations_by_id.contains_key(&input.id) {
            return Err(ApplicationError::NotFound(format!(
                "location id: {}",
                input.id
            )));
        }
        let loc = self
            .data
            .locations
            .iter_mut()
            .find(|l| l.id == input.id)
            .unwrap();
        loc.name = input.name;
        loc.description = input.description;
        loc.address = input.address;
        loc.tags = input.tags;
        self.rebuild_index();
        Ok(())
    }

    pub fn delete_location(&mut self, id: &str) -> Result<(), ApplicationError> {
        if !self.index.locations_by_id.contains_key(id) {
            return Err(ApplicationError::NotFound(format!("location id: {id}")));
        }
        if self.data.racks.iter().any(|r| r.location_id == id) {
            return Err(ApplicationError::InvalidInput(
                "Cannot delete location because racks still reference it.".into(),
            ));
        }
        self.data.locations.retain(|l| l.id != id);
        self.rebuild_index();
        Ok(())
    }

    pub fn update_rack(&mut self, input: UpdateRackInput) -> Result<(), ApplicationError> {
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if input.height_u == 0 {
            return Err(ApplicationError::InvalidInput(
                "height_u must be > 0".into(),
            ));
        }
        if !self.index.racks_by_id.contains_key(&input.id) {
            return Err(ApplicationError::NotFound(format!("rack id: {}", input.id)));
        }
        if !self.index.locations_by_id.contains_key(&input.location_id) {
            return Err(ApplicationError::NotFound(format!(
                "location id: {}",
                input.location_id
            )));
        }
        // Reject height reduction if any placement would fall outside the new bounds.
        for ip in self.index.get_placements_for_rack(&input.id) {
            let model = self.model_for_placement(&ip.placement);
            if let Some(range) = ip.placement.placement_range(model) {
                if range.end_u > input.height_u {
                    return Err(ApplicationError::InvalidInput(format!(
                        "Cannot reduce rack height to {} U: placement {} occupies up to U{}",
                        input.height_u, ip.placement.code, range.end_u
                    )));
                }
            }
        }
        let rack = self
            .data
            .racks
            .iter_mut()
            .find(|r| r.id == input.id)
            .unwrap();
        rack.location_id = input.location_id;
        rack.name = input.name;
        rack.height_u = input.height_u;
        rack.row = input.row;
        rack.description = input.description;
        rack.tags = input.tags;
        self.rebuild_index();
        Ok(())
    }

    pub fn delete_rack(&mut self, id: &str) -> Result<(), ApplicationError> {
        if !self.index.racks_by_id.contains_key(id) {
            return Err(ApplicationError::NotFound(format!("rack id: {id}")));
        }
        let has_placements = self
            .index
            .placements_by_rack_id
            .get(id)
            .map(|v| !v.is_empty())
            .unwrap_or(false);
        if has_placements {
            return Err(ApplicationError::InvalidInput(
                "Cannot delete rack because placements still reference it.".into(),
            ));
        }
        self.data.racks.retain(|r| r.id != id);
        self.data.placement_files.retain(|pf| pf.rack_id != id);
        self.rebuild_index();
        Ok(())
    }

    pub fn update_device_model(
        &mut self,
        input: UpdateDeviceModelInput,
    ) -> Result<(), ApplicationError> {
        if is_blank(&input.name) {
            return Err(ApplicationError::InvalidInput(
                "name must not be blank".into(),
            ));
        }
        if input.default_height_u == 0 {
            return Err(ApplicationError::InvalidInput(
                "default_height_u must be > 0".into(),
            ));
        }
        let current_type = self
            .index
            .device_models_by_id
            .get(&input.id)
            .ok_or_else(|| ApplicationError::NotFound(format!("device_model id: {}", input.id)))?
            .device_type
            .clone();
        if input.device_type != current_type {
            // Reject if any device references this model.
            let referenced_by_device = self
                .data
                .devices
                .iter()
                .any(|d| d.device_model_id.as_deref() == Some(&input.id));
            // Reject if any rack-object placement targets this model.
            let referenced_by_placement = self.index.placements_by_id.values().any(|ip| {
                ip.placement.target_kind == PlacementTargetKind::DeviceModel
                    && ip.placement.target_id == input.id
            });
            if referenced_by_device || referenced_by_placement {
                return Err(ApplicationError::InvalidInput(
                    "Cannot change device_type because devices or rack-object placements still reference this model.".into(),
                ));
            }
        }
        let model = self
            .data
            .device_models
            .iter_mut()
            .find(|m| m.id == input.id)
            .unwrap();
        model.device_type = input.device_type;
        model.name = input.name;
        model.vendor = input.vendor;
        model.model = input.model;
        model.default_height_u = input.default_height_u;
        model.description = input.description;
        model.tags = input.tags;
        self.rebuild_index();
        Ok(())
    }

    pub fn delete_device_model(&mut self, id: &str) -> Result<(), ApplicationError> {
        if !self.index.device_models_by_id.contains_key(id) {
            return Err(ApplicationError::NotFound(format!("device_model id: {id}")));
        }
        let referenced_by_device = self
            .data
            .devices
            .iter()
            .any(|d| d.device_model_id.as_deref() == Some(id));
        let referenced_by_placement = self.index.placements_by_id.values().any(|ip| {
            ip.placement.target_kind == PlacementTargetKind::DeviceModel
                && ip.placement.target_id == id
        });
        if referenced_by_device || referenced_by_placement {
            return Err(ApplicationError::InvalidInput(
                "Cannot delete device model because devices or rack-object placements still reference it.".into(),
            ));
        }
        self.data.device_models.retain(|m| m.id != id);
        self.rebuild_index();
        Ok(())
    }

    pub fn update_device(&mut self, input: UpdateDeviceInput) -> Result<(), ApplicationError> {
        if input.device_type == DeviceType::RackObject {
            return Err(ApplicationError::InvalidInput(
                "device_type rack_object is not allowed for device instances".into(),
            ));
        }
        if !opt_has_nonblank(&input.name)
            && !opt_has_nonblank(&input.serial_number)
            && !opt_has_nonblank(&input.asset_tag)
            && !opt_has_nonblank(&input.external_ref)
        {
            return Err(ApplicationError::InvalidInput(
                "at least one of name, serial_number, asset_tag, or external_ref must be non-blank"
                    .into(),
            ));
        }
        let current_type = self
            .index
            .devices_by_id
            .get(&input.id)
            .ok_or_else(|| ApplicationError::NotFound(format!("device id: {}", input.id)))?
            .device_type
            .clone();
        if input.device_type != current_type {
            let is_placed = self
                .index
                .placements_by_device_id
                .get(&input.id)
                .map(|v| !v.is_empty())
                .unwrap_or(false);
            if is_placed {
                return Err(ApplicationError::InvalidInput(
                    "Cannot change device_type because the device is currently placed in a rack."
                        .into(),
                ));
            }
        }
        // Resolve and validate model if provided.
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
        } else {
            None
        };
        // Serial uniqueness: exclude self.
        // Uniqueness checks: trim + case-insensitive, store trimmed original, exclude self.
        let sn_trimmed = input
            .serial_number
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref sn) = sn_trimmed {
            let sn_norm = sn.to_lowercase();
            let conflict = self.data.devices.iter().any(|d| {
                d.id != input.id
                    && opt_normalize_id(&d.serial_number).as_deref() == Some(sn_norm.as_str())
            });
            if conflict {
                return Err(ApplicationError::DuplicateSerialNumber(sn.clone()));
            }
        }
        let at_trimmed = input
            .asset_tag
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref at) = at_trimmed {
            let at_norm = at.to_lowercase();
            let conflict = self.data.devices.iter().any(|d| {
                d.id != input.id
                    && opt_normalize_id(&d.asset_tag).as_deref() == Some(at_norm.as_str())
            });
            if conflict {
                return Err(ApplicationError::DuplicateAssetTag(at.clone()));
            }
        }
        let er_trimmed = input
            .external_ref
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        if let Some(ref er) = er_trimmed {
            let er_norm = er.to_lowercase();
            let conflict = self.data.devices.iter().any(|d| {
                d.id != input.id
                    && opt_normalize_id(&d.external_ref).as_deref() == Some(er_norm.as_str())
            });
            if conflict {
                return Err(ApplicationError::DuplicateExternalRef(er.clone()));
            }
        }
        let device = self
            .data
            .devices
            .iter_mut()
            .find(|d| d.id == input.id)
            .unwrap();
        device.device_type = input.device_type;
        device.name = input.name;
        device.device_model_id = resolved_model_id;
        device.serial_number = sn_trimmed;
        device.asset_tag = at_trimmed;
        device.external_ref = er_trimmed;
        device.status = input.status;
        device.description = input.description;
        device.tags = input.tags;
        self.rebuild_index();
        Ok(())
    }

    pub fn delete_device(&mut self, id: &str) -> Result<(), ApplicationError> {
        if !self.index.devices_by_id.contains_key(id) {
            return Err(ApplicationError::NotFound(format!("device id: {id}")));
        }
        let is_placed = self
            .index
            .placements_by_device_id
            .get(id)
            .map(|v| !v.is_empty())
            .unwrap_or(false);
        if is_placed {
            return Err(ApplicationError::InvalidInput(
                "Cannot delete device because it is placed in a rack.".into(),
            ));
        }
        self.data.devices.retain(|d| d.id != id);
        self.rebuild_index();
        Ok(())
    }

    // ── CSV preview ───────────────────────────────────────────────────────────

    pub fn preview_devices_csv(&self, csv_content: &str) -> CsvDeviceImportPreview {
        let ctx = CsvImportContext::from_index(&self.index);
        preview_csv_import(csv_content, &ctx)
    }

    // ── CSV import/write ──────────────────────────────────────────────────────

    /// Re-validate CSV and write all `Create` rows as new Device records.
    ///
    /// Returns `Err` without mutating the session if any ERROR exists in the preview.
    pub fn import_devices_csv(
        &mut self,
        csv_content: &str,
    ) -> Result<DeviceCsvImportResult, ApplicationError> {
        let preview = self.preview_devices_csv(csv_content);

        let has_file_errors = preview
            .issues
            .iter()
            .any(|i| i.level == ris_core::ValidationLevel::Error);
        let has_row_errors = preview
            .rows
            .iter()
            .any(|r| r.action == CsvRowAction::SkipDueToError);

        if has_file_errors || has_row_errors {
            return Err(ApplicationError::InvalidInput(
                "CSV contains validation errors; import rejected. Fix errors and retry.".into(),
            ));
        }

        let warning_count = preview.summary.warning_count;
        let mut created_count = 0usize;

        for row in &preview.rows {
            if row.action != CsvRowAction::Create {
                continue;
            }
            let device_type: DeviceType = row
                .device_type
                .as_deref()
                .unwrap_or("")
                .parse()
                .map_err(|e: String| ApplicationError::InvalidInput(e))?;
            let status: DeviceStatus = row
                .status
                .as_deref()
                .unwrap_or("")
                .parse()
                .map_err(|e: String| ApplicationError::InvalidInput(e))?;

            self.add_device(AddDeviceInput {
                id: None,
                device_type,
                code: row.code.clone(),
                name: row.name.clone(),
                device_model_id: row.resolved_device_model_id.clone(),
                device_model_code: None,
                serial_number: row.serial_number.clone(),
                asset_tag: row.asset_tag.clone(),
                external_ref: row.external_ref.clone(),
                status,
                description: None,
                tags: row.tags.clone(),
            })?;
            created_count += 1;
        }

        Ok(DeviceCsvImportResult {
            created_count,
            warning_count,
        })
    }

    // ── Placement read helpers ────────────────────────────────────────────────

    pub fn get_rack_side_placements(&self, rack_id: &str, side: &PlacementSide) -> Vec<&Placement> {
        self.index
            .get_placements_for_rack(rack_id)
            .iter()
            .filter(|ip| &ip.side == side)
            .map(|ip| &ip.placement)
            .collect()
    }
}

// ── Placement input types ─────────────────────────────────────────────────────

pub struct PlaceDeviceInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    /// Override placement code for deterministic tests.
    pub code: Option<String>,
    pub rack_id: Option<String>,
    pub rack_code: Option<String>,
    pub side: PlacementSide,
    pub device_id: Option<String>,
    pub device_code: Option<String>,
    pub start_u: u32,
    pub height_u: Option<u32>,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

pub struct PlaceRackObjectInput {
    /// Override UUID for deterministic tests.
    pub id: Option<String>,
    /// Override placement code for deterministic tests.
    pub code: Option<String>,
    pub rack_id: Option<String>,
    pub rack_code: Option<String>,
    pub side: PlacementSide,
    pub device_model_id: Option<String>,
    pub device_model_code: Option<String>,
    pub start_u: u32,
    pub height_u: Option<u32>,
    pub note: Option<String>,
    pub tags: Vec<String>,
}

pub struct MovePlacementInput {
    pub placement_id: Option<String>,
    pub placement_code: Option<String>,
    pub new_start_u: u32,
    pub new_height_u: Option<u32>,
}

pub struct RemovePlacementInput {
    pub placement_id: Option<String>,
    pub placement_code: Option<String>,
}

pub struct MovePlacementToTargetInput {
    pub placement_id: Option<String>,
    pub placement_code: Option<String>,
    /// Destination rack ID. None = keep current rack.
    pub new_rack_id: Option<String>,
    /// Destination side. None = keep current side.
    pub new_side: Option<PlacementSide>,
    pub new_start_u: u32,
    pub new_height_u: Option<u32>,
}

// ── Placement use cases ───────────────────────────────────────────────────────

impl RepositorySession {
    // ── Private helpers ───────────────────────────────────────────────────────

    fn resolve_rack<'a>(
        &'a self,
        rack_id: Option<&str>,
        rack_code: Option<&str>,
    ) -> Result<&'a Rack, ApplicationError> {
        if let Some(id) = rack_id {
            self.index
                .racks_by_id
                .get(id)
                .ok_or_else(|| ApplicationError::NotFound(format!("rack id: {id}")))
        } else if let Some(code) = rack_code {
            self.index
                .racks_by_code
                .get(code)
                .ok_or_else(|| ApplicationError::NotFound(format!("rack code: {code}")))
        } else {
            Err(ApplicationError::InvalidInput(
                "rack_id or rack_code is required".into(),
            ))
        }
    }

    fn resolve_placement<'a>(
        &'a self,
        id: Option<&str>,
        code: Option<&str>,
    ) -> Result<&'a ris_repository::IndexedPlacement, ApplicationError> {
        if let Some(id) = id {
            self.index
                .placements_by_id
                .get(id)
                .ok_or_else(|| ApplicationError::NotFound(format!("placement id: {id}")))
        } else if let Some(code) = code {
            self.index
                .placements_by_code
                .get(code)
                .ok_or_else(|| ApplicationError::NotFound(format!("placement code: {code}")))
        } else {
            Err(ApplicationError::InvalidInput(
                "placement_id or placement_code is required".into(),
            ))
        }
    }

    fn model_for_placement(&self, placement: &Placement) -> Option<&DeviceModel> {
        match placement.target_kind {
            PlacementTargetKind::DeviceModel => {
                self.index.device_models_by_id.get(&placement.target_id)
            }
            PlacementTargetKind::Device => self
                .index
                .devices_by_id
                .get(&placement.target_id)
                .and_then(|d| d.device_model_id.as_deref())
                .and_then(|mid| self.index.device_models_by_id.get(mid)),
        }
    }

    fn check_collision(
        &self,
        rack_id: &str,
        side: &PlacementSide,
        new_range: &PlacementRange,
        exclude_id: Option<&str>,
    ) -> Result<(), ApplicationError> {
        for ip in self.index.get_placements_for_rack(rack_id) {
            if &ip.side != side {
                continue;
            }
            if let Some(exc) = exclude_id {
                if ip.placement.id == exc {
                    continue;
                }
            }
            let model = self.model_for_placement(&ip.placement);
            if let Some(existing_range) = ip.placement.placement_range(model) {
                if new_range.overlaps(&existing_range) {
                    let side_str = match side {
                        PlacementSide::Front => "front",
                        PlacementSide::Rear => "rear",
                    };
                    return Err(ApplicationError::Collision(format!(
                        "U{}-U{} on {side_str} side is already occupied",
                        existing_range.start_u, existing_range.end_u
                    )));
                }
            }
        }
        Ok(())
    }

    fn find_or_create_placement_file_idx(&mut self, rack_id: &str) -> usize {
        if let Some(idx) = self
            .data
            .placement_files
            .iter()
            .position(|pf| pf.rack_id == rack_id)
        {
            idx
        } else {
            self.data.placement_files.push(PlacementFile {
                rack_id: rack_id.to_string(),
                front: vec![],
                rear: vec![],
            });
            self.data.placement_files.len() - 1
        }
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    pub fn place_device(&mut self, input: PlaceDeviceInput) -> Result<String, ApplicationError> {
        let (rack_id, rack_height) = {
            let rack = self.resolve_rack(input.rack_id.as_deref(), input.rack_code.as_deref())?;
            (rack.id.clone(), rack.height_u)
        };

        let (device_id, device_code, model_default_h) = {
            let device = if let Some(ref did) = input.device_id {
                self.index
                    .devices_by_id
                    .get(did.as_str())
                    .ok_or_else(|| ApplicationError::NotFound(format!("device id: {did}")))?
            } else if let Some(ref dcode) = input.device_code {
                self.index
                    .devices_by_code
                    .get(dcode.as_str())
                    .ok_or_else(|| ApplicationError::NotFound(format!("device code: {dcode}")))?
            } else {
                return Err(ApplicationError::InvalidInput(
                    "device_id or device_code is required".into(),
                ));
            };
            let mh = device
                .device_model_id
                .as_deref()
                .and_then(|mid| self.index.device_models_by_id.get(mid))
                .map(|m| m.default_height_u);
            (device.id.clone(), device.code.clone(), mh)
        };

        if self
            .index
            .placements_by_device_id
            .get(&device_id)
            .map(|v| !v.is_empty())
            .unwrap_or(false)
        {
            return Err(ApplicationError::DeviceAlreadyPlaced(device_code));
        }

        let effective_h = input.height_u.or(model_default_h).ok_or_else(|| {
            ApplicationError::EffectiveHeightMissing(format!(
                "device {device_code} has no model and no explicit height_u"
            ))
        })?;

        let range = PlacementRange::try_new(input.start_u, effective_h).ok_or_else(|| {
            ApplicationError::OutOfRackBounds(format!("start_u {} is invalid", input.start_u))
        })?;
        if range.end_u > rack_height {
            return Err(ApplicationError::OutOfRackBounds(format!(
                "placement end_u {} exceeds rack height_u {rack_height}",
                range.end_u
            )));
        }

        self.check_collision(&rack_id, &input.side, &range, None)?;

        let placement_id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        if self.id_exists_globally(&placement_id) {
            return Err(ApplicationError::DuplicateId(placement_id));
        }
        if let Some(ref code) = input.code {
            if is_blank(code) {
                return Err(ApplicationError::InvalidInput(
                    "placement code must not be blank".into(),
                ));
            }
            if self.index.placements_by_code.contains_key(code.as_str()) {
                return Err(ApplicationError::DuplicateCode(code.clone()));
            }
        }
        let placement_code = input.code.unwrap_or_else(|| placement_id.clone());

        let p = Placement {
            id: placement_id.clone(),
            code: placement_code,
            target_kind: PlacementTargetKind::Device,
            target_id: device_id,
            start_u: input.start_u,
            height_u: input.height_u,
            note: input.note,
            tags: input.tags,
        };

        let pf_idx = self.find_or_create_placement_file_idx(&rack_id);
        match input.side {
            PlacementSide::Front => self.data.placement_files[pf_idx].front.push(p),
            PlacementSide::Rear => self.data.placement_files[pf_idx].rear.push(p),
        }

        self.rebuild_index();
        Ok(placement_id)
    }

    pub fn place_rack_object(
        &mut self,
        input: PlaceRackObjectInput,
    ) -> Result<String, ApplicationError> {
        let (rack_id, rack_height) = {
            let rack = self.resolve_rack(input.rack_id.as_deref(), input.rack_code.as_deref())?;
            (rack.id.clone(), rack.height_u)
        };

        let (model_id, model_code, model_default_h) = {
            let model = if let Some(ref mid) = input.device_model_id {
                self.index
                    .device_models_by_id
                    .get(mid.as_str())
                    .ok_or_else(|| ApplicationError::NotFound(format!("device_model id: {mid}")))?
            } else if let Some(ref mcode) = input.device_model_code {
                self.index
                    .device_models_by_code
                    .get(mcode.as_str())
                    .ok_or_else(|| {
                        ApplicationError::NotFound(format!("device_model code: {mcode}"))
                    })?
            } else {
                return Err(ApplicationError::InvalidInput(
                    "device_model_id or device_model_code is required".into(),
                ));
            };
            if model.device_type != DeviceType::RackObject {
                return Err(ApplicationError::InvalidTargetKind(format!(
                    "model {} has device_type {}, expected rack_object",
                    model.code,
                    model.device_type.as_str()
                )));
            }
            (model.id.clone(), model.code.clone(), model.default_height_u)
        };

        let effective_h = input.height_u.unwrap_or(model_default_h);

        let range = PlacementRange::try_new(input.start_u, effective_h).ok_or_else(|| {
            ApplicationError::OutOfRackBounds(format!("start_u {} is invalid", input.start_u))
        })?;
        if range.end_u > rack_height {
            return Err(ApplicationError::OutOfRackBounds(format!(
                "placement end_u {} exceeds rack height_u {rack_height}",
                range.end_u
            )));
        }

        self.check_collision(&rack_id, &input.side, &range, None)?;

        let placement_id = input.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        if self.id_exists_globally(&placement_id) {
            return Err(ApplicationError::DuplicateId(placement_id));
        }
        if let Some(ref code) = input.code {
            if is_blank(code) {
                return Err(ApplicationError::InvalidInput(
                    "placement code must not be blank".into(),
                ));
            }
            if self.index.placements_by_code.contains_key(code.as_str()) {
                return Err(ApplicationError::DuplicateCode(code.clone()));
            }
        }
        let placement_code = input.code.unwrap_or_else(|| placement_id.clone());

        let _ = model_code;
        let p = Placement {
            id: placement_id.clone(),
            code: placement_code,
            target_kind: PlacementTargetKind::DeviceModel,
            target_id: model_id,
            start_u: input.start_u,
            height_u: input.height_u,
            note: input.note,
            tags: input.tags,
        };

        let pf_idx = self.find_or_create_placement_file_idx(&rack_id);
        match input.side {
            PlacementSide::Front => self.data.placement_files[pf_idx].front.push(p),
            PlacementSide::Rear => self.data.placement_files[pf_idx].rear.push(p),
        }

        self.rebuild_index();
        Ok(placement_id)
    }

    pub fn move_placement_within_side(
        &mut self,
        input: MovePlacementInput,
    ) -> Result<(), ApplicationError> {
        let (placement_id, rack_id, side, existing_height_u, target_kind, target_id) = {
            let ip = self.resolve_placement(
                input.placement_id.as_deref(),
                input.placement_code.as_deref(),
            )?;
            (
                ip.placement.id.clone(),
                ip.rack_id.clone(),
                ip.side.clone(),
                ip.placement.height_u,
                ip.placement.target_kind.clone(),
                ip.placement.target_id.clone(),
            )
        };

        let rack_height = {
            let rack = self
                .index
                .racks_by_id
                .get(&rack_id)
                .ok_or_else(|| ApplicationError::NotFound(format!("rack id: {rack_id}")))?;
            rack.height_u
        };

        let new_height = input
            .new_height_u
            .or(existing_height_u)
            .or_else(|| match &target_kind {
                PlacementTargetKind::DeviceModel => self
                    .index
                    .device_models_by_id
                    .get(&target_id)
                    .map(|m| m.default_height_u),
                PlacementTargetKind::Device => self
                    .index
                    .devices_by_id
                    .get(&target_id)
                    .and_then(|d| d.device_model_id.as_deref())
                    .and_then(|mid| self.index.device_models_by_id.get(mid))
                    .map(|m| m.default_height_u),
            })
            .ok_or_else(|| {
                ApplicationError::EffectiveHeightMissing(format!(
                    "placement {placement_id} has no height and no model default"
                ))
            })?;

        let range = PlacementRange::try_new(input.new_start_u, new_height).ok_or_else(|| {
            ApplicationError::OutOfRackBounds(format!(
                "new_start_u {} is invalid",
                input.new_start_u
            ))
        })?;
        if range.end_u > rack_height {
            return Err(ApplicationError::OutOfRackBounds(format!(
                "new position end_u {} exceeds rack height_u {rack_height}",
                range.end_u
            )));
        }

        self.check_collision(&rack_id, &side, &range, Some(&placement_id))?;

        let pf = self
            .data
            .placement_files
            .iter_mut()
            .find(|pf| pf.rack_id == rack_id)
            .ok_or_else(|| {
                ApplicationError::NotFound(format!("placement file for rack {rack_id}"))
            })?;
        let list = match side {
            PlacementSide::Front => &mut pf.front,
            PlacementSide::Rear => &mut pf.rear,
        };
        let p = list
            .iter_mut()
            .find(|p| p.id == placement_id)
            .ok_or_else(|| ApplicationError::NotFound(format!("placement id: {placement_id}")))?;

        p.start_u = input.new_start_u;
        if let Some(new_h) = input.new_height_u {
            p.height_u = Some(new_h);
        }

        self.rebuild_index();
        Ok(())
    }

    pub fn remove_placement(
        &mut self,
        input: RemovePlacementInput,
    ) -> Result<(), ApplicationError> {
        let (placement_id, rack_id, side) = {
            let ip = self.resolve_placement(
                input.placement_id.as_deref(),
                input.placement_code.as_deref(),
            )?;
            (ip.placement.id.clone(), ip.rack_id.clone(), ip.side.clone())
        };

        let pf = self
            .data
            .placement_files
            .iter_mut()
            .find(|pf| pf.rack_id == rack_id)
            .ok_or_else(|| {
                ApplicationError::NotFound(format!("placement file for rack {rack_id}"))
            })?;
        let list = match side {
            PlacementSide::Front => &mut pf.front,
            PlacementSide::Rear => &mut pf.rear,
        };
        let pos = list
            .iter()
            .position(|p| p.id == placement_id)
            .ok_or_else(|| ApplicationError::NotFound(format!("placement id: {placement_id}")))?;
        list.remove(pos);

        self.rebuild_index();
        Ok(())
    }

    /// Move a placement to a new rack, side, and/or start U.
    ///
    /// `new_rack_id` and `new_side` default to the placement's current rack and side when
    /// `None`. This generalises `move_placement_within_side` and is the method exposed through
    /// the Tauri `move_placement` command.
    pub fn move_placement(
        &mut self,
        input: MovePlacementToTargetInput,
    ) -> Result<(), ApplicationError> {
        let (placement_id, src_rack_id, src_side, existing_height_u, target_kind, target_id) = {
            let ip = self.resolve_placement(
                input.placement_id.as_deref(),
                input.placement_code.as_deref(),
            )?;
            (
                ip.placement.id.clone(),
                ip.rack_id.clone(),
                ip.side.clone(),
                ip.placement.height_u,
                ip.placement.target_kind.clone(),
                ip.placement.target_id.clone(),
            )
        };

        let dst_rack_id = input
            .new_rack_id
            .clone()
            .unwrap_or_else(|| src_rack_id.clone());
        let dst_side = input.new_side.clone().unwrap_or_else(|| src_side.clone());

        let dst_rack_height = self
            .index
            .racks_by_id
            .get(&dst_rack_id)
            .ok_or_else(|| ApplicationError::NotFound(format!("rack id: {dst_rack_id}")))?
            .height_u;

        let new_height = input
            .new_height_u
            .or(existing_height_u)
            .or_else(|| match &target_kind {
                PlacementTargetKind::DeviceModel => self
                    .index
                    .device_models_by_id
                    .get(&target_id)
                    .map(|m| m.default_height_u),
                PlacementTargetKind::Device => self
                    .index
                    .devices_by_id
                    .get(&target_id)
                    .and_then(|d| d.device_model_id.as_deref())
                    .and_then(|mid| self.index.device_models_by_id.get(mid))
                    .map(|m| m.default_height_u),
            })
            .ok_or_else(|| {
                ApplicationError::EffectiveHeightMissing(format!(
                    "placement {placement_id} has no height and no model default"
                ))
            })?;

        let range = PlacementRange::try_new(input.new_start_u, new_height).ok_or_else(|| {
            ApplicationError::OutOfRackBounds(format!(
                "new_start_u {} is invalid",
                input.new_start_u
            ))
        })?;
        if range.end_u > dst_rack_height {
            return Err(ApplicationError::OutOfRackBounds(format!(
                "new position end_u {} exceeds rack height_u {dst_rack_height}",
                range.end_u
            )));
        }

        // Self-collision only possible when the placement stays in the same rack+side slot.
        let exclude_id = if dst_rack_id == src_rack_id && dst_side == src_side {
            Some(placement_id.as_str())
        } else {
            None
        };
        self.check_collision(&dst_rack_id, &dst_side, &range, exclude_id)?;

        // Extract placement from source list (releases borrow on placement_files).
        let mut placement = {
            let src_pf = self
                .data
                .placement_files
                .iter_mut()
                .find(|pf| pf.rack_id == src_rack_id)
                .ok_or_else(|| {
                    ApplicationError::NotFound(format!("placement file for rack {src_rack_id}"))
                })?;
            let src_list = match src_side {
                PlacementSide::Front => &mut src_pf.front,
                PlacementSide::Rear => &mut src_pf.rear,
            };
            let pos = src_list
                .iter()
                .position(|p| p.id == placement_id)
                .ok_or_else(|| {
                    ApplicationError::NotFound(format!("placement id: {placement_id}"))
                })?;
            src_list.remove(pos)
        };

        placement.start_u = input.new_start_u;
        if let Some(new_h) = input.new_height_u {
            placement.height_u = Some(new_h);
        }

        // Insert into destination (find_or_create_placement_file_idx may push a new entry).
        let dst_pf_idx = self.find_or_create_placement_file_idx(&dst_rack_id);
        match dst_side {
            PlacementSide::Front => self.data.placement_files[dst_pf_idx].front.push(placement),
            PlacementSide::Rear => self.data.placement_files[dst_pf_idx].rear.push(placement),
        }

        self.rebuild_index();
        Ok(())
    }
}
