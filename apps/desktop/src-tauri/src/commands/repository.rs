use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use crate::diagnostics::{basename, redact_git_url, sanitize_error};

use ris_application::{
    create_repository, open_repository, AddDeviceInput, AddDeviceModelInput, AddLocationInput,
    AddRackInput, CreateRepositoryInput, MovePlacementToTargetInput, PlaceDeviceInput,
    PlaceRackObjectInput, RemovePlacementInput, RepositorySession, SearchResultKind,
    UpdateDeviceInput, UpdateDeviceModelInput, UpdateLocationInput, UpdateRackInput,
};
use ris_core::{DeviceStatus, DeviceType, PlacementSide, PlacementTargetKind, ValidationLevel};
use ris_import::CsvRowAction;
use tauri::State;

use crate::dto::{
    AddDeviceInputDto, AddDeviceModelInputDto, AddLocationInputDto, AddRackInputDto,
    CreateRepositoryInputDto, CsvDeviceModelImportPreviewDto, CsvDeviceModelImportPreviewRowDto,
    CsvImportIssueDto, CsvImportPreviewDto, CsvImportPreviewRowDto, CsvImportResultDto,
    CsvImportSummaryDto, DeviceDto, DeviceModelDto, LocationDto, MovePlacementInputDto,
    OpenRepositoryResultDto, PlaceDeviceInputDto, PlaceRackObjectInputDto, PlacementDto,
    RackDetailDto, RackSummaryDto, RemovePlacementInputDto, RepositorySummaryDto, SaveSummaryDto,
    SearchNavigationDto, SearchResultDto, UpdateDeviceInputDto, UpdateDeviceModelInputDto,
    UpdateLocationInputDto, UpdateRackInputDto, ValidationIssueDto, ValidationSummaryDto,
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

pub(crate) fn build_summary(session: &RepositorySession) -> RepositorySummaryDto {
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
        rack_id: issue.rack_id.clone(),
    }
}

#[tauri::command]
pub fn open_repository_cmd(
    path: String,
    state: State<AppState>,
) -> Result<OpenRepositoryResultDto, String> {
    log::info!("open_repository: {}", basename(Path::new(&path)));
    let session = open_repository(Path::new(&path)).map_err(|e| {
        let msg = format!("Failed to open repository: {e}");
        log::error!("open_repository failed: {}", sanitize_error(&msg));
        msg
    })?;

    let issues = session.validate();
    let summary = build_summary(&session);
    let validation_summary = build_validation_summary(&issues);
    log::info!(
        "open_repository ok: code={} locations={} racks={} devices={} validation_issues={}",
        summary.repository_code,
        summary.locations_count,
        summary.racks_count,
        summary.devices_count,
        validation_summary.total,
    );

    let mut guard = lock_session(&state)?;
    *guard = Some(session);

    Ok(OpenRepositoryResultDto {
        summary,
        validation_summary,
    })
}

fn validate_repo_code(code: &str) -> Result<(), String> {
    if code.is_empty() {
        return Err("Repository code cannot be blank".to_string());
    }
    // Reject path separators first — catches "../repo", "a/b", "a\b", "repo/" etc.
    if code.contains('/') || code.contains('\\') {
        return Err("Repository code must not contain path separators ('/' or '\\')".to_string());
    }
    // Reject ".." as a standalone component (directory traversal after join).
    if code == ".." {
        return Err("Repository code must not be '..'".to_string());
    }
    // Reject Windows-forbidden filename characters.
    const FORBIDDEN: &[char] = &['<', '>', ':', '"', '|', '?', '*'];
    if let Some(c) = code.chars().find(|ch| FORBIDDEN.contains(ch)) {
        return Err(format!(
            "Repository code contains forbidden character '{c}'"
        ));
    }
    // Reject trailing dot or space (Windows silently strips them, causing confusion).
    if code.ends_with('.') {
        return Err("Repository code must not end with a dot".to_string());
    }
    if code.ends_with(' ') {
        return Err("Repository code must not end with a space".to_string());
    }
    // Reject Windows reserved device names (case-insensitive).
    // Windows treats "NAME.ext" identically to "NAME", so we check the stem
    // (everything before the first dot). This catches con.txt, nul.repo, etc.
    let stem = code.split('.').next().unwrap_or(code);
    let upper_stem = stem.to_ascii_uppercase();
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED.contains(&upper_stem.as_str()) {
        return Err(format!("'{code}' is a reserved name on Windows"));
    }
    Ok(())
}

