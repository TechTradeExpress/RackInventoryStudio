use std::path::Path;
use std::process::Command;

// ── error ─────────────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum GitError {
    /// `git` binary not found in PATH.
    GitNotFound,
    /// Commit attempted but nothing is staged after `git add -A`.
    NothingToCommit,
    /// Commit message was blank after trimming.
    EmptyCommitMessage,
    /// Input validation failed (blank name, invalid remote name, blank URL, etc.).
    InvalidInput(String),
    /// Pull refused because the working tree has local modifications.
    DirtyWorkingTree,
    /// Git command ran but returned a non-zero exit code.
    CommandFailed {
        exit_code: Option<i32>,
        stderr: String,
    },
    /// Underlying I/O error that is not a missing binary.
    Io(std::io::Error),
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::GitNotFound => write!(
                f,
                "Git executable not found — ensure Git is installed and available in PATH"
            ),
            GitError::NothingToCommit => {
                write!(f, "Nothing to commit — working tree is clean")
            }
            GitError::EmptyCommitMessage => write!(f, "Commit message cannot be empty"),
            GitError::InvalidInput(msg) => write!(f, "Invalid input: {msg}"),
            GitError::DirtyWorkingTree => write!(
                f,
                "Working tree has uncommitted changes — commit or save changes before pulling"
            ),
            GitError::CommandFailed { stderr, .. } if !stderr.is_empty() => {
                write!(f, "Git command failed: {stderr}")
            }
            GitError::CommandFailed { exit_code, .. } => {
                write!(f, "Git command failed (exit code: {exit_code:?})")
            }
            GitError::Io(e) => write!(f, "I/O error: {e}"),
        }
    }
}

impl std::error::Error for GitError {}

impl From<std::io::Error> for GitError {
    fn from(e: std::io::Error) -> Self {
        if e.kind() == std::io::ErrorKind::NotFound {
            GitError::GitNotFound
        } else {
            GitError::Io(e)
        }
    }
}

// ── output types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GitStatusSummary {
    pub is_repository: bool,
    pub branch: Option<String>,
    /// Configured upstream tracking branch, e.g. `"origin/main"`.
    pub upstream: Option<String>,
    /// Commits ahead of upstream.
    pub ahead: Option<u32>,
    /// Commits behind upstream.
    pub behind: Option<u32>,
    pub is_clean: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    /// Non-fatal note, e.g. "No commits yet".
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GitCommitSummary {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GitRemoteSummary {
    pub name: String,
    pub url: String,
}

// ── internal helpers ──────────────────────────────────────────────────────────

fn run_git_impl(
    repo_path: &Path,
    args: &[&str],
    extra_env: &[(&str, &str)],
) -> Result<std::process::Output, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(repo_path);
    for (k, v) in extra_env {
        cmd.env(k, v);
    }

    // Suppress the transient console/cmd window that would otherwise flash on
    // Windows when spawning git.exe from a GUI process.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    cmd.output().map_err(GitError::from)
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<std::process::Output, GitError> {
    run_git_impl(repo_path, args, &[])
}

fn command_error(output: &std::process::Output) -> GitError {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stderr = if stderr.is_empty() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        stderr
    };
    GitError::CommandFailed {
        exit_code: output.status.code(),
        stderr,
    }
}

/// Remote names must contain only ASCII letters, digits, `.`, `_`, `-`.
fn validate_remote_name(name: &str) -> Result<(), GitError> {
    if name.is_empty() {
        return Err(GitError::InvalidInput(
            "Remote name cannot be empty".to_string(),
        ));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(GitError::InvalidInput(format!(
            "Remote name '{}' contains invalid characters; use ASCII letters, digits, '.', '_', '-'",
            name
        )));
    }
    Ok(())
}

fn current_branch(repo_path: &Path) -> Result<String, GitError> {
    let output = run_git(repo_path, &["symbolic-ref", "--short", "HEAD"])?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("not a symbolic ref") || stderr.contains("detached") {
            return Err(GitError::CommandFailed {
                exit_code: output.status.code(),
                stderr: "Cannot push/pull: HEAD is detached — check out a branch first".to_string(),
            });
        }
        return Err(command_error(&output));
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        return Err(GitError::CommandFailed {
            exit_code: None,
            stderr: "Could not determine current branch name".to_string(),
        });
    }
    Ok(branch)
}

