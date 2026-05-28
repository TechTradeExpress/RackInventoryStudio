use tauri::State;

use crate::commands::repository::{build_summary, AppState};
use crate::diagnostics::sanitize_error;
use crate::dto::{
    GitCommitDto, GitRemoteDto, GitStatusDto, RepositorySummaryDto, SshDiagnosticsDto,
};
use crate::ssh_askpass::{
    build_askpass_env_pairs, find_ssh_executable, get_core_ssh_command, get_ssh_version,
    probe_ssh_add, ssh_agent_guidance, AskpassEnv, AskpassState, SshAddStatus,
};

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

/// Build a user-facing error message for push/pull failures.
///
/// For SSH remotes, attempts to classify the raw git stderr and returns a
/// friendly explanation plus agent guidance. Falls back to the raw error
/// string when no pattern is recognised or the remote is not SSH.
fn ssh_error_message(e: &ris_git::GitError, is_ssh: bool) -> String {
    if is_ssh {
        if let ris_git::GitError::CommandFailed { ref stderr, .. } = e {
            if let Some(friendly) = ris_git::classify_git_ssh_error(stderr) {
                let add_status = probe_ssh_add();
                let guidance = ssh_agent_guidance(&add_status, true, None);
                if guidance.is_empty() {
                    return friendly;
                }
                return format!("{}\n\n{}", friendly, guidance.join("\n"));
            }
        }
    }
    e.to_string()
}