#[tauri::command]
pub fn create_repository_cmd(
    input: CreateRepositoryInputDto,
    state: State<AppState>,
) -> Result<OpenRepositoryResultDto, String> {
    let parent_path = input.parent_path.trim().to_string();
    if parent_path.is_empty() {
        return Err("Parent path cannot be blank".to_string());
    }
    let code = input.code.trim().to_string();
    validate_repo_code(&code)?;
    let name = input.name.trim().to_string();
    let final_path = std::path::PathBuf::from(&parent_path).join(&code);
    if final_path.exists() {
        return Err(format!(
            "Target directory already exists: {}",
            final_path.display()
        ));
    }
    log::info!(
        "create_repository: {}",
        basename(std::path::Path::new(&final_path)),
    );

    let session = create_repository(CreateRepositoryInput {
        path: final_path,
        code: code.clone(),
        name,
        id: None,
    })
    .map_err(|e| {
        let msg = e.to_string();
        log::error!("create_repository failed: {}", sanitize_error(&msg));
        msg
    })?;

    ris_git::init_repository(&session.repo_path).map_err(|e| {
        let msg = e.to_string();
        log::error!(
            "create_repository: git init failed: {}",
            sanitize_error(&msg)
        );
        format!(
            "Failed to initialize Git repository: {}",
            sanitize_error(&msg)
        )
    })?;

    let issues = session.validate();
    let summary = build_summary(&session);
    let validation_summary = build_validation_summary(&issues);
    log::info!("create_repository ok: code={}", summary.repository_code);

    let mut guard = lock_session(&state)?;
    *guard = Some(session);

    Ok(OpenRepositoryResultDto {
        summary,
        validation_summary,
    })
}

#[tauri::command]
pub fn clone_repository_cmd(
    url: String,
    destination: String,
    state: State<AppState>,
) -> Result<OpenRepositoryResultDto, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("Git URL cannot be blank".to_string());
    }
    let destination = destination.trim().to_string();
    if destination.is_empty() {
        return Err("Destination path cannot be blank".to_string());
    }

    let dest_path = Path::new(&destination);

    // Reject non-empty destination to avoid clobbering existing data.
    if dest_path.exists() {
        let is_empty = std::fs::read_dir(dest_path)
            .map(|mut d| d.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            return Err(format!(
                "Destination directory already exists and is not empty: {}",
                basename(dest_path),
            ));
        }
    }

    log::info!(
        "clone_repository: url={} dest={}",
        redact_git_url(&url),
        basename(dest_path),
    );

    ris_git::clone(&url, &destination).map_err(|e| {
        let msg = e.to_string();
        log::error!("clone_repository failed: {}", sanitize_error(&msg));
        msg
    })?;

    log::info!(
        "clone_repository: git clone ok, opening {}",
        basename(dest_path),
    );

    // Open the cloned directory through the same path as open_repository_cmd.
    // If the clone is not a valid RIS repo this returns an error; the cloned
    // directory is intentionally NOT deleted so the user can inspect it.
    let session = open_repository(dest_path).map_err(|e| {
        let msg = format!("Repository cloned but is not a valid RIS repository: {e}");
        log::error!("clone_repository: open failed: {}", sanitize_error(&msg));
        msg
    })?;

    let issues = session.validate();
    let summary = build_summary(&session);
    let validation_summary = build_validation_summary(&issues);
    log::info!(
        "clone_repository ok: code={} validation_issues={}",
        summary.repository_code,
        validation_summary.total,
    );

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
    let summary = build_validation_summary(&issues);
    log::info!(
        "validate_current_repository: errors={} warnings={} infos={}",
        summary.errors,
        summary.warnings,
        summary.infos,
    );
    Ok(issues.iter().map(issue_to_dto).collect())
}

