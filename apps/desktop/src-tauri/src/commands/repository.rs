use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use ris_application::{
    open_repository, AddDeviceModelInput, AddLocationInput, AddRackInput,
    MovePlacementToTargetInput, PlaceDeviceInput, PlaceRackObjectInput, RemovePlacementInput,
    RepositorySession,
};
use ris_core::{DeviceType, PlacementSide, PlacementTargetKind, ValidationLevel};
use tauri::State;

use crate::dto::{
    AddDeviceModelInputDto, AddLocationInputDto, AddRackInputDto, DeviceDto, DeviceModelDto,
    LocationDto, MovePlacementInputDto, OpenRepositoryResultDto, PlaceDeviceInputDto,
    PlaceRackObjectInputDto, PlacementDto, RackDetailDto, RackSummaryDto, RemovePlacementInputDto,
    RepositorySummaryDto, SaveSummaryDto, ValidationIssueDto, ValidationSummaryDto,
};

pub struct AppState {
    pub session: Mutex<Option<RepositorySession>>,
}

fn lock_session<'a>(
    state: &'a State<'a, AppState>,
) -> Result<MutexGuard<'a, Option<RepositorySession>>, String> {
    state
        .session
        .lock()
        .map_err(|_| "Internal error: session lock is poisoned".to_string())
}

fn no_session() -> String {
    "No repository is currently open".to_string()
}

fn build_summary(session: &RepositorySession) -> RepositorySummaryDto {
    let data = &session.data;
    let unplaced = session.get_unplaced_devices().len();
    let placements_count: usize = data
        .placement_files
        .iter()
        .map(|pf| pf.front.len() + pf.rear.len())
        .sum();
    RepositorySummaryDto {
        repo_path: session.repo_path.display().to_string(),
        repository_code: data.metadata.code.clone(),
        repository_name: data.metadata.name.clone(),
        locations_count: data.locations.len(),
        racks_count: data.racks.len(),
        device_models_count: data.device_models.len(),
        devices_count: data.devices.len(),
        placement_files_count: data.placement_files.len(),
        placements_count,
        unplaced_devices_count: unplaced,
    }
}

fn build_validation_summary(issues: &[ris_core::ValidationIssue]) -> ValidationSummaryDto {
    let errors = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .count();
    let warnings = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Warning)
        .count();
    let infos = issues
        .iter()
        .filter(|i| i.level == ValidationLevel::Info)
        .count();
    ValidationSummaryDto {
        errors,
        warnings,
        infos,
        total: issues.len(),
    }
}

fn issue_to_dto(issue: &ris_core::ValidationIssue) -> ValidationIssueDto {
    ValidationIssueDto {
        code: issue.code.clone(),
        level: match issue.level {
            ValidationLevel::Error => "error".to_string(),
            ValidationLevel::Warning => "warning".to_string(),
            ValidationLevel::Info => "info".to_string(),
        },
        message: issue.message.clone(),
        object_type: issue.object_type.clone(),
        object_id: issue.object_id.clone(),
        object_code: issue.object_code.clone(),
        file_path: issue.file_path.clone(),
    }
}

#[tauri::command]
pub fn open_repository_cmd(
    path: String,
    state: State<AppState>,
) -> Result<OpenRepositoryResultDto, String> {
    let session =
        open_repository(Path::new(&path)).map_err(|e| format!("Failed to open repository: {e}"))?;

    let issues = session.validate();
    let summary = build_summary(&session);
    let validation_summary = build_validation_summary(&issues);

    let mut guard = lock_session(&state)?;
    *guard = Some(session);

    Ok(OpenRepositoryResultDto {
        summary,
        validation_summary,
    })
}

#[tauri::command]
pub fn get_repository_summary(state: State<AppState>) -> Result<RepositorySummaryDto, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    Ok(build_summary(session))
}

#[tauri::command]
pub fn validate_current_repository(
    state: State<AppState>,
) -> Result<Vec<ValidationIssueDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let issues = session.validate();
    Ok(issues.iter().map(issue_to_dto).collect())
}

#[tauri::command]
pub fn save_current_repository(state: State<AppState>) -> Result<SaveSummaryDto, String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    let report = session
        .save()
        .map_err(|e| format!("Failed to save repository: {e}"))?;
    Ok(SaveSummaryDto {
        created: report.created.len(),
        updated: report.updated.len(),
        unchanged: report.unchanged.len(),
        total: report.total(),
    })
}

