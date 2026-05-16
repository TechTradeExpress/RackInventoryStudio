use std::path::{Path, PathBuf};

use ris_core::{
    Device, DeviceModel, DeviceStatus, DeviceType, Location, Placement, PlacementFile,
    PlacementRange, PlacementSide, PlacementTargetKind, Rack, ValidationIssue,
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
}