// ── status parsing ────────────────────────────────────────────────────────────

fn parse_ahead_behind(s: &str) -> (Option<u32>, Option<u32>) {
    let mut ahead = None;
    let mut behind = None;
    for part in s.split(',') {
        let part = part.trim();
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.trim().parse::<u32>().ok();
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.trim().parse::<u32>().ok();
        }
    }
    (ahead, behind)
}

type BranchLine = (
    Option<String>,
    Option<String>,
    Option<u32>,
    Option<u32>,
    Option<String>,
);

/// Parse the `## ` header line from `git status --porcelain=v1 --branch`.
///
/// Returns `(branch, upstream, ahead, behind, message)`.
fn parse_branch_line(rest: &str) -> BranchLine {
    if let Some(branch_name) = rest.strip_prefix("No commits yet on ") {
        return (
            Some(branch_name.to_string()),
            None,
            None,
            None,
            Some("No commits yet".to_string()),
        );
    }

    if let Some(dot_pos) = rest.find("...") {
        let branch = rest[..dot_pos].to_string();
        let after = &rest[dot_pos + 3..];

        if let Some(bracket_pos) = after.find(" [") {
            let upstream = after[..bracket_pos].to_string();
            let bracket_inner = after[bracket_pos + 2..].trim_end_matches(']');
            let (ahead, behind) = parse_ahead_behind(bracket_inner);
            (Some(branch), Some(upstream), ahead, behind, None)
        } else {
            // upstream present, no ahead/behind bracket
            (Some(branch), Some(after.to_string()), None, None, None)
        }
    } else {
        // No upstream configured
        (Some(rest.to_string()), None, None, None, None)
    }
}

fn parse_porcelain_v1(output: &str) -> GitStatusSummary {
    let mut branch: Option<String> = None;
    let mut upstream: Option<String> = None;
    let mut ahead: Option<u32> = None;
    let mut behind: Option<u32> = None;
    let mut staged_count = 0usize;
    let mut unstaged_count = 0usize;
    let mut untracked_count = 0usize;
    let mut message: Option<String> = None;

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            let (b, u, a, beh, msg) = parse_branch_line(rest);
            branch = b;
            upstream = u;
            ahead = a;
            behind = beh;
            message = msg;
        } else if line.len() >= 2 {
            let mut chars = line.chars();
            let x = chars.next().unwrap_or(' ');
            let y = chars.next().unwrap_or(' ');
            if x == '?' && y == '?' {
                untracked_count += 1;
            } else {
                if x != ' ' && x != '?' {
                    staged_count += 1;
                }
                if y != ' ' && y != '?' {
                    unstaged_count += 1;
                }
            }
        }
    }

    let is_clean = staged_count == 0 && unstaged_count == 0 && untracked_count == 0;

    GitStatusSummary {
        is_repository: true,
        branch,
        upstream,
        ahead,
        behind,
        is_clean,
        staged_count,
        unstaged_count,
        untracked_count,
        message,
    }
}

// ── public API ────────────────────────────────────────────────────────────────

pub fn is_git_repository(repo_path: &Path) -> Result<bool, GitError> {
    let output = run_git(repo_path, &["rev-parse", "--git-dir"])?;
    Ok(output.status.success())
}