#[tauri::command]
pub fn close_repository(state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn list_locations(state: State<AppState>) -> Result<Vec<LocationDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let result = session
        .data
        .locations
        .iter()
        .map(|loc| {
            let rack_count = session
                .data
                .racks
                .iter()
                .filter(|r| r.location_id == loc.id)
                .count();
            LocationDto {
                id: loc.id.clone(),
                code: loc.code.clone(),
                name: loc.name.clone(),
                description: loc.description.clone(),
                address: loc.address.clone(),
                tags: loc.tags.clone(),
                rack_count,
            }
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub fn list_racks(state: State<AppState>) -> Result<Vec<RackSummaryDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let result = session
        .data
        .racks
        .iter()
        .map(|rack| {
            let location_code = session
                .index
                .locations_by_id
                .get(&rack.location_id)
                .map(|l| l.code.clone())
                .unwrap_or_default();
            let (front_placement_count, rear_placement_count) = session
                .data
                .placement_files
                .iter()
                .find(|pf| pf.rack_id == rack.id)
                .map(|pf| (pf.front.len(), pf.rear.len()))
                .unwrap_or((0, 0));
            let placement_count = front_placement_count + rear_placement_count;
            RackSummaryDto {
                id: rack.id.clone(),
                code: rack.code.clone(),
                name: rack.name.clone(),
                location_id: rack.location_id.clone(),
                location_code,
                height_u: rack.height_u,
                row: rack.row.clone(),
                front_placement_count,
                rear_placement_count,
                placement_count,
            }
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub fn list_devices(state: State<AppState>) -> Result<Vec<DeviceDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let result = session
        .data
        .devices
        .iter()
        .map(|dev| {
            let device_model_code = dev
                .device_model_id
                .as_deref()
                .and_then(|mid| session.index.device_models_by_id.get(mid))
                .map(|m| m.code.clone());
            let is_placed = session
                .index
                .placements_by_device_id
                .get(&dev.id)
                .map(|v| !v.is_empty())
                .unwrap_or(false);
            DeviceDto {
                id: dev.id.clone(),
                code: dev.code.clone(),
                device_type: dev.device_type.as_str().to_string(),
                name: dev.name.clone(),
                serial_number: dev.serial_number.clone(),
                asset_tag: dev.asset_tag.clone(),
                status: dev.status.as_str().to_string(),
                device_model_code,
                is_placed,
            }
        })
        .collect();
    Ok(result)
}

#[tauri::command]
pub fn list_device_models(state: State<AppState>) -> Result<Vec<DeviceModelDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let result = session
        .data
        .device_models
        .iter()
        .map(|m| DeviceModelDto {
            id: m.id.clone(),
            code: m.code.clone(),
            device_type: m.device_type.as_str().to_string(),
            name: m.name.clone(),
            vendor: m.vendor.clone(),
            model_number: m.model.clone(),
            default_height_u: m.default_height_u,
        })
        .collect();
    Ok(result)
}

fn placement_to_dto(placement: &ris_core::Placement, session: &RepositorySession) -> PlacementDto {
    let (target_code, target_name, device_type) = match placement.target_kind {
        PlacementTargetKind::Device => {
            let dev = session.index.devices_by_id.get(&placement.target_id);
            (
                dev.map(|d| d.code.clone()),
                dev.and_then(|d| d.name.clone()),
                dev.map(|d| d.device_type.as_str().to_string()),
            )
        }
        PlacementTargetKind::DeviceModel => {
            let dm = session.index.device_models_by_id.get(&placement.target_id);
            (
                dm.map(|m| m.code.clone()),
                dm.map(|m| m.name.clone()),
                dm.map(|m| m.device_type.as_str().to_string()),
            )
        }
    };

    let model = match placement.target_kind {
        PlacementTargetKind::Device => session
            .index
            .devices_by_id
            .get(&placement.target_id)
            .and_then(|d| d.device_model_id.as_deref())
            .and_then(|mid| session.index.device_models_by_id.get(mid)),
        PlacementTargetKind::DeviceModel => {
            session.index.device_models_by_id.get(&placement.target_id)
        }
    };

    let effective_height_u = placement.effective_height_u(model);
    let end_u = effective_height_u
        .filter(|&h| h > 0)
        .and_then(|h| placement.start_u.checked_add(h - 1));

    PlacementDto {
        id: placement.id.clone(),
        code: placement.code.clone(),
        target_kind: match placement.target_kind {
            PlacementTargetKind::Device => "device".to_string(),
            PlacementTargetKind::DeviceModel => "device_model".to_string(),
        },
        target_id: placement.target_id.clone(),
        target_code,
        target_name,
        device_type,
        start_u: placement.start_u,
        height_u: placement.height_u,
        effective_height_u,
        end_u,
        note: placement.note.clone(),
        tags: placement.tags.clone(),
    }
}

#[tauri::command]
pub fn get_rack_detail(rack_id: String, state: State<AppState>) -> Result<RackDetailDto, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;

    let rack = session
        .index
        .racks_by_id
        .get(&rack_id)
        .ok_or_else(|| format!("Rack not found: {rack_id}"))?;

    let location_code = session
        .index
        .locations_by_id
        .get(&rack.location_id)
        .map(|l| l.code.clone())
        .unwrap_or_default();

    let (mut front, mut rear): (Vec<PlacementDto>, Vec<PlacementDto>) = match session
        .data
        .placement_files
        .iter()
        .find(|pf| pf.rack_id == rack_id)
    {
        Some(pf) => (
            pf.front
                .iter()
                .map(|p| placement_to_dto(p, session))
                .collect(),
            pf.rear
                .iter()
                .map(|p| placement_to_dto(p, session))
                .collect(),
        ),
        None => (vec![], vec![]),
    };

    front.sort_by_key(|p| p.start_u);
    rear.sort_by_key(|p| p.start_u);

    Ok(RackDetailDto {
        id: rack.id.clone(),
        code: rack.code.clone(),
        name: rack.name.clone(),
        location_id: rack.location_id.clone(),
        location_code,
        height_u: rack.height_u,
        row: rack.row.clone(),
        front,
        rear,
    })
}

fn parse_side(side: &str) -> Result<PlacementSide, String> {
    match side {
        "front" => Ok(PlacementSide::Front),
        "rear" => Ok(PlacementSide::Rear),
        _ => Err(format!("invalid side '{side}': expected 'front' or 'rear'")),
    }
}

#[tauri::command]
pub fn place_device(input: PlaceDeviceInputDto, state: State<AppState>) -> Result<String, String> {
    let side = parse_side(&input.side)?;
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .place_device(PlaceDeviceInput {
            id: None,
            code: None,
            rack_id: Some(input.rack_id),
            rack_code: None,
            side,
            device_id: Some(input.device_id),
            device_code: None,
            start_u: input.start_u,
            height_u: input.height_u,
            note: None,
            tags: vec![],
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn place_rack_object(
    input: PlaceRackObjectInputDto,
    state: State<AppState>,
) -> Result<String, String> {
    let side = parse_side(&input.side)?;
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .place_rack_object(PlaceRackObjectInput {
            id: None,
            code: None,
            rack_id: Some(input.rack_id),
            rack_code: None,
            side,
            device_model_id: Some(input.device_model_id),
            device_model_code: None,
            start_u: input.start_u,
            height_u: input.height_u,
            note: None,
            tags: vec![],
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_placement(input: MovePlacementInputDto, state: State<AppState>) -> Result<(), String> {
    let new_side = match input.new_side.as_deref() {
        Some(s) => Some(parse_side(s)?),
        None => None,
    };
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .move_placement(MovePlacementToTargetInput {
            placement_id: Some(input.placement_id),
            placement_code: None,
            new_rack_id: input.new_rack_id,
            new_side,
            new_start_u: input.new_start_u,
            new_height_u: input.new_height_u,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_placement(
    input: RemovePlacementInputDto,
    state: State<AppState>,
) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .remove_placement(RemovePlacementInput {
            placement_id: Some(input.placement_id),
            placement_code: None,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_location_cmd(
    input: AddLocationInputDto,
    state: State<AppState>,
) -> Result<String, String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .add_location(AddLocationInput {
            id: None,
            code: input.code,
            name: input.name,
            description: input.description,
            address: input.address,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_rack_cmd(input: AddRackInputDto, state: State<AppState>) -> Result<String, String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .add_rack(AddRackInput {
            id: None,
            location_id: input.location_id,
            location_code: input.location_code,
            code: input.code,
            name: input.name,
            height_u: input.height_u,
            row: input.row,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_device_model_cmd(
    input: AddDeviceModelInputDto,
    state: State<AppState>,
) -> Result<String, String> {
    let device_type: DeviceType = input.device_type.parse().map_err(|e: String| e)?;
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .add_device_model(AddDeviceModelInput {
            id: None,
            device_type,
            code: input.code,
            name: input.name,
            vendor: input.vendor,
            model: input.model,
            default_height_u: input.default_height_u,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}