#[tauri::command]
pub fn get_git_status(state: State<AppState>) -> Result<GitStatusDto, String> {
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let s = ris_git::status(&session.repo_path).map_err(|e| {
        let msg = e.to_string();
        log::warn!("get_git_status failed: {}", sanitize_error(&msg));
        msg
    })?;
    log::info!(
        "get_git_status: is_repo={} branch={:?} ahead={:?} behind={:?} clean={}",
        s.is_repository,
        s.branch,
        s.ahead,
        s.behind,
        s.is_clean,
    );
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
    log::info!("git_commit: start");
    let guard = lock(&state)?;
    let session = guard.as_ref().ok_or_else(no_session)?;
    let commit = ris_git::commit_all(&session.repo_path, &message).map_err(|e| {
        let msg = e.to_string();
        log::error!("git_commit failed: {}", sanitize_error(&msg));
        msg
    })?;
    log::info!("git_commit ok: short_hash={}", commit.short_hash);
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
pub fn push_git_current_branch(
    remote: String,
    state: State<AppState>,
    askpass: State<AskpassState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("git_push: remote={remote}");
    let (repo_path, remote_url) = {
        let guard = lock(&state)?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
        let url = remotes
            .into_iter()
            .find(|r| r.name == remote)
            .map(|r| r.url);
        (session.repo_path.clone(), url)
    };

    let is_ssh = remote_url
        .as_deref()
        .map(ris_git::is_ssh_url)
        .unwrap_or(false);
    let askpass_env: Option<AskpassEnv> = if is_ssh {
        match askpass.start_session(app) {
            Ok(e) => Some(e),
            Err(warn) => {
                log::warn!("askpass session not started, continuing without: {warn}");
                None
            }
        }
    } else {
        None
    };
    let env_owned: Vec<(String, String)> = askpass_env
        .as_ref()
        .map(build_askpass_env_pairs)
        .unwrap_or_default();
    let env_refs: Vec<(&str, &str)> = env_owned
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    let result = ris_git::push_current_branch_with_env(&repo_path, &remote, &env_refs, is_ssh)
        .map_err(|e| {
            let msg = ssh_error_message(&e, is_ssh);
            log::error!("git_push failed: {}", sanitize_error(&e.to_string()));
            msg
        });

    if let Some(ref env) = askpass_env {
        askpass.clear_session(env.session_id);
    }

    result?;
    log::info!("git_push ok");
    Ok(())
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
    askpass: State<AskpassState>,
    app: tauri::AppHandle,
) -> Result<RepositorySummaryDto, String> {
    // Release lock before the potentially slow git network operation.
    let (repo_path, remote_url) = {
        let guard = lock(&state)?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
        let url = remotes
            .into_iter()
            .find(|r| r.name == remote)
            .map(|r| r.url);
        (session.repo_path.clone(), url)
    };

    let is_ssh = remote_url
        .as_deref()
        .map(ris_git::is_ssh_url)
        .unwrap_or(false);
    let askpass_env: Option<AskpassEnv> = if is_ssh {
        match askpass.start_session(app) {
            Ok(e) => Some(e),
            Err(warn) => {
                log::warn!("askpass session not started, continuing without: {warn}");
                None
            }
        }
    } else {
        None
    };
    let env_owned: Vec<(String, String)> = askpass_env
        .as_ref()
        .map(build_askpass_env_pairs)
        .unwrap_or_default();
    let env_refs: Vec<(&str, &str)> = env_owned
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();

    log::info!("git_pull: remote={remote}");
    let pull_result = ris_git::pull_ff_only_with_env(&repo_path, &remote, &env_refs, is_ssh)
        .map_err(|e| {
            let msg = ssh_error_message(&e, is_ssh);
            log::error!("git_pull failed: {}", sanitize_error(&e.to_string()));
            msg
        });

    if let Some(ref env) = askpass_env {
        askpass.clear_session(env.session_id);
    }

    pull_result?;

    // Reload session so in-memory state reflects the newly pulled YAML files.
    // If reload fails, the old session remains unchanged.
    let new_session = ris_application::open_repository(&repo_path).map_err(|e| {
        let msg = format!("Pull succeeded but failed to reload repository: {e}");
        log::error!("git_pull reload failed: {}", sanitize_error(&msg));
        msg
    })?;
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

    log::info!(
        "git_pull ok: locations={} racks={} devices={}",
        summary.locations_count,
        summary.racks_count,
        summary.devices_count,
    );
    Ok(summary)
}

/// Deliver the user's passphrase response (or cancellation) to the waiting askpass session.
///
/// Called by the frontend's SshPassphraseModal after the user submits or cancels.
/// `passphrase: None` cancels the operation. The passphrase is held in memory only for the
/// duration of the TCP handshake and is never logged or stored.
#[tauri::command]
pub fn respond_ssh_passphrase(
    passphrase: Option<String>,
    askpass: State<AskpassState>,
) -> Result<(), String> {
    askpass.respond(passphrase)
}

/// Return SSH diagnostics for the currently open repository and specified remote.
///
/// All fields are best-effort; missing data is surfaced as `None` rather than an error.
/// This command is infallible from Tauri's perspective.
#[tauri::command]
pub fn get_ssh_diagnostics(remote: Option<String>, state: State<AppState>) -> SshDiagnosticsDto {
    let (repo_path, remote_url) = match lock(&state) {
        Ok(guard) => match guard.as_ref() {
            Some(session) => {
                let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
                let url = if let Some(ref name) = remote {
                    remotes.into_iter().find(|r| &r.name == name).map(|r| r.url)
                } else {
                    remotes.into_iter().next().map(|r| r.url)
                };
                (Some(session.repo_path.clone()), url)
            }
            None => (None, None),
        },
        Err(_) => (None, None),
    };

    let is_ssh = remote_url
        .as_deref()
        .map(ris_git::is_ssh_url)
        .unwrap_or(false);
    let ssh_add_status = probe_ssh_add();
    let ssh_executable = find_ssh_executable();
    let ssh_version = get_ssh_version();
    let core_ssh_command = repo_path.as_ref().and_then(|p| get_core_ssh_command(p));
    let ssh_auth_sock = std::env::var("SSH_AUTH_SOCK").ok();

    let (status_str, identity_count) = match &ssh_add_status {
        SshAddStatus::HasIdentities(n) => ("has_identities".to_string(), Some(*n)),
        SshAddStatus::NoIdentities => ("no_identities".to_string(), None),
        SshAddStatus::AgentUnreachable => ("agent_unreachable".to_string(), None),
        SshAddStatus::CommandUnavailable => ("command_unavailable".to_string(), None),
        SshAddStatus::Unknown => ("unknown".to_string(), None),
    };

    let guidance = ssh_agent_guidance(&ssh_add_status, is_ssh, core_ssh_command.as_deref());

    SshDiagnosticsDto {
        remote_url,
        remote_url_is_ssh: is_ssh,
        ssh_auth_sock,
        ssh_add_status: status_str,
        ssh_add_identity_count: identity_count,
        core_ssh_command,
        ssh_executable,
        ssh_version,
        guidance,
    }
}
