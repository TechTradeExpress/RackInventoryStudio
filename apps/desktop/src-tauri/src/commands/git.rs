use tauri::State;

use crate::commands::repository::AppState;
use crate::dto::{GitCommitDto, GitStatusDto};

fn no_session() -> String {
    "No repository is currently open".to_string()
}

fn lock<'a>(
    state: &'a State<'a, AppState>,
) -> Result<std::sync::MutexGuard<'a, Option<ris_application::RepositorySession>>, String> {
    state
        .session
        .lock()
        .map_err(|_| "Internal error: session lock is poisoned".to_string())
}

fn commit_to_dto(c: ris_git::GitCommitSummary) -> GitCommitDto {
    GitCommitDto {
        hash: c.hash,
        short_hash: c.short_hash,
        subject: c.subject,
        author: c.author,
        date: c.date,
    }
}

#[tauri::command]
pub fn get_git_status(state: State<AppState>) -> Result<GitStatusDto, String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let s = ris_git::status(&session.repo_path).map_err(|e| e.to_string())?;
    Ok(GitStatusDto {
        is_repository: s.is_repository,
        branch: s.branch,
        is_clean: s.is_clean,
        staged_count: s.staged_count,
        unstaged_count: s.unstaged_count,
        untracked_count: s.untracked_count,
        message: s.message,
    })
}

#[tauri::command]
pub fn init_git_repository(state: State<AppState>) -> Result<(), String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    ris_git::init_repository(&session.repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_git_log(
    limit: Option<usize>,
    state: State<AppState>,
) -> Result<Vec<GitCommitDto>, String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let commits = ris_git::recent_commits(&session.repo_path, limit.unwrap_or(5))
        .map_err(|e| e.to_string())?;
    Ok(commits.into_iter().map(commit_to_dto).collect())
}

#[tauri::command]
pub fn commit_repository_changes(
    message: String,
    state: State<AppState>,
) -> Result<GitCommitDto, String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let commit = ris_git::commit_all(&session.repo_path, &message).map_err(|e| e.to_string())?;
    Ok(commit_to_dto(commit))
}