pub fn init_repository(repo_path: &Path) -> Result<(), GitError> {
    let output = run_git(repo_path, &["init"])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

pub fn status(repo_path: &Path) -> Result<GitStatusSummary, GitError> {
    if !is_git_repository(repo_path)? {
        return Ok(GitStatusSummary {
            is_repository: false,
            branch: None,
            upstream: None,
            ahead: None,
            behind: None,
            is_clean: false,
            staged_count: 0,
            unstaged_count: 0,
            untracked_count: 0,
            message: None,
        });
    }

    let output = run_git(repo_path, &["status", "--porcelain=v1", "--branch"])?;
    if !output.status.success() {
        return Err(command_error(&output));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_porcelain_v1(&stdout))
}

pub fn recent_commits(repo_path: &Path, limit: usize) -> Result<Vec<GitCommitSummary>, GitError> {
    if !is_git_repository(repo_path)? {
        return Ok(Vec::new());
    }

    let limit_str = limit.to_string();
    // tformat: adds a newline after each record; fields separated by ASCII US (0x1f).
    let format_arg = "--pretty=tformat:%H%x1f%h%x1f%s%x1f%an%x1f%ai";

    let output = run_git(repo_path, &["log", "-n", &limit_str, format_arg])?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        // An empty repo with no commits is not an error condition for the caller.
        if stderr.contains("does not have any commits")
            || stderr.contains("bad default revision")
            || stderr.contains("unknown revision")
        {
            return Ok(Vec::new());
        }
        return Err(GitError::CommandFailed {
            exit_code: output.status.code(),
            stderr,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(5, '\x1f').collect();
        if parts.len() < 3 {
            continue;
        }
        commits.push(GitCommitSummary {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            subject: parts[2].to_string(),
            author: parts
                .get(3)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            date: parts
                .get(4)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        });
    }

    Ok(commits)
}

pub fn commit_all(repo_path: &Path, message: &str) -> Result<GitCommitSummary, GitError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(GitError::EmptyCommitMessage);
    }

    // Stage all changes (tracked modifications + new files).
    let add_out = run_git(repo_path, &["add", "-A"])?;
    if !add_out.status.success() {
        return Err(command_error(&add_out));
    }

    // `git diff --cached --quiet` exits 0 if nothing staged, 1 if staged.
    let diff_out = run_git(repo_path, &["diff", "--cached", "--quiet"])?;
    match diff_out.status.code() {
        Some(0) => return Err(GitError::NothingToCommit),
        Some(1) => {}
        _ => return Err(command_error(&diff_out)),
    }

    let commit_out = run_git(repo_path, &["commit", "-m", message])?;
    if !commit_out.status.success() {
        return Err(command_error(&commit_out));
    }

    recent_commits(repo_path, 1)?
        .into_iter()
        .next()
        .ok_or(GitError::CommandFailed {
            exit_code: None,
            stderr: "Commit succeeded but log returned no entries".to_string(),
        })
}

