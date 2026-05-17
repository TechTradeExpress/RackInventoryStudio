use std::path::Path;
use std::sync::Mutex;

use ris_application::{open_repository, RepositorySession};
use ris_core::ValidationLevel;
use tauri::State;

use crate::dto::{
    OpenRepositoryResultDto, RepositorySummaryDto, SaveSummaryDto, ValidationIssueDto,
    ValidationSummaryDto,
};

pub struct AppState {
    pub session: Mutex<Option<RepositorySession>>,
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

    let mut guard = state.session.lock().unwrap();
    *guard = Some(session);

    Ok(OpenRepositoryResultDto {
        summary,
        validation_summary,
    })
}

#[tauri::command]
pub fn get_repository_summary(state: State<AppState>) -> Result<RepositorySummaryDto, String> {
    let guard = state.session.lock().unwrap();
    let session = guard
        .as_ref()
        .ok_or_else(|| "No repository is currently open".to_string())?;
    Ok(build_summary(session))
}

#[tauri::command]
pub fn validate_current_repository(
    state: State<AppState>,
) -> Result<Vec<ValidationIssueDto>, String> {
    let guard = state.session.lock().unwrap();
    let session = guard
        .as_ref()
        .ok_or_else(|| "No repository is currently open".to_string())?;
    let issues = session.validate();
    Ok(issues.iter().map(issue_to_dto).collect())
}

#[tauri::command]
pub fn save_current_repository(state: State<AppState>) -> Result<SaveSummaryDto, String> {
    let mut guard = state.session.lock().unwrap();
    let session = guard
        .as_mut()
        .ok_or_else(|| "No repository is currently open".to_string())?;
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
    let mut guard = state.session.lock().unwrap();
    *guard = None;
    Ok(())
}
