use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use crate::diagnostics::{basename, sanitize_error};

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
    CreateRepositoryInputDto, CsvImportIssueDto, CsvImportPreviewDto, CsvImportPreviewRowDto,
    CsvImportResultDto, CsvImportSummaryDto, DeviceDto, DeviceModelDto, LocationDto,
    MovePlacementInputDto, OpenRepositoryResultDto, PlaceDeviceInputDto, PlaceRackObjectInputDto,
    PlacementDto, RackDetailDto, RackSummaryDto, RemovePlacementInputDto, RepositorySummaryDto,
    SaveSummaryDto, SearchNavigationDto, SearchResultDto, UpdateDeviceInputDto,
    UpdateDeviceModelInputDto, UpdateLocationInputDto, UpdateRackInputDto, ValidationIssueDto,
    ValidationSummaryDto,
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

#[tauri::command]
pub fn create_repository_cmd(
    input: CreateRepositoryInputDto,
    state: State<AppState>,
) -> Result<OpenRepositoryResultDto, String> {
    let path = input.path.trim().to_string();
    if path.is_empty() {
        return Err("Target path cannot be blank".to_string());
    }
    log::info!(
        "create_repository: {}",
        basename(std::path::Path::new(&path)),
    );

    let session = create_repository(CreateRepositoryInput {
        path: std::path::PathBuf::from(&path),
        code: input.code.clone(),
        name: input.name.clone(),
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
                description: rack.description.clone(),
                tags: rack.tags.clone(),
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
            code: r.code.clone(),
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
            warning_count: preview.summary.warning_count,
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
            code: input.code,
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
            code: input.code,
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

// ── CSV file reader ───────────────────────────────────────────────────────────

pub const MAX_CSV_BYTES: u64 = 10 * 1024 * 1024; // 10 MB

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
    use super::{read_csv_content, MAX_CSV_BYTES};
    use std::io::Write;
    use std::path::Path;

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
}