#[tauri::command]
pub fn save_current_repository(state: State<AppState>) -> Result<SaveSummaryDto, String> {
    log::info!("save_current_repository: start");
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    let report = session.save().map_err(|e| {
        let msg = format!("Failed to save repository: {e}");
        log::error!("save_current_repository failed: {}", sanitize_error(&msg));
        msg
    })?;
    let dto = SaveSummaryDto {
        created: report.created.len(),
        updated: report.updated.len(),
        unchanged: report.unchanged.len(),
        total: report.total(),
    };
    log::info!(
        "save_current_repository ok: created={} updated={} unchanged={}",
        dto.created,
        dto.updated,
        dto.unchanged,
    );
    Ok(dto)
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
            let pf_opt = session
                .data
                .placement_files
                .iter()
                .find(|pf| pf.rack_id == rack.id);
            let (front_placement_count, rear_placement_count) = pf_opt
                .map(|pf| (pf.front.len(), pf.rear.len()))
                .unwrap_or((0, 0));
            let placement_count = front_placement_count + rear_placement_count;

            // Compute U slots occupied per side using effective_height_u.
            // Utilization rule: max(front_used_u, rear_used_u) / height_u, since
            // front and rear share the same physical U space in the cabinet.
            let used_u = |placements: &[ris_core::Placement]| -> u32 {
                placements
                    .iter()
                    .map(|p| {
                        let model = match p.target_kind {
                            PlacementTargetKind::Device => session
                                .index
                                .devices_by_id
                                .get(&p.target_id)
                                .and_then(|d| d.device_model_id.as_deref())
                                .and_then(|mid| session.index.device_models_by_id.get(mid)),
                            PlacementTargetKind::DeviceModel => {
                                session.index.device_models_by_id.get(&p.target_id)
                            }
                        };
                        p.effective_height_u(model).unwrap_or(1)
                    })
                    .sum()
            };
            let (front_used_u, rear_used_u) = pf_opt
                .map(|pf| (used_u(&pf.front), used_u(&pf.rear)))
                .unwrap_or((0, 0));

            RackSummaryDto {
                id: rack.id.clone(),
                code: rack.code.clone(),
                name: rack.name.clone(),
                location_id: rack.location_id.clone(),
                location_code,
                height_u: rack.height_u,
                row: rack.row.clone(),
                description: rack.description.clone(),
                tags: rack.tags.clone(),
                front_placement_count,
                rear_placement_count,
                placement_count,
                front_used_u,
                rear_used_u,
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
                external_ref: dev.external_ref.clone(),
                status: dev.status.as_str().to_string(),
                device_model_code,
                device_model_id: dev.device_model_id.clone(),
                is_placed,
                description: dev.description.clone(),
                tags: dev.tags.clone(),
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
            description: m.description.clone(),
            tags: m.tags.clone(),
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

    // model_name / model_code only for device placements; rack-object placements
    // already carry the model name in target_name, so we omit to avoid duplication.
    let (model_name, model_code) = match placement.target_kind {
        PlacementTargetKind::Device => {
            (model.map(|m| m.name.clone()), model.map(|m| m.code.clone()))
        }
        PlacementTargetKind::DeviceModel => (None, None),
    };

    let (target_serial, target_asset_tag) = match placement.target_kind {
        PlacementTargetKind::Device => {
            let dev = session.index.devices_by_id.get(&placement.target_id);
            (
                dev.and_then(|d| d.serial_number.clone()),
                dev.and_then(|d| d.asset_tag.clone()),
            )
        }
        PlacementTargetKind::DeviceModel => (None, None),
    };

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
        model_name,
        model_code,
        target_serial,
        target_asset_tag,
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

#[tauri::command]
pub fn add_device_cmd(input: AddDeviceInputDto, state: State<AppState>) -> Result<String, String> {
    let device_type: DeviceType = input.device_type.parse().map_err(|e: String| e)?;
    let status: DeviceStatus = input.status.parse().map_err(|e: String| e)?;
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .add_device(AddDeviceInput {
            id: None,
            device_type,
            code: input.code,
            name: input.name,
            device_model_id: input.device_model_id,
            device_model_code: None,
            serial_number: input.serial_number,
            asset_tag: input.asset_tag,
            external_ref: input.external_ref,
            status,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

fn issue_to_csv_dto(issue: &ris_core::ValidationIssue) -> CsvImportIssueDto {
    CsvImportIssueDto {
        code: issue.code.clone(),
        level: match issue.level {
            ValidationLevel::Error => "error".to_string(),
            ValidationLevel::Warning => "warning".to_string(),
            ValidationLevel::Info => "info".to_string(),
        },
        message: issue.message.clone(),
        details: issue.details.clone(),
    }
}

#[tauri::command]
pub fn preview_device_csv_import_cmd(
    csv_content: String,
    state: State<AppState>,
) -> Result<CsvImportPreviewDto, String> {
    log::info!("preview_device_csv_import: bytes={}", csv_content.len());
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let preview = session.preview_devices_csv(&csv_content);
    let rows = preview
        .rows
        .iter()
        .map(|r| CsvImportPreviewRowDto {
            row_number: r.row_number,
            device_type: r.device_type.clone(),
            name: r.name.clone(),
            device_model_code: r.device_model_code.clone(),
            serial_number: r.serial_number.clone(),
            asset_tag: r.asset_tag.clone(),
            status: r.status.clone(),
            action: match r.action {
                CsvRowAction::Create => "create".to_string(),
                CsvRowAction::SkipDueToError => "skip_due_to_error".to_string(),
            },
            issues: r.issues.iter().map(issue_to_csv_dto).collect(),
        })
        .collect();
    let dto = CsvImportPreviewDto {
        summary: CsvImportSummaryDto {
            total_rows: preview.summary.total_rows,
            valid_rows: preview.summary.valid_rows,
            error_rows: preview.summary.error_rows,
            warning_rows: preview.summary.warning_rows,
        },
        file_issues: preview.issues.iter().map(issue_to_csv_dto).collect(),
        rows,
    };
    log::info!(
        "preview_device_csv_import ok: total_rows={} valid={} errors={}",
        dto.summary.total_rows,
        dto.summary.valid_rows,
        dto.summary.error_rows,
    );
    Ok(dto)
}

#[tauri::command]
pub fn import_device_csv_cmd(
    csv_content: String,
    state: State<AppState>,
) -> Result<CsvImportResultDto, String> {
    log::info!("import_device_csv: bytes={}", csv_content.len());
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .import_devices_csv(&csv_content)
        .map(|r| {
            log::info!(
                "import_device_csv ok: created={} warnings={}",
                r.created_count,
                r.warning_count,
            );
            CsvImportResultDto {
                created_count: r.created_count,
                warning_count: r.warning_count,
            }
        })
        .map_err(|e| {
            let msg = e.to_string();
            log::error!("import_device_csv failed: {}", sanitize_error(&msg));
            msg
        })
}

#[tauri::command]
pub fn update_location_cmd(
    input: UpdateLocationInputDto,
    state: State<AppState>,
) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .update_location(UpdateLocationInput {
            id: input.id,
            name: input.name,
            description: input.description,
            address: input.address,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_location_cmd(id: String, state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session.delete_location(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_rack_cmd(input: UpdateRackInputDto, state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .update_rack(UpdateRackInput {
            id: input.id,
            location_id: input.location_id,
            name: input.name,
            height_u: input.height_u,
            row: input.row,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_rack_cmd(id: String, state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session.delete_rack(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_device_model_cmd(
    input: UpdateDeviceModelInputDto,
    state: State<AppState>,
) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    let device_type: DeviceType = input.device_type.parse().map_err(|e: String| e)?;
    session
        .update_device_model(UpdateDeviceModelInput {
            id: input.id,
            device_type,
            name: input.name,
            vendor: input.vendor,
            model: input.model,
            default_height_u: input.default_height_u,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_device_model_cmd(id: String, state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session.delete_device_model(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_device_cmd(
    input: UpdateDeviceInputDto,
    state: State<AppState>,
) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    let device_type: DeviceType = input.device_type.parse().map_err(|e: String| e)?;
    let status: DeviceStatus = input.status.parse().map_err(|e: String| e)?;
    session
        .update_device(UpdateDeviceInput {
            id: input.id,
            device_type,
            name: input.name,
            device_model_id: input.device_model_id,
            serial_number: input.serial_number,
            asset_tag: input.asset_tag,
            external_ref: input.external_ref,
            status,
            description: input.description,
            tags: input.tags,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_device_cmd(id: String, state: State<AppState>) -> Result<(), String> {
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session.delete_device(&id).map_err(|e| e.to_string())
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

pub const MAX_CSV_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

/// Fixed sample CSV for the "Download sample CSV" feature (Device import).
/// Columns mirror KNOWN_COLUMNS / REQUIRED_COLUMNS in crates/ris-import/src/csv_reader.rs.
/// Device codes are auto-generated; rack_object is not a valid device_type for CSV import.
pub const DEVICE_IMPORT_SAMPLE_CSV: &str = "\
device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags\n\
server,Demo Server 1,,SN-DEMO-001,ASSET-DEMO-001,REF-DEMO-001,in_stock,production\n\
server,Demo Server 2,,,,,planned,staging\n\
network,Demo Switch 1,,,,,in_stock,access;switch\n\
other,Demo Other Device,,,,,unknown,\n\
";

/// Fixed sample CSV for the "Download sample CSV" feature (Device Model import).
/// Columns mirror DEVICE_MODEL_KNOWN_COLUMNS / DEVICE_MODEL_REQUIRED_COLUMNS.
/// code is optional; height_u defaults to 1 when omitted. rack_object is allowed.
pub const DEVICE_MODEL_IMPORT_SAMPLE_CSV: &str = "\
device_type,name,code,vendor,model_number,height_u,description,tags\n\
server,Demo 1U Server,,Acme,ACM-SRV-1,1,A one-unit server,demo\n\
network,Demo 24-port Switch,,Acme,ACM-SW-24,1,,access;switch\n\
storage,Demo Storage Array,,Acme,ACM-STR-4,4,,\n\
rack_object,Demo 1U Blank Panel,,Acme,ACM-BLANK-1,1,,\n\
";

/// Reads a file as UTF-8 text, enforcing a size limit.
/// Extracted as a pure function so it can be unit-tested without Tauri state.
pub fn read_csv_content(path: &Path, max_bytes: u64) -> Result<String, String> {
    let meta =
        std::fs::metadata(path).map_err(|e| format!("Cannot access '{}': {e}", path.display()))?;
    if !meta.is_file() {
        return Err(format!("'{}' is not a file", path.display()));
    }
    if meta.len() > max_bytes {
        return Err(format!(
            "File is too large ({:.1} MB). Maximum allowed size is {} MB.",
            meta.len() as f64 / (1024.0 * 1024.0),
            max_bytes / (1024 * 1024)
        ));
    }
    let bytes =
        std::fs::read(path).map_err(|e| format!("Cannot read '{}': {e}", path.display()))?;
    String::from_utf8(bytes).map_err(|_| format!("'{}' is not valid UTF-8 text", path.display()))
}

#[tauri::command]
pub fn read_csv_file(path: String) -> Result<String, String> {
    read_csv_content(Path::new(&path), MAX_CSV_BYTES)
}

/// Write the built-in device import sample CSV to the given path.
/// The path is supplied by the frontend after the user selects it via the native save dialog.
/// Content is fixed server-side; the frontend cannot supply arbitrary content.
#[tauri::command]
pub fn write_device_import_sample_csv(path: String) -> Result<(), String> {
    let path_ref = std::path::Path::new(&path);
    if path_ref.is_dir() {
        return Err(format!("'{}' is a directory, not a file", path));
    }
    std::fs::write(path_ref, DEVICE_IMPORT_SAMPLE_CSV.as_bytes())
        .map_err(|e| format!("Failed to write sample CSV: {e}"))
}

#[tauri::command]
pub fn preview_device_model_csv_import_cmd(
    csv_content: String,
    state: State<AppState>,
) -> Result<CsvDeviceModelImportPreviewDto, String> {
    log::info!(
        "preview_device_model_csv_import: bytes={}",
        csv_content.len()
    );
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let preview = session.preview_device_models_csv(&csv_content);
    let rows = preview
        .rows
        .iter()
        .map(|r| CsvDeviceModelImportPreviewRowDto {
            row_number: r.row_number,
            device_type: r.device_type.clone(),
            name: r.name.clone(),
            code: r.code.clone(),
            vendor: r.vendor.clone(),
            model_number: r.model_number.clone(),
            height_u: r.height_u,
            action: match r.action {
                CsvRowAction::Create => "create".to_string(),
                CsvRowAction::SkipDueToError => "skip_due_to_error".to_string(),
            },
            issues: r.issues.iter().map(issue_to_csv_dto).collect(),
        })
        .collect();
    let dto = CsvDeviceModelImportPreviewDto {
        summary: CsvImportSummaryDto {
            total_rows: preview.summary.total_rows,
            valid_rows: preview.summary.valid_rows,
            error_rows: preview.summary.error_rows,
            warning_rows: preview.summary.warning_rows,
        },
        file_issues: preview.issues.iter().map(issue_to_csv_dto).collect(),
        rows,
    };
    log::info!(
        "preview_device_model_csv_import ok: total_rows={} valid={} errors={}",
        dto.summary.total_rows,
        dto.summary.valid_rows,
        dto.summary.error_rows,
    );
    Ok(dto)
}

#[tauri::command]
pub fn import_device_model_csv_cmd(
    csv_content: String,
    state: State<AppState>,
) -> Result<CsvImportResultDto, String> {
    log::info!("import_device_model_csv: bytes={}", csv_content.len());
    let mut guard = lock_session(&state)?;
    let session = guard.as_mut().ok_or_else(no_session)?;
    session
        .import_device_models_csv(&csv_content)
        .map(|r| {
            log::info!(
                "import_device_model_csv ok: created={} warnings={}",
                r.created_count,
                r.warning_count,
            );
            CsvImportResultDto {
                created_count: r.created_count,
                warning_count: r.warning_count,
            }
        })
        .map_err(|e| {
            let msg = e.to_string();
            log::error!("import_device_model_csv failed: {}", sanitize_error(&msg));
            msg
        })
}

/// Write the built-in device model import sample CSV to the given path.
#[tauri::command]
pub fn write_device_model_import_sample_csv(path: String) -> Result<(), String> {
    let path_ref = std::path::Path::new(&path);
    if path_ref.is_dir() {
        return Err(format!("'{}' is a directory, not a file", path));
    }
    std::fs::write(path_ref, DEVICE_MODEL_IMPORT_SAMPLE_CSV.as_bytes())
        .map_err(|e| format!("Failed to write sample CSV: {e}"))
}

// ── Export file write ─────────────────────────────────────────────────────────

/// Validate that `path` has an allowed export extension (`.svg` or `.png`).
///
/// Matching is case-insensitive: `.SVG`, `.Png`, etc. are accepted.
/// A missing extension is rejected.
fn validate_export_extension(path: &std::path::Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("svg") | Some("png") => Ok(()),
        _ => Err("Unsupported export file extension. Use .svg or .png.".to_string()),
    }
}

/// Shared validation + write helper used by the export commands below.
fn write_export(path: &str, data: &[u8]) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Path cannot be blank".to_string());
    }
    let path_ref = std::path::Path::new(path);
    if path_ref.is_dir() {
        return Err(format!(
            "'{}' is a directory, not a file",
            basename(path_ref)
        ));
    }
    validate_export_extension(path_ref)?;
    if let Some(parent) = path_ref.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            return Err("Parent directory does not exist".to_string());
        }
    }
    std::fs::write(path_ref, data).map_err(|e| format!("Failed to write file: {e}"))
}

/// Write UTF-8 text content (e.g. SVG) to the given path.
/// The path is supplied by the frontend after the user selects it via the native save dialog.
#[tauri::command]
pub fn write_export_file(path: String, content: String) -> Result<(), String> {
    write_export(&path, content.as_bytes())
}

/// Write raw bytes (e.g. PNG) to the given path.
/// The path is supplied by the frontend after the user selects it via the native save dialog.
#[tauri::command]
pub fn write_export_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    write_export(&path, &bytes)
}

// ── Search ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn search_repository_cmd(
    query: String,
    state: State<AppState>,
) -> Result<Vec<SearchResultDto>, String> {
    let guard = lock_session(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let results = session.search(&query);
    Ok(results
        .into_iter()
        .map(|r| SearchResultDto {
            kind: match r.kind {
                SearchResultKind::Location => "location",
                SearchResultKind::Rack => "rack",
                SearchResultKind::Device => "device",
                SearchResultKind::DeviceModel => "device_model",
                SearchResultKind::Placement => "placement",
            }
            .to_string(),
            id: r.id,
            code: r.code,
            label: r.label,
            detail: r.detail,
            score: r.score,
            navigation: SearchNavigationDto {
                location_id: r.navigation.location_id,
                rack_id: r.navigation.rack_id,
                device_id: r.navigation.device_id,
                device_model_id: r.navigation.device_model_id,
                placement_id: r.navigation.placement_id,
            },
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{
        read_csv_content, validate_export_extension, validate_repo_code, write_export,
        DEVICE_IMPORT_SAMPLE_CSV, MAX_CSV_BYTES,
    };
    use std::io::Write;
    use std::path::Path;

    fn dir_name_from_url(url: &str) -> String {
        let url = url.trim().trim_end_matches('/');
        let url = url.strip_suffix(".git").unwrap_or(url);
        url.split(['/', ':'])
            .filter(|s| !s.is_empty())
            .last()
            .unwrap_or("cloned-repo")
            .to_string()
    }

    // ── dir_name_from_url ─────────────────────────────────────────────────────

    #[test]
    fn dir_name_from_https_url_with_git_suffix() {
        assert_eq!(dir_name_from_url("https://github.com/org/repo.git"), "repo");
    }

    #[test]
    fn dir_name_from_ssh_url() {
        assert_eq!(dir_name_from_url("git@github.com:org/repo.git"), "repo");
    }

    #[test]
    fn dir_name_from_ssh_alias() {
        assert_eq!(dir_name_from_url("github-ris-test:org/repo.git"), "repo");
    }

    #[test]
    fn dir_name_from_https_without_git_suffix() {
        assert_eq!(dir_name_from_url("https://github.com/org/myrepo"), "myrepo");
    }

    #[test]
    fn dir_name_from_url_with_trailing_slash() {
        assert_eq!(dir_name_from_url("https://github.com/org/repo/"), "repo");
    }

    #[test]
    fn dir_name_from_url_with_token_at_sign() {
        // Token should not affect dir extraction
        assert_eq!(
            dir_name_from_url("https://token@github.com/org/repo.git"),
            "repo"
        );
    }

    // ── validate_repo_code ────────────────────────────────────────────────────

    #[test]
    fn valid_codes_are_accepted() {
        assert!(validate_repo_code("test-lab").is_ok());
        assert!(validate_repo_code("rack_01").is_ok());
        assert!(validate_repo_code("dc.01").is_ok());
        assert!(validate_repo_code("a").is_ok());
        assert!(validate_repo_code("my.repo-1_test").is_ok());
    }

    #[test]
    fn empty_code_is_rejected() {
        let err = validate_repo_code("").unwrap_err();
        assert!(err.contains("blank"), "got: {err}");
    }

    #[test]
    fn path_traversal_is_rejected() {
        // ".." by itself
        assert!(validate_repo_code("..").is_err());
        // Separator-embedded traversal
        assert!(validate_repo_code("../repo").is_err());
        assert!(validate_repo_code("a/b").is_err());
        assert!(validate_repo_code("a\\b").is_err());
        assert!(validate_repo_code("repo/").is_err());
    }

    #[test]
    fn windows_forbidden_chars_are_rejected() {
        assert!(validate_repo_code("name:bad").is_err());
        assert!(validate_repo_code("name*bad").is_err());
        assert!(validate_repo_code("name<bad").is_err());
        assert!(validate_repo_code("name>bad").is_err());
        assert!(validate_repo_code("name\"bad").is_err());
        assert!(validate_repo_code("name|bad").is_err());
        assert!(validate_repo_code("name?bad").is_err());
    }

    #[test]
    fn trailing_dot_is_rejected() {
        assert!(validate_repo_code("repo.").is_err());
        assert!(validate_repo_code("repo..").is_err());
    }

    #[test]
    fn trailing_space_is_rejected() {
        assert!(validate_repo_code("repo ").is_err());
    }

    #[test]
    fn windows_reserved_names_are_rejected() {
        assert!(validate_repo_code("CON").is_err());
        assert!(validate_repo_code("NUL").is_err());
        assert!(validate_repo_code("COM1").is_err());
        assert!(validate_repo_code("LPT9").is_err());
        // Case-insensitive
        assert!(validate_repo_code("con").is_err());
        assert!(validate_repo_code("nul").is_err());
        assert!(validate_repo_code("com1").is_err());
    }

    #[test]
    fn windows_reserved_names_with_extension_are_rejected() {
        // Windows treats NAME.ext the same as NAME — both map to the device.
        assert!(validate_repo_code("con.txt").is_err());
        assert!(validate_repo_code("nul.repo").is_err());
        assert!(validate_repo_code("aux.data").is_err());
        assert!(validate_repo_code("com1.test").is_err());
        assert!(validate_repo_code("lpt9.backup").is_err());
        // Case variants with extension
        assert!(validate_repo_code("CON.txt").is_err());
        assert!(validate_repo_code("NuL.repo").is_err());
    }

    #[test]
    fn normal_dotted_codes_are_accepted() {
        // These share a stem with no reserved name — must not be rejected.
        assert!(validate_repo_code("dc.01").is_ok());
        assert!(validate_repo_code("rack.01").is_ok());
        assert!(validate_repo_code("my.repo-1").is_ok());
    }

    #[test]
    fn reads_valid_utf8_csv() {
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        let content = "code,device_type,status\nsrv-01,server,planned";
        tmp.write_all(content.as_bytes()).unwrap();
        assert_eq!(
            read_csv_content(tmp.path(), MAX_CSV_BYTES).unwrap(),
            content
        );
    }

    #[test]
    fn rejects_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let err = read_csv_content(tmp.path(), MAX_CSV_BYTES).unwrap_err();
        assert!(err.contains("not a file"), "got: {err}");
    }

    #[test]
    fn rejects_nonexistent_path() {
        let err = read_csv_content(
            Path::new("/nonexistent/__ris_no_such_file__.csv"),
            MAX_CSV_BYTES,
        )
        .unwrap_err();
        assert!(!err.is_empty(), "expected non-empty error");
    }

    #[test]
    fn rejects_non_utf8_content() {
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        tmp.write_all(&[0xFF, 0xFE, 0x00, 0x01]).unwrap();
        let err = read_csv_content(tmp.path(), MAX_CSV_BYTES).unwrap_err();
        assert!(err.to_lowercase().contains("utf-8"), "got: {err}");
    }

    #[test]
    fn rejects_file_exceeding_size_limit() {
        let mut tmp = tempfile::NamedTempFile::new().unwrap();
        // Use a small limit so the test doesn't write megabytes to disk.
        let limit: u64 = 100;
        tmp.write_all(&vec![b'x'; 101]).unwrap();
        let err = read_csv_content(tmp.path(), limit).unwrap_err();
        assert!(err.to_lowercase().contains("too large"), "got: {err}");
    }

    // ── DEVICE_IMPORT_SAMPLE_CSV ──────────────────────────────────────────────

    #[test]
    fn sample_csv_all_rows_have_header_column_count() {
        let mut lines = DEVICE_IMPORT_SAMPLE_CSV
            .lines()
            .filter(|l| !l.trim().is_empty());
        let header = lines.next().expect("sample CSV must have a header row");
        let expected_fields = header.split(',').count();
        assert_eq!(expected_fields, 8, "header should have 8 columns");
        for (i, line) in lines.enumerate() {
            let actual = line.split(',').count();
            assert_eq!(
                actual,
                expected_fields,
                "row {} has {actual} fields, expected {expected_fields}: {line:?}",
                i + 2,
            );
        }
    }

    // ── write_export ──────────────────────────────────────────────────────────

    #[test]
    fn write_export_writes_text_to_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("output.svg");
        write_export(path.to_str().unwrap(), b"<svg/>").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<svg/>");
    }

    #[test]
    fn write_export_writes_bytes_to_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("output.png");
        let data: Vec<u8> = vec![0x89, 0x50, 0x4e, 0x47]; // PNG magic
        write_export(path.to_str().unwrap(), &data).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), data);
    }

    #[test]
    fn write_export_returns_error_for_empty_path() {
        assert!(write_export("", b"content").is_err());
        assert!(write_export("   ", b"content").is_err());
    }

    #[test]
    fn write_export_returns_error_when_path_is_directory() {
        let dir = tempfile::tempdir().unwrap();
        let err = write_export(dir.path().to_str().unwrap(), b"content").unwrap_err();
        assert!(err.contains("directory"), "error was: {err}");
    }

    #[test]
    fn write_export_returns_error_when_parent_dir_missing() {
        let dir = tempfile::tempdir().unwrap();
        let bad = dir.path().join("nonexistent").join("file.svg");
        let err = write_export(bad.to_str().unwrap(), b"content").unwrap_err();
        assert!(!err.is_empty(), "expected non-empty error");
    }

    // ── validate_export_extension ─────────────────────────────────────────────

    #[test]
    fn write_export_allows_svg_extension() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rack.svg");
        write_export(path.to_str().unwrap(), b"<svg/>").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<svg/>");
    }

    #[test]
    fn write_export_allows_png_extension() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rack.png");
        let data: Vec<u8> = vec![0x89, 0x50, 0x4e, 0x47];
        write_export(path.to_str().unwrap(), &data).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), data);
    }

    #[test]
    fn write_export_extension_check_is_case_insensitive() {
        let dir = tempfile::tempdir().unwrap();
        let svg_upper = dir.path().join("rack.SVG");
        write_export(svg_upper.to_str().unwrap(), b"<svg/>").unwrap();
        let png_mixed = dir.path().join("rack.Png");
        write_export(png_mixed.to_str().unwrap(), &[0u8]).unwrap();
    }

    #[test]
    fn write_export_rejects_unknown_extension() {
        let dir = tempfile::tempdir().unwrap();
        for ext in &["txt", "yaml", "exe", "json", "pdf"] {
            let path = dir.path().join(format!("rack.{ext}"));
            let err = write_export(path.to_str().unwrap(), b"data").unwrap_err();
            assert!(
                err.contains("Unsupported export file extension"),
                "expected extension rejection for .{ext}, got: {err}"
            );
        }
    }

    #[test]
    fn write_export_rejects_missing_extension() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rack-no-ext");
        let err = write_export(path.to_str().unwrap(), b"data").unwrap_err();
        assert!(
            err.contains("Unsupported export file extension"),
            "expected extension rejection for no-ext path, got: {err}"
        );
    }

    #[test]
    fn validate_export_extension_accepts_svg_and_png() {
        assert!(validate_export_extension(Path::new("file.svg")).is_ok());
        assert!(validate_export_extension(Path::new("file.png")).is_ok());
        assert!(validate_export_extension(Path::new("file.SVG")).is_ok());
        assert!(validate_export_extension(Path::new("file.PNG")).is_ok());
        assert!(validate_export_extension(Path::new("file.Svg")).is_ok());
        assert!(validate_export_extension(Path::new("file.pNg")).is_ok());
    }

    #[test]
    fn validate_export_extension_rejects_other_extensions() {
        assert!(validate_export_extension(Path::new("file.txt")).is_err());
        assert!(validate_export_extension(Path::new("file.yaml")).is_err());
        assert!(validate_export_extension(Path::new("file.exe")).is_err());
        assert!(validate_export_extension(Path::new("file.json")).is_err());
        assert!(validate_export_extension(Path::new("file.pdf")).is_err());
    }

    #[test]
    fn validate_export_extension_rejects_no_extension() {
        let err = validate_export_extension(Path::new("rack-no-ext")).unwrap_err();
        assert!(err.contains("Unsupported export file extension"), "{err}");
    }

    #[test]
    fn sample_csv_parses_without_errors_via_importer() {
        use ris_import::{preview_csv_import, CsvImportContext, CsvRowAction};
        let ctx = CsvImportContext::empty();
        let preview = preview_csv_import(DEVICE_IMPORT_SAMPLE_CSV, &ctx);
        assert!(
            preview.issues.is_empty(),
            "unexpected file-level issues: {:?}",
            preview.issues
        );
        let data_rows = preview.summary.total_rows;
        assert!(
            data_rows >= 4,
            "expected at least 4 data rows, got {data_rows}"
        );
        let error_rows = preview.summary.error_rows;
        assert_eq!(
            error_rows,
            0,
            "expected 0 error rows, got {error_rows}; rows: {:#?}",
            preview
                .rows
                .iter()
                .filter(|r| r.action == CsvRowAction::SkipDueToError)
                .collect::<Vec<_>>()
        );
    }
}
