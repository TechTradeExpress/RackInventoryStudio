use tauri::State;

use crate::commands::repository::{build_summary, AppState};
use crate::dto::{GitCommitDto, GitRemoteDto, GitStatusDto, RepositorySummaryDto};

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
        upstream: s.upstream,
        ahead: s.ahead,
        behind: s.behind,
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

#[tauri::command]
pub fn list_git_remotes(state: State<AppState>) -> Result<Vec<GitRemoteDto>, String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let remotes = ris_git::list_remotes(&session.repo_path).map_err(|e| e.to_string())?;
    Ok(remotes
        .into_iter()
        .map(|r| GitRemoteDto {
            name: r.name,
            url: r.url,
        })
        .collect())
}

#[tauri::command]
pub fn add_git_remote(name: String, url: String, state: State<AppState>) -> Result<(), String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    ris_git::add_remote(&session.repo_path, &name, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn push_git_current_branch(remote: String, state: State<AppState>) -> Result<(), String> {
    let repo_path = {
        let guard = lock(&state)?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        session.repo_path.clone()
    };
    ris_git::push_current_branch(&repo_path, &remote).map_err(|e| e.to_string())
}

/// Pull from `remote` using `--ff-only`, then reload the repository session from disk.
///
/// Returns the updated repository summary so the frontend can refresh counts.
///
/// The session lock is released before the slow network operation so other commands remain
/// responsive. After pull completes we re-acquire the lock and verify that the active
/// session still points to the same `repo_path` we pulled. If the user closed or opened a
/// different repository while pull was in flight we return an error and leave the current
/// session untouched.
#[tauri::command]
pub fn pull_git_ff_only(
    remote: String,
    state: State<AppState>,
) -> Result<RepositorySummaryDto, String> {
    // Release lock before the potentially slow git network operation.
    let repo_path = {
        let guard = lock(&state)?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        session.repo_path.clone()
    };

    ris_git::pull_ff_only(&repo_path, &remote).map_err(|e| e.to_string())?;

    // Reload session so in-memory state reflects the newly pulled YAML files.
    // If reload fails, the old session remains unchanged.
    let new_session = ris_application::open_repository(&repo_path)
        .map_err(|e| format!("Pull succeeded but failed to reload repository: {e}"))?;
    let summary = build_summary(&new_session);

    // Only replace the session if the active session is still the same repository.
    // The user may have closed or switched repositories while pull was running.
    {
        let mut guard = lock(&state)?;
        let still_same = guard.as_ref().is_some_and(|s| s.repo_path == repo_path);
        if still_same {
            *guard = Some(new_session);
        } else {
            return Err(
                "Pull succeeded, but the open repository changed before reload; \
                 reopen the repository to refresh state."
                    .to_string(),
            );
        }
    }

    Ok(summary)
}