/// List configured remotes (name + fetch URL, deduplicated by name).
pub fn list_remotes(repo_path: &Path) -> Result<Vec<GitRemoteSummary>, GitError> {
    let output = run_git(repo_path, &["remote", "-v"])?;
    if !output.status.success() {
        return Err(command_error(&output));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen = std::collections::HashSet::new();
    let mut remotes = Vec::new();

    for line in stdout.lines() {
        // Format: "name\turl (fetch)" or "name\turl (push)"
        let mut parts = line.splitn(2, '\t');
        let name = match parts.next() {
            Some(n) => n.to_string(),
            None => continue,
        };
        let rest = match parts.next() {
            Some(r) => r,
            None => continue,
        };
        // Keep only the fetch entry
        if !rest.ends_with(" (fetch)") {
            continue;
        }
        let url = rest.trim_end_matches(" (fetch)").to_string();
        if seen.insert(name.clone()) {
            remotes.push(GitRemoteSummary { name, url });
        }
    }

    Ok(remotes)
}

/// Add a named remote pointing to `url`.
pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), GitError> {
    validate_remote_name(name)?;
    if url.trim().is_empty() {
        return Err(GitError::InvalidInput(
            "Remote URL cannot be empty".to_string(),
        ));
    }
    let output = run_git(repo_path, &["remote", "add", name, url])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

/// Push the current branch to `remote`, setting the upstream tracking ref (`-u`).
/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
pub fn push_current_branch_with_env(
    repo_path: &Path,
    remote: &str,
    extra_env: &[(&str, &str)],
) -> Result<(), GitError> {
    validate_remote_name(remote)?;
    let branch = current_branch(repo_path)?;
    let output = run_git_impl(repo_path, &["push", "-u", remote, &branch], extra_env)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

/// Push the current branch — convenience wrapper with no extra environment.
pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitError> {
    push_current_branch_with_env(repo_path, remote, &[])
}

/// Pull the current branch from `remote` using `--ff-only`.
///
/// Rejects immediately if the working tree is not clean (staged, unstaged, or untracked files),
/// to avoid ambiguous state after a fast-forward that lands new YAML content.
/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
pub fn pull_ff_only_with_env(
    repo_path: &Path,
    remote: &str,
    extra_env: &[(&str, &str)],
) -> Result<(), GitError> {
    validate_remote_name(remote)?;

    // Guard: refuse if working tree is dirty.
    let s = status(repo_path)?;
    if s.is_repository && !s.is_clean {
        return Err(GitError::DirtyWorkingTree);
    }

    let branch = current_branch(repo_path)?;
    let output = run_git_impl(
        repo_path,
        &["pull", "--ff-only", remote, &branch],
        extra_env,
    )?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

/// Pull the current branch — convenience wrapper with no extra environment.
pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
    pull_ff_only_with_env(repo_path, remote, &[])
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

/// Returns true when `url` looks like an SSH remote (git@…, ssh://, or ssh+git://).
pub fn is_ssh_url(url: &str) -> bool {
    url.starts_with("git@") || url.starts_with("ssh://") || url.starts_with("ssh+git://")
}

/// Classifies a Git stderr string for common SSH authentication failures.
///
/// Returns a user-friendly message string when a known pattern is matched, or
/// `None` when the error does not appear SSH-related.
pub fn classify_git_ssh_error(stderr: &str) -> Option<String> {
    let s = stderr.to_ascii_lowercase();
    if s.contains("permission denied (publickey") || s.contains("permission denied (public key") {
        return Some(
            "SSH authentication failed. Your key may require a passphrase or may not be \
             loaded in ssh-agent. Run ssh-add to add your key."
                .to_string(),
        );
    }
    if s.contains("could not read from remote repository") {
        return Some(
            "Could not read from remote repository. Check your network connection and remote URL."
                .to_string(),
        );
    }
    if s.contains("agent admitted failure") {
        return Some(
            "SSH agent admitted failure signing with the key. Try ssh-add to reload the key."
                .to_string(),
        );
    }
    if s.contains("no such identity") {
        return Some(
            "SSH key identity not found. Run ssh-add to load your key into the agent.".to_string(),
        );
    }
    if s.contains("bad passphrase") {
        return Some("Incorrect SSH key passphrase. Authentication failed.".to_string());
    }
    if s.contains("host key verification failed") {
        return Some(
            "SSH host key verification failed. The remote server's host key is untrusted or has \
             changed. Check ~/.ssh/known_hosts."
                .to_string(),
        );
    }
    if s.contains("too many authentication failures") {
        return Some(
            "Too many SSH authentication attempts failed. Try adding your key to ssh-agent with \
             ssh-add."
                .to_string(),
        );
    }
    if s.contains("permission denied") {
        return Some(
            "SSH authentication failed. Check that your key is loaded in ssh-agent or that the \
             key has access to the remote repository."
                .to_string(),
        );
    }
    None
}

// ── SSH helper unit tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod ssh_tests {
    use super::*;

    #[test]
    fn is_ssh_url_recognises_git_at_prefix() {
        assert!(is_ssh_url("git@github.com:org/repo.git"));
    }

    #[test]
    fn is_ssh_url_recognises_ssh_scheme() {
        assert!(is_ssh_url("ssh://git@github.com/org/repo.git"));
    }

    #[test]
    fn is_ssh_url_recognises_ssh_git_scheme() {
        assert!(is_ssh_url("ssh+git://git@github.com/org/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_https() {
        assert!(!is_ssh_url("https://github.com/org/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_http() {
        assert!(!is_ssh_url("http://github.com/org/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_empty() {
        assert!(!is_ssh_url(""));
    }

    #[test]
    fn classify_permission_denied_publickey() {
        let stderr = "git@github.com: Permission denied (publickey).";
        assert!(classify_git_ssh_error(stderr).is_some());
        let msg = classify_git_ssh_error(stderr).unwrap();
        assert!(msg.contains("ssh-agent") || msg.contains("ssh-add"));
    }

    #[test]
    fn classify_could_not_read_from_remote() {
        let msg = classify_git_ssh_error("fatal: Could not read from remote repository.").unwrap();
        assert!(msg.contains("remote repository"));
    }

    #[test]
    fn classify_agent_admitted_failure() {
        let msg = classify_git_ssh_error(
            "sign_and_send_pubkey: signing failed: agent admitted failure to sign",
        )
        .unwrap();
        assert!(msg.contains("agent admitted failure"));
    }

    #[test]
    fn classify_host_key_verification_failed() {
        let msg = classify_git_ssh_error("Host key verification failed.").unwrap();
        assert!(msg.contains("host key"));
    }

    #[test]
    fn classify_too_many_failures() {
        let msg = classify_git_ssh_error(
            "Received disconnect from host: 2: Too many authentication failures",
        )
        .unwrap();
        assert!(msg.contains("Too many"));
    }

    #[test]
    fn classify_returns_none_for_non_ssh_error() {
        assert!(classify_git_ssh_error("YAML parse error at line 5").is_none());
        assert!(classify_git_ssh_error("nothing to commit, working tree clean").is_none());
    }

    #[test]
    fn redact_ssh_url_does_not_strip_git_at() {
        // is_ssh_url should handle git@ URLs that do NOT contain credentials
        assert!(is_ssh_url("git@github.com:user/repo.git"));
    }
}

// ── parser unit tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod parser_tests {
    use super::*;

    #[test]
    fn branch_line_no_upstream() {
        let (branch, upstream, ahead, behind, msg) = parse_branch_line("main");
        assert_eq!(branch, Some("main".to_string()));
        assert!(upstream.is_none());
        assert!(ahead.is_none());
        assert!(behind.is_none());
        assert!(msg.is_none());
    }

    #[test]
    fn branch_line_with_upstream_no_ahead_behind() {
        let (branch, upstream, ahead, behind, _) = parse_branch_line("main...origin/main");
        assert_eq!(branch, Some("main".to_string()));
        assert_eq!(upstream, Some("origin/main".to_string()));
        assert!(ahead.is_none());
        assert!(behind.is_none());
    }

    #[test]
    fn branch_line_ahead_only() {
        let (branch, upstream, ahead, behind, _) =
            parse_branch_line("main...origin/main [ahead 2]");
        assert_eq!(branch, Some("main".to_string()));
        assert_eq!(upstream, Some("origin/main".to_string()));
        assert_eq!(ahead, Some(2));
        assert!(behind.is_none());
    }

    #[test]
    fn branch_line_behind_only() {
        let (branch, upstream, ahead, behind, _) =
            parse_branch_line("main...origin/main [behind 3]");
        assert_eq!(branch, Some("main".to_string()));
        assert_eq!(upstream, Some("origin/main".to_string()));
        assert!(ahead.is_none());
        assert_eq!(behind, Some(3));
    }

    #[test]
    fn branch_line_ahead_and_behind() {
        let (branch, upstream, ahead, behind, _) =
            parse_branch_line("main...origin/main [ahead 1, behind 2]");
        assert_eq!(branch, Some("main".to_string()));
        assert_eq!(upstream, Some("origin/main".to_string()));
        assert_eq!(ahead, Some(1));
        assert_eq!(behind, Some(2));
    }

    #[test]
    fn branch_line_no_commits_yet() {
        let (branch, upstream, ahead, behind, msg) = parse_branch_line("No commits yet on main");
        assert_eq!(branch, Some("main".to_string()));
        assert!(upstream.is_none());
        assert!(ahead.is_none());
        assert!(behind.is_none());
        assert_eq!(msg, Some("No commits yet".to_string()));
    }

    #[test]
    fn porcelain_v1_parses_full_status() {
        let input = "## main...origin/main [ahead 1]\nM  foo.yaml\n?? bar.yaml\n";
        let s = parse_porcelain_v1(input);
        assert!(s.is_repository);
        assert_eq!(s.branch, Some("main".to_string()));
        assert_eq!(s.upstream, Some("origin/main".to_string()));
        assert_eq!(s.ahead, Some(1));
        assert!(s.behind.is_none());
        assert_eq!(s.staged_count, 1);
        assert_eq!(s.untracked_count, 1);
        assert!(!s.is_clean);
    }
}
