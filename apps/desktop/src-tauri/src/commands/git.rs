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
/// For SSH remotes, classifies the raw git stderr into a friendly explanation
/// plus agent guidance. Always appends the raw git output so the user can see
/// the exact failure (e.g. `[ris-askpass]` traces from the helper binary).
/// Falls back to the raw error string for non-SSH remotes or unrecognised errors.
fn ssh_error_message(e: &ris_git::GitError, is_ssh: bool) -> String {
    if is_ssh {
        if let ris_git::GitError::CommandFailed { ref stderr, .. } = e {
            if let Some(friendly) = ris_git::classify_git_ssh_error(stderr) {
                let add_status = probe_ssh_add();
                let guidance = ssh_agent_guidance(&add_status, true, None);
                let raw_detail = if !stderr.is_empty() {
                    format!("\n\nGit output:\n{}", ris_git::redact_git_error(stderr))
                } else {
                    String::new()
                };
                if guidance.is_empty() {
                    return format!("{friendly}{raw_detail}");
                }
                return format!("{friendly}\n\n{}{raw_detail}", guidance.join("\n"));
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

/// Push the current branch to `remote`.
///
/// This is an **async** command so that the Tauri WebView remains responsive
/// while git runs the potentially long network operation. The blocking git
/// subprocess is offloaded to `spawn_blocking`; the async runtime yields in
/// the meantime, allowing Tauri events such as `ssh-passphrase-requested` to
/// be dispatched to the WebView and processed by the frontend before the push
/// completes. On Windows with WebView2, a synchronous command would hold the
/// IPC channel busy, preventing event delivery until the command returned.
#[tauri::command]
pub async fn push_git_current_branch(
    remote: String,
    state: State<'_, AppState>,
    askpass: State<'_, AskpassState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    log::info!("git_push: start remote={remote}");

    // Extract owned values while holding the session lock, then release it
    // before any .await so we never hold a MutexGuard across an await point.
    let (repo_path, remote_url) = {
        let guard = state
            .session
            .lock()
            .map_err(|_| "Internal error: session lock is poisoned".to_string())?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        let remotes = ris_git::list_remotes(&session.repo_path).map_err(|e| e.to_string())?;
        let found = remotes.into_iter().find(|r| r.name == remote);
        if found.is_none() {
            return Err(format!(
                "No remote named \"{remote}\" is configured for this repository. \
                 Add a remote in the Git panel before pushing."
            ));
        }
        let url = found.map(|r| r.url);
        (session.repo_path.clone(), url)
    }; // guard dropped — lock released before any .await

    let is_ssh = remote_url
        .as_deref()
        .map(ris_git::is_ssh_url)
        .unwrap_or(false);
    let askpass_env: Option<AskpassEnv> = if is_ssh {
        match askpass.start_session(app.clone()) {
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

    let security = if is_ssh {
        let ssh_cmd = find_ssh_executable().unwrap_or_else(|| "ssh".to_string());
        ris_git::GitSecurityMode::Askpass {
            ssh_command: ssh_cmd,
        }
    } else {
        ris_git::GitSecurityMode::Normal
    };

    log::info!(
        "git_push: spawning blocking task is_ssh={is_ssh} askpass_active={}",
        askpass_env.is_some()
    );

    // Run the blocking git subprocess on a thread pool thread via spawn_blocking.
    // This yields back to the async runtime so the WebView can process Tauri
    // events (e.g. ssh-passphrase-requested) while git waits for user input.
    let raw_result = tauri::async_runtime::spawn_blocking(move || {
        // env_refs borrows from env_owned, so rebuild it inside the closure.
        let env_refs: Vec<(&str, &str)> = env_owned
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        ris_git::push_current_branch_with_env(&repo_path, &remote, &env_refs, security)
    })
    .await
    .map_err(|e| format!("push task join error: {e}"))?;

    if let Some(ref env) = askpass_env {
        askpass.clear_session(&env.session_id, &app);
    }

    raw_result.map_err(|e| {
        let msg = ssh_error_message(&e, is_ssh);
        log::error!("git_push failed: {}", sanitize_error(&e.to_string()));
        msg
    })?;

    log::info!("git_push ok");
    Ok(())
}

/// Pull from `remote` using `--ff-only`, then reload the repository session from disk.
///
/// Returns the updated repository summary so the frontend can refresh counts.
///
/// This is an **async** command for the same reason as `push_git_current_branch`:
/// the blocking git network operation is run in `spawn_blocking` so the WebView
/// remains responsive and can process `ssh-passphrase-requested` events during
/// the pull. The session lock is released before any `.await` and re-acquired
/// only for the final session replacement.
#[tauri::command]
pub async fn pull_git_ff_only(
    remote: String,
    state: State<'_, AppState>,
    askpass: State<'_, AskpassState>,
    app: tauri::AppHandle,
) -> Result<RepositorySummaryDto, String> {
    // Release lock before the potentially slow git network operation.
    // Must not hold a MutexGuard across any .await.
    let (repo_path, remote_url) = {
        let guard = state
            .session
            .lock()
            .map_err(|_| "Internal error: session lock is poisoned".to_string())?;
        let session = guard.as_ref().ok_or_else(no_session)?;
        let remotes = ris_git::list_remotes(&session.repo_path).map_err(|e| e.to_string())?;
        let found = remotes.into_iter().find(|r| r.name == remote);
        if found.is_none() {
            return Err(format!(
                "No remote named \"{remote}\" is configured for this repository. \
                 Add a remote in the Git panel before pulling."
            ));
        }
        let url = found.map(|r| r.url);
        (session.repo_path.clone(), url)
    }; // guard dropped — lock released before any .await

    let is_ssh = remote_url
        .as_deref()
        .map(ris_git::is_ssh_url)
        .unwrap_or(false);
    let askpass_env: Option<AskpassEnv> = if is_ssh {
        match askpass.start_session(app.clone()) {
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

    let security = if is_ssh {
        let ssh_cmd = find_ssh_executable().unwrap_or_else(|| "ssh".to_string());
        ris_git::GitSecurityMode::Askpass {
            ssh_command: ssh_cmd,
        }
    } else {
        ris_git::GitSecurityMode::Normal
    };

    log::info!(
        "git_pull: spawning blocking task remote={remote} is_ssh={is_ssh} askpass_active={}",
        askpass_env.is_some()
    );

    let repo_path_for_pull = repo_path.clone();
    let remote_for_pull = remote.clone();
    let raw_pull = tauri::async_runtime::spawn_blocking(move || {
        let env_refs: Vec<(&str, &str)> = env_owned
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        ris_git::pull_ff_only_with_env(&repo_path_for_pull, &remote_for_pull, &env_refs, security)
    })
    .await
    .map_err(|e| format!("pull task join error: {e}"))?;

    if let Some(ref env) = askpass_env {
        askpass.clear_session(&env.session_id, &app);
    }

    raw_pull.map_err(|e| {
        let msg = ssh_error_message(&e, is_ssh);
        log::error!("git_pull failed: {}", sanitize_error(&e.to_string()));
        msg
    })?;

    // Reload session so in-memory state reflects the newly pulled YAML files.
    // Also done in spawn_blocking because open_repository reads YAML from disk.
    let repo_path_for_reload = repo_path.clone();
    let new_session = tauri::async_runtime::spawn_blocking(move || {
        ris_application::open_repository(&repo_path_for_reload)
    })
    .await
    .map_err(|e| format!("reload task join error: {e}"))?
    .map_err(|e| {
        let msg = format!("Pull succeeded but failed to reload repository: {e}");
        log::error!("git_pull reload failed: {}", sanitize_error(&msg));
        msg
    })?;

    let summary = build_summary(&new_session);

    // Only replace the session if the active session is still the same repository.
    // The user may have closed or switched repositories while pull was running.
    {
        let mut guard = state
            .session
            .lock()
            .map_err(|_| "Internal error: session lock is poisoned".to_string())?;
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
///
/// `session_id` must match the currently active session; a mismatch returns a typed error
/// so the frontend can show a friendly "request expired, retry Push" message.
#[tauri::command]
pub fn respond_ssh_passphrase(
    session_id: String,
    passphrase: Option<String>,
    askpass: State<AskpassState>,
) -> Result<(), String> {
    askpass.respond(&session_id, passphrase)
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
