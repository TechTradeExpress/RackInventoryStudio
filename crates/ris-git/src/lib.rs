use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

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
                write!(f, "Git command failed: {}", redact_git_error(stderr))
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

// ── credential redaction ──────────────────────────────────────────────────────

/// Redact inline credentials from a Git output string before showing to the user.
///
/// Applied patterns (in order):
/// 1. HTTPS URLs with embedded credentials:
///    `https://user:pass@host` → `https://[redacted]@host`
/// 2. GitHub token prefixes (outside URLs too):
///    `ghp_XXX` → `[redacted]`, `github_pat_XXX` → `[redacted]`
/// 3. Key=value forms (case-insensitive):
///    `access_token=X`, `token=X`, `password=X`, `passphrase=X` → `key=[redacted]`
///
/// Safe messages without credentials are returned unchanged.
pub fn redact_git_error(msg: &str) -> String {
    let s = redact_https_credentials(msg);
    let s = redact_prefixed_token(&s, "ghp_");
    let s = redact_prefixed_token(&s, "github_pat_");
    let s = redact_key_value_credential(&s, "access_token");
    let s = redact_key_value_credential(&s, "token");
    let s = redact_key_value_credential(&s, "password");
    redact_key_value_credential(&s, "passphrase")
}

/// Replace `https://[userinfo@]host...` with `https://[redacted]@host...` when
/// a `@` is present in the URL authority component.
fn redact_https_credentials(s: &str) -> String {
    const SCHEME: &str = "https://";
    let mut out = String::with_capacity(s.len());
    let mut pos = 0;
    while pos < s.len() {
        match s[pos..].find(SCHEME) {
            None => {
                out.push_str(&s[pos..]);
                break;
            }
            Some(rel) => {
                let scheme_start = pos + rel;
                out.push_str(&s[pos..scheme_start + SCHEME.len()]);
                let after = &s[scheme_start + SCHEME.len()..];
                // Find the end of this URL token.
                let url_len = after
                    .find(|c: char| c.is_whitespace() || matches!(c, '\'' | '"' | '>' | ')'))
                    .unwrap_or(after.len());
                let url_body = &after[..url_len];
                if let Some(at) = url_body.find('@') {
                    out.push_str("[redacted]@");
                    out.push_str(&url_body[at + 1..]);
                } else {
                    out.push_str(url_body);
                }
                pos = scheme_start + SCHEME.len() + url_len;
            }
        }
    }
    out
}

/// Replace all `{prefix}CHARS` occurrences with `[redacted]` where CHARS is
/// any run of alphanumeric, `_`, or `-` characters.
fn redact_prefixed_token(s: &str, prefix: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut pos = 0;
    while pos < s.len() {
        match s[pos..].find(prefix) {
            None => {
                out.push_str(&s[pos..]);
                break;
            }
            Some(rel) => {
                let match_start = pos + rel;
                out.push_str(&s[pos..match_start]);
                let after = &s[match_start + prefix.len()..];
                let tok_len = after
                    .find(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-')
                    .unwrap_or(after.len());
                out.push_str("[redacted]");
                pos = match_start + prefix.len() + tok_len;
            }
        }
    }
    out
}

/// Replace `{key}=VALUE` (ASCII-case-insensitive) with `{key}=[redacted]`.
///
/// VALUE is consumed up to the next whitespace, `&`, `'`, `"`, `)`, or end of string.
/// Matching is done byte-by-byte using ASCII case-folding only, so the function
/// never fails open due to unrelated Unicode in the message.
fn redact_key_value_credential(s: &str, key: &str) -> String {
    // key is always an ASCII literal so we can use ASCII case folding throughout.
    let key_bytes = key.as_bytes();
    let key_len = key_bytes.len();
    let s_bytes = s.as_bytes();
    let total = s_bytes.len();

    let mut out = String::with_capacity(s.len());
    let mut pos = 0; // byte position in s

    while pos < total {
        // Look for `key=` starting at pos, matching key ASCII-case-insensitively.
        let search_end = total.saturating_sub(key_len); // need at least key_len + 1 ('=') bytes
        let mut found_at: Option<usize> = None;
        'outer: for start in pos..=search_end {
            // Check that s_bytes[start..start+key_len] matches key case-insensitively.
            for (i, &kb) in key_bytes.iter().enumerate() {
                if !s_bytes[start + i].eq_ignore_ascii_case(&kb) {
                    continue 'outer;
                }
            }
            // Next byte must be '='.
            if start + key_len < total && s_bytes[start + key_len] == b'=' {
                found_at = Some(start);
                break;
            }
        }

        match found_at {
            None => {
                out.push_str(&s[pos..]);
                break;
            }
            Some(match_start) => {
                // Emit everything up to and including `key=` (preserving original case).
                let after_eq = match_start + key_len + 1; // skip key + '='
                out.push_str(&s[pos..after_eq]);
                // Consume the value up to the next delimiter or end of string.
                let val_len = s[after_eq..]
                    .find(|c: char| c.is_whitespace() || matches!(c, '&' | '\'' | '"' | ')'))
                    .unwrap_or(total - after_eq);
                out.push_str("[redacted]");
                pos = after_eq + val_len;
            }
        }
    }
    out
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
    remove_env: &[&str],
) -> Result<std::process::Output, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(repo_path);
    for (k, v) in extra_env {
        cmd.env(k, v);
    }
    for k in remove_env {
        cmd.env_remove(k);
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
    run_git_impl(repo_path, args, &[], &[])
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

/// Transport-safety flags prepended to every Git network command.
///
/// Blocks `ext::` and `fd::` transport helpers, which can execute arbitrary
/// commands when Git contacts a remote. These flags are defence-in-depth: URL
/// validation in `add_remote` already rejects such schemes, but a manually
/// edited `.git/config` could still contain a dangerous URL.
pub const TRANSPORT_SAFETY: &[&str] = &[
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "protocol.fd.allow=never",
];

/// Validate that `url` is an acceptable Git remote URL.
///
/// Accepted:
/// - HTTPS: `https://…`
/// - Explicit SSH: `ssh://…`
/// - SCP-like SSH (including SSH config host aliases):
///   `[user@]host:path`, e.g. `github-ris-test:su-17/repo.git`
///
/// Rejected: double-colon transport helpers (`ext::`, `fd::`, …), any other
/// `://` scheme (`file://`, `git://`, `http://`, `ssh+git://`, …), local
/// paths (`/`, `~`, `.`, Windows `C:\`), and bare names with no colon.
pub fn validate_remote_url(url: &str) -> Result<(), GitError> {
    let url = url.trim();
    if url.is_empty() {
        return Err(GitError::InvalidInput(
            "Remote URL cannot be empty".to_string(),
        ));
    }
    // Reject double-colon transport helpers (ext::, fd::, git::, …).
    if url.contains("::") {
        return Err(GitError::InvalidInput(
            "Unsupported Git remote URL scheme. Use HTTPS or SSH.".to_string(),
        ));
    }
    // Accept explicit SSH scheme.
    if url.starts_with("ssh://") {
        return Ok(());
    }
    // Accept HTTPS.
    if url.starts_with("https://") {
        return Ok(());
    }
    // Reject file:// and all other :// schemes (http://, git://, …).
    if url.contains("://") {
        return Err(GitError::InvalidInput(
            "Unsupported Git remote URL scheme. Use HTTPS or SSH.".to_string(),
        ));
    }
    // Reject local paths.
    if url.starts_with('/') || url.starts_with('~') || url.starts_with('.') {
        return Err(GitError::InvalidInput(
            "Unsupported Git remote URL scheme. Use HTTPS or SSH.".to_string(),
        ));
    }
    // Reject Windows absolute paths (C:\… or C:/…).
    let b = url.as_bytes();
    if b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
    {
        return Err(GitError::InvalidInput(
            "Unsupported Git remote URL scheme. Use HTTPS or SSH.".to_string(),
        ));
    }
    // SCP-like SSH remotes must contain a colon (e.g. user@host:path).
    if url.contains(':') {
        return Ok(());
    }
    Err(GitError::InvalidInput(
        "Unsupported Git remote URL scheme. Use HTTPS or SSH.".to_string(),
    ))
}

/// Add a named remote pointing to `url`.
pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), GitError> {
    validate_remote_name(name)?;
    validate_remote_url(url)?;
    let output = run_git(repo_path, &["remote", "add", name, url])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

// ── Temporary hooks-disabled directory ───────────────────────────────────────

/// Temporary empty directory used as a `core.hooksPath` override.
///
/// Backed by `tempfile::TempDir` which guarantees:
/// - a unique directory name (no deterministic or PID-based suffix),
/// - a newly-created directory (fails if the OS cannot allocate one),
/// - automatic removal on drop.
///
/// Hook suppression is **fail-closed**: if `create()` returns an error,
/// callers must not spawn git with askpass environment variables.
struct TempHooksDir(TempDir);

impl TempHooksDir {
    fn create() -> Result<Self, GitError> {
        tempfile::Builder::new()
            .prefix("ris-nohooks-")
            .tempdir()
            .map(TempHooksDir)
            .map_err(|e| {
                GitError::InvalidInput(format!(
                    "Cannot create secure hooks override directory: {e}"
                ))
            })
    }

    fn path(&self) -> &Path {
        self.0.path()
    }
}

// ── Security mode ─────────────────────────────────────────────────────────────

/// Controls security hardening applied to a git subprocess.
#[derive(Debug)]
pub enum GitSecurityMode {
    /// Standard operation — no additional environment hardening.
    Normal,
    /// Askpass-enabled operation — applies fail-closed hardening:
    ///
    /// - `core.hooksPath` is overridden to a newly-created, uniquely-named,
    ///   empty temp directory so repo-controlled hooks cannot run and inherit
    ///   `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN` from the subprocess env.
    ///   If the secure directory cannot be created, an error is returned and
    ///   git is **not** spawned.
    /// - `GIT_SSH` and `GIT_SSH_COMMAND` env vars are preserved — they are
    ///   user-controlled and removing them would silently break the user's
    ///   working SSH configuration.
    /// - `core.sshCommand` is overridden with `ssh_command` **only** when the
    ///   repository has a repo-local `core.sshCommand` in `.git/config`, i.e.
    ///   an untrusted command set by the repository that could inherit askpass
    ///   secrets. Global/user/system `core.sshCommand` is left untouched so
    ///   the user's terminal SSH configuration is preserved.
    ///
    /// Note: `RIS_ASKPASS_PORT`, `RIS_ASKPASS_TOKEN`, and `SSH_ASKPASS` are
    /// still present in `extra_env` — they are required so OpenSSH can invoke
    /// the askpass helper. They do not contain the passphrase.
    Askpass {
        /// SSH executable to use when overriding a repo-local `core.sshCommand`
        /// (e.g. `"ssh"` or an absolute path). Only applied when the repo has
        /// a repo-local `core.sshCommand`; otherwise ignored.
        ssh_command: String,
    },
}

/// No env vars are removed in askpass mode.
///
/// `GIT_SSH` and `GIT_SSH_COMMAND` are user-controlled environment variables
/// that determine which SSH binary git uses. Removing them would silently break
/// the user's working terminal SSH configuration (e.g. a custom identity file
/// or agent socket set via `GIT_SSH_COMMAND`). Repository-controlled SSH
/// configuration (`core.sshCommand` in `.git/config`) is handled separately —
/// it is overridden only when set at the repo-local level.
const ASKPASS_ENV_REMOVALS: &[&str] = &[];

/// Returns `true` when `core.sshCommand` is configured at the repository-local
/// level (`.git/config` or worktree config), as opposed to global/system/user config.
///
/// A repo-local `core.sshCommand` could contain an untrusted shell command written
/// by the repository owner that would run instead of SSH and could read askpass env
/// vars (`RIS_ASKPASS_PORT`, `RIS_ASKPASS_TOKEN`). We replace it with a safe SSH
/// binary in askpass mode. Global/user/system values are user-controlled and trusted.
///
/// Returns `false` on any error, when the key is not set, or when set only at a
/// global/system/user level.
fn is_core_ssh_command_repo_local(repo_path: &Path) -> bool {
    // `--show-origin` prints "file:<path>\t<value>\n"; exit code 1 = key not set.
    let config_out = match run_git(
        repo_path,
        &["config", "--show-origin", "--get", "core.sshCommand"],
    ) {
        Ok(o) if o.status.success() => o,
        _ => return false,
    };

    // Format: "file:<path>\t<value>\n"
    let stdout = String::from_utf8_lossy(&config_out.stdout);
    let origin = stdout.split('\t').next().unwrap_or("").trim();

    if let Some(file_path) = origin.strip_prefix("file:") {
        // Git reports repo-local config (`.git/config`, worktree config) as a
        // *relative* path when the command is run inside the repository working
        // directory, e.g. "file:.git/config". Global/system/user configs are
        // always at absolute paths ("/home/user/.gitconfig", "C:\Users\...").
        //
        // An absolute path starts with '/' (Unix) or a Windows drive letter
        // followed by ':' and a separator.
        let is_absolute = file_path.starts_with('/')
            || (file_path.len() >= 3
                && file_path.as_bytes()[0].is_ascii_alphabetic()
                && file_path.as_bytes()[1] == b':'
                && (file_path.as_bytes()[2] == b'\\' || file_path.as_bytes()[2] == b'/'));
        !is_absolute // relative ⇒ repo-local
    } else {
        false
    }
}

/// Build the `-c` config args for an askpass-hardened git invocation.
///
/// - Always adds `core.hooksPath=<unique-temp-dir>` (fail-closed).
/// - Adds `core.sshCommand=<ssh>` **only** when `ssh_command_override` is `Some`,
///   i.e. when the caller determined that the repo has a repo-local `core.sshCommand`
///   that must be neutralised. Global/user SSH configuration is left untouched.
///
/// Returns `(temp_hooks_guard, config_args)`. The guard must remain alive until
/// the git subprocess has exited. Failure returns an error; git must not be spawned.
fn prepare_askpass_hardening(
    ssh_command_override: Option<&str>,
) -> Result<(TempHooksDir, Vec<String>), GitError> {
    let dir = TempHooksDir::create()?;
    let mut args = vec![
        "-c".to_string(),
        format!("core.hooksPath={}", dir.path().display()),
    ];
    if let Some(ssh) = ssh_command_override {
        args.push("-c".to_string());
        args.push(format!("core.sshCommand={ssh}"));
    }
    Ok((dir, args))
}

// ── Remote / branch helpers ───────────────────────────────────────────────────

/// Returns `true` when `remote` is configured in this repository.
///
/// Uses `git remote get-url` so the check is authoritative without parsing
/// config files.  An unknown remote name returns `Ok(false)`; an IO or parse
/// error propagates.
pub fn has_remote(repo_path: &Path, remote: &str) -> Result<bool, GitError> {
    validate_remote_name(remote)?;
    let output = run_git(repo_path, &["remote", "get-url", remote])?;
    Ok(output.status.success())
}

/// Returns `true` when the current branch already has a configured tracking
/// (upstream) branch.
///
/// `git rev-parse @{u}` exits non-zero when no upstream is set; that is treated
/// as `Ok(false)` rather than an error.  Other failures (not a repo, IO error)
/// propagate.
pub fn branch_has_upstream(repo_path: &Path) -> Result<bool, GitError> {
    let output = run_git(
        repo_path,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )?;
    Ok(output.status.success())
}

/// Returns the short name of the currently checked-out branch.
///
/// Returns `Err` when HEAD is detached or the branch name cannot be determined.
pub fn get_current_branch(repo_path: &Path) -> Result<String, GitError> {
    current_branch(repo_path)
}

/// Build the `git` argument list for a push operation (excludes the `git`
/// binary itself and any `-c` security overrides).
///
/// When `has_upstream` is `false` the `-u` flag is included so Git sets the
/// tracking branch on the first push.  When it is `true` the branch already
/// tracks `remote/<branch>` and `-u` is omitted.
///
/// Exposed as a public function so callers can verify the exact arguments
/// without spawning a network process.
pub fn push_args(remote: &str, branch: &str, has_upstream: bool) -> Vec<String> {
    if has_upstream {
        vec!["push".to_string(), remote.to_string(), branch.to_string()]
    } else {
        vec![
            "push".to_string(),
            "-u".to_string(),
            remote.to_string(),
            branch.to_string(),
        ]
    }
}

// ── Push / Pull ───────────────────────────────────────────────────────────────

/// Push the current branch to `remote`.
///
/// When the current branch already has a configured upstream the push uses
/// `git push <remote> <branch>`.  On the first push (no upstream) `-u` is
/// added so Git sets the tracking branch: `git push -u <remote> <branch>`.
///
/// `extra_env` injects environment variables into the git subprocess (e.g.
/// SSH askpass vars).  `security` controls whether askpass hardening is
/// applied.  Use `GitSecurityMode::Askpass` whenever `extra_env` contains
/// `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN`; hook suppression and
/// SSH-wrapper neutralisation are fail-closed in that mode.
pub fn push_current_branch_with_env(
    repo_path: &Path,
    remote: &str,
    extra_env: &[(&str, &str)],
    security: GitSecurityMode,
) -> Result<(), GitError> {
    validate_remote_name(remote)?;
    let branch = current_branch(repo_path)?;
    // Determine whether to add -u.  Treat any detection failure as
    // "no upstream" so we always attempt to set tracking on the first push.
    let has_up = branch_has_upstream(repo_path).unwrap_or(false);

    // _hooks_guard must remain alive until run_git_impl returns (RAII cleanup).
    let (_hooks_guard, security_args) = match &security {
        GitSecurityMode::Normal => (None, Vec::new()),
        GitSecurityMode::Askpass { ssh_command } => {
            // Only override core.sshCommand when the repo has a repo-local value —
            // a repo-controlled SSH wrapper could run arbitrary code and inherit
            // askpass secrets. Preserve global/user/system SSH configuration.
            let ssh_override = if is_core_ssh_command_repo_local(repo_path) {
                Some(ssh_command.as_str())
            } else {
                None
            };
            let (dir, args) = prepare_askpass_hardening(ssh_override)?;
            (Some(dir), args)
        }
    };
    let remove_env: &[&str] = match &security {
        GitSecurityMode::Normal => &[],
        GitSecurityMode::Askpass { .. } => ASKPASS_ENV_REMOVALS,
    };

    let push_core = push_args(remote, branch.as_str(), has_up);
    let mut args: Vec<&str> =
        Vec::with_capacity(TRANSPORT_SAFETY.len() + security_args.len() + push_core.len());
    args.extend_from_slice(TRANSPORT_SAFETY);
    for s in &security_args {
        args.push(s.as_str());
    }
    for s in &push_core {
        args.push(s.as_str());
    }

    let output = run_git_impl(repo_path, &args, extra_env, remove_env)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

/// Push the current branch — convenience wrapper with no extra environment and normal security.
pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitError> {
    push_current_branch_with_env(repo_path, remote, &[], GitSecurityMode::Normal)
}

/// Pull the current branch from `remote` using `--ff-only`.
///
/// Rejects immediately if the working tree is not clean.
/// `extra_env` injects environment variables into the git subprocess.
/// `security` controls askpass hardening — see `push_current_branch_with_env` for details.
pub fn pull_ff_only_with_env(
    repo_path: &Path,
    remote: &str,
    extra_env: &[(&str, &str)],
    security: GitSecurityMode,
) -> Result<(), GitError> {
    validate_remote_name(remote)?;

    let s = status(repo_path)?;
    if s.is_repository && !s.is_clean {
        return Err(GitError::DirtyWorkingTree);
    }

    let branch = current_branch(repo_path)?;

    let (_hooks_guard, security_args) = match &security {
        GitSecurityMode::Normal => (None, Vec::new()),
        GitSecurityMode::Askpass { ssh_command } => {
            let ssh_override = if is_core_ssh_command_repo_local(repo_path) {
                Some(ssh_command.as_str())
            } else {
                None
            };
            let (dir, args) = prepare_askpass_hardening(ssh_override)?;
            (Some(dir), args)
        }
    };
    let remove_env: &[&str] = match &security {
        GitSecurityMode::Normal => &[],
        GitSecurityMode::Askpass { .. } => ASKPASS_ENV_REMOVALS,
    };

    let mut args: Vec<&str> = Vec::with_capacity(TRANSPORT_SAFETY.len() + security_args.len() + 5);
    args.extend_from_slice(TRANSPORT_SAFETY);
    for s in &security_args {
        args.push(s.as_str());
    }
    args.extend_from_slice(&["pull", "--ff-only", remote, branch.as_str()]);

    let output = run_git_impl(repo_path, &args, extra_env, remove_env)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

/// Pull the current branch — convenience wrapper with no extra environment and normal security.
pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
    pull_ff_only_with_env(repo_path, remote, &[], GitSecurityMode::Normal)
}

// ── Clone ─────────────────────────────────────────────────────────────────────

/// Run `git` without setting a working directory.
///
/// Used by `clone` where no repository directory exists yet. The caller is
/// responsible for ensuring all paths in `args` are absolute so they are not
/// interpreted relative to an arbitrary working directory.
fn run_git_global(args: &[&str]) -> Result<std::process::Output, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    cmd.output().map_err(GitError::from)
}

/// Build the git argument list for a hardened clone operation.
///
/// The returned vector includes `TRANSPORT_SAFETY` flags, then
/// `clone -- <url> <destination>`. It does not include the `git` binary
/// itself. Exposed as a public function so callers can assert the exact
/// arguments without executing a network operation.
pub fn build_clone_args(url: &str, destination: &str) -> Vec<String> {
    let mut args: Vec<String> = Vec::with_capacity(TRANSPORT_SAFETY.len() + 4);
    for &flag in TRANSPORT_SAFETY {
        args.push(flag.to_string());
    }
    args.push("clone".to_string());
    args.push("--".to_string());
    args.push(url.to_string());
    args.push(destination.to_string());
    args
}

/// Clone a Git repository from `url` into `destination`.
///
/// Validates `url` through `validate_remote_url` before spawning any
/// process, so `ext::`, `fd::`, `file://`, and other unsafe transports are
/// rejected without running git. The subprocess is launched with
/// `TRANSPORT_SAFETY` flags and the `--` separator — no shell is involved.
pub fn clone(url: &str, destination: &str) -> Result<(), GitError> {
    let url = url.trim();
    let destination = destination.trim();

    if url.is_empty() {
        return Err(GitError::InvalidInput(
            "Remote URL cannot be empty".to_string(),
        ));
    }
    if destination.is_empty() {
        return Err(GitError::InvalidInput(
            "Destination path cannot be empty".to_string(),
        ));
    }

    // Reject unsafe transports before spawning any process.
    validate_remote_url(url)?;

    let args = build_clone_args(url, destination);
    let args_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    let output = run_git_global(&args_refs)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(command_error(&output))
    }
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

/// Returns true when `url` looks like an SSH remote.
///
/// Handles:
/// - Explicit SSH schemes: `ssh://`, `ssh+git://`
/// - scp-like syntax: `[user@]host:path` (colon not followed by `//`)
///
/// Does NOT treat `git://` as SSH (it is an unauthenticated Git protocol).
pub fn is_ssh_url(url: &str) -> bool {
    if url.starts_with("ssh://") || url.starts_with("ssh+git://") {
        return true;
    }
    // Reject well-known non-SSH schemes and local paths.
    if url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("file://")
        || url.starts_with('/')
        || url.starts_with('~')
        || url.starts_with('.')
    {
        return false;
    }
    // Reject Windows absolute paths (C:\... or C:/...).
    let b = url.as_bytes();
    if b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
    {
        return false;
    }
    // scp-like syntax: [user@]host:path — colon must not be followed by `//`
    // (which would indicate a scheme like `git://` or `unknown://`), and the
    // character immediately after the colon must not be another colon (which
    // would indicate a transport helper like `ext::` or `fd::`).
    if let Some(colon_pos) = url.find(':') {
        let after_colon = &url[colon_pos + 1..];
        if after_colon.starts_with(':') {
            return false;
        }
        if !after_colon.starts_with("//") && !after_colon.is_empty() {
            return true;
        }
    }
    false
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

    #[test]
    fn is_ssh_url_recognises_scp_with_non_git_username() {
        assert!(is_ssh_url("deploy@host.example.com:org/repo.git"));
        assert!(is_ssh_url("ci-user@gitlab.internal:group/project.git"));
    }

    #[test]
    fn is_ssh_url_recognises_scp_without_user() {
        assert!(is_ssh_url("host.example.com:org/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_local_absolute_path() {
        assert!(!is_ssh_url("/home/user/repo"));
        assert!(!is_ssh_url("/repos/myrepo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_tilde_path() {
        assert!(!is_ssh_url("~/repos/myrepo"));
    }

    #[test]
    fn is_ssh_url_rejects_relative_path() {
        assert!(!is_ssh_url("./repos/myrepo"));
        assert!(!is_ssh_url("../sibling/repo"));
    }

    #[test]
    fn is_ssh_url_rejects_git_scheme() {
        assert!(!is_ssh_url("git://github.com/org/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_file_scheme() {
        assert!(!is_ssh_url("file:///home/user/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_unknown_scheme_with_double_slash() {
        assert!(!is_ssh_url("unknown://host/path"));
    }

    // ── SSH alias remote classification ───────────────────────────────────────

    #[test]
    fn is_ssh_url_recognises_ssh_config_alias_no_user() {
        // Alias defined in ~/.ssh/config: Host ssh-alias → no @ required.
        assert!(is_ssh_url("ssh-alias:owner/repo.git"));
    }

    #[test]
    fn is_ssh_url_recognises_ssh_config_alias_with_hyphen() {
        assert!(is_ssh_url("my-work-server:projects/repo.git"));
    }

    #[test]
    fn is_ssh_url_recognises_user_at_custom_host() {
        assert!(is_ssh_url("user@host.internal:path/repo.git"));
    }

    #[test]
    fn is_ssh_url_rejects_windows_absolute_path() {
        assert!(!is_ssh_url("C:\\repos\\myrepo"));
        assert!(!is_ssh_url("C:/repos/myrepo"));
    }

    // ── push_args unit tests ──────────────────────────────────────────────────

    #[test]
    fn push_args_no_upstream_includes_set_upstream_flag() {
        let args = push_args("origin", "main", false);
        assert_eq!(args, vec!["push", "-u", "origin", "main"]);
    }

    #[test]
    fn push_args_with_upstream_omits_set_upstream_flag() {
        let args = push_args("origin", "main", true);
        assert_eq!(args, vec!["push", "origin", "main"]);
    }

    #[test]
    fn push_args_ssh_alias_remote_uses_remote_name_not_url() {
        // When the configured origin URL is an SSH alias, the push command must
        // contain the remote NAME ("origin"), not the alias or any constructed URL.
        let args = push_args("origin", "feature-x", false);
        // Must contain remote name as the target
        assert!(
            args.contains(&"origin".to_string()),
            "args must contain the remote name 'origin': {args:?}"
        );
        // Must not contain any constructed GitHub URL
        for arg in &args {
            assert!(
                !arg.contains("github.com"),
                "args must not reference github.com: {arg}"
            );
            assert!(
                !arg.contains("git@"),
                "args must not contain git@ URL syntax: {arg}"
            );
            assert!(
                !arg.contains("ssh-alias:"),
                "args must not expand the remote alias URL: {arg}"
            );
        }
        // Exact structure: push -u <remote-name> <branch>
        assert_eq!(args[0], "push");
        assert_eq!(args[1], "-u");
        assert_eq!(args[2], "origin");
        assert_eq!(args[3], "feature-x");
    }

    #[test]
    fn push_args_existing_upstream_uses_remote_name_only() {
        let args = push_args("origin", "main", true);
        // Exact structure: push <remote-name> <branch>  (no -u)
        assert_eq!(args[0], "push");
        assert_eq!(args[1], "origin");
        assert_eq!(args[2], "main");
        assert_eq!(args.len(), 3, "no extra args expected: {args:?}");
    }

    // ── Askpass hardening tests ────────────────────────────────────────────────

    #[test]
    fn temp_hooks_dir_creates_unique_empty_dirs() {
        let d1 = TempHooksDir::create().expect("first create");
        let d2 = TempHooksDir::create().expect("second create");
        assert_ne!(
            d1.path(),
            d2.path(),
            "temp hooks dirs must have unique paths"
        );
        assert!(d1.path().is_dir(), "first hooks dir must exist");
        assert!(d2.path().is_dir(), "second hooks dir must exist");
        assert_eq!(
            d1.path().read_dir().unwrap().count(),
            0,
            "hooks dir must be empty"
        );
    }

    #[test]
    fn temp_hooks_dir_does_not_use_deterministic_pid_suffix() {
        let pid = std::process::id().to_string();
        let d = TempHooksDir::create().expect("create");
        let path_str = d.path().to_string_lossy();
        assert!(
            !path_str.contains(&format!("ris_nohooks_{pid}")),
            "path must not use the old deterministic PID-based name; got: {path_str}"
        );
    }

    #[test]
    fn temp_hooks_dir_is_removed_on_drop() {
        let path = {
            let d = TempHooksDir::create().expect("create");
            d.path().to_path_buf()
        };
        assert!(!path.exists(), "temp hooks dir must be removed on drop");
    }

    #[test]
    fn prepare_askpass_hardening_produces_hookspath_arg() {
        let (dir, args) = prepare_askpass_hardening(Some("ssh")).expect("hardening");
        let hooks_arg = format!("core.hooksPath={}", dir.path().display());
        assert!(
            args.contains(&hooks_arg),
            "args must contain core.hooksPath=<dir>; got: {args:?}"
        );
        assert!(
            args.contains(&"core.sshCommand=ssh".to_string()),
            "args must contain core.sshCommand=ssh when override is Some; got: {args:?}"
        );
        assert!(
            args.iter().filter(|a| *a == "-c").count() >= 2,
            "must have at least two -c flags when override is Some"
        );
    }

    #[test]
    fn prepare_askpass_hardening_dirs_are_unique() {
        let (d1, _) = prepare_askpass_hardening(None).expect("first");
        let (d2, _) = prepare_askpass_hardening(None).expect("second");
        assert_ne!(
            d1.path(),
            d2.path(),
            "each hardening call must produce a unique temp dir"
        );
    }

    #[test]
    fn askpass_env_removals_does_not_strip_user_ssh_vars() {
        // GIT_SSH and GIT_SSH_COMMAND are user-controlled env vars; removing them
        // would silently break the user's working terminal SSH configuration.
        assert!(
            !ASKPASS_ENV_REMOVALS.contains(&"GIT_SSH"),
            "GIT_SSH must not be in ASKPASS_ENV_REMOVALS — it is user-controlled"
        );
        assert!(
            !ASKPASS_ENV_REMOVALS.contains(&"GIT_SSH_COMMAND"),
            "GIT_SSH_COMMAND must not be in ASKPASS_ENV_REMOVALS — it is user-controlled"
        );
    }

    #[test]
    fn askpass_mode_has_ssh_command_override_when_explicitly_set() {
        let (_, args) = prepare_askpass_hardening(Some("/usr/bin/ssh")).unwrap();
        assert!(
            args.contains(&"core.sshCommand=/usr/bin/ssh".to_string()),
            "explicit ssh_command_override must set core.sshCommand; got: {args:?}"
        );
    }

    #[test]
    fn prepare_askpass_hardening_without_override_omits_ssh_command() {
        // When no repo-local core.sshCommand is present, we must NOT override
        // core.sshCommand so the user's global/system SSH config is preserved.
        let (_, args) = prepare_askpass_hardening(None).expect("hardening");
        assert!(
            !args.iter().any(|a| a.starts_with("core.sshCommand=")),
            "args must not contain core.sshCommand when override is None; got: {args:?}"
        );
        // core.hooksPath must always be present for hook suppression.
        assert!(
            args.iter().any(|a| a.starts_with("core.hooksPath=")),
            "args must always contain core.hooksPath for hook suppression; got: {args:?}"
        );
    }

    #[test]
    fn normal_mode_build_produces_no_security_args() {
        let mode = GitSecurityMode::Normal;
        let security_args: Vec<String> = match &mode {
            GitSecurityMode::Normal => Vec::new(),
            GitSecurityMode::Askpass { .. } => prepare_askpass_hardening(None).unwrap().1,
        };
        assert!(
            security_args.is_empty(),
            "Normal mode must produce no security args"
        );
    }

    #[test]
    fn is_core_ssh_command_repo_local_returns_false_for_fresh_repo() {
        let tmp = tempfile::TempDir::new().unwrap();
        let ok = std::process::Command::new("git")
            .args(["init"])
            .current_dir(tmp.path())
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            return; // git not available, skip
        }
        assert!(
            !is_core_ssh_command_repo_local(tmp.path()),
            "fresh repo with no core.sshCommand must return false"
        );
    }

    #[test]
    fn is_core_ssh_command_repo_local_returns_true_when_set_in_git_config() {
        let tmp = tempfile::TempDir::new().unwrap();
        let init_ok = std::process::Command::new("git")
            .args(["init"])
            .current_dir(tmp.path())
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !init_ok {
            return;
        }
        let set_ok = std::process::Command::new("git")
            .args(["config", "core.sshCommand", "/usr/bin/ssh"])
            .current_dir(tmp.path())
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !set_ok {
            return;
        }
        assert!(
            is_core_ssh_command_repo_local(tmp.path()),
            "repo-local core.sshCommand in .git/config must be detected as repo-local"
        );
    }

    // ── transport helper rejection ────────────────────────────────────────────

    #[test]
    fn is_ssh_url_rejects_ext_transport_helper() {
        assert!(!is_ssh_url("ext::sh -c 'touch /tmp/pwned'"));
    }

    #[test]
    fn is_ssh_url_rejects_fd_transport_helper() {
        assert!(!is_ssh_url("fd::4"));
    }

    #[test]
    fn is_ssh_url_rejects_git_double_colon_scheme() {
        assert!(!is_ssh_url("git::host/repo.git"));
    }

    // ── validate_remote_url ───────────────────────────────────────────────────

    #[test]
    fn validate_url_accepts_https() {
        assert!(validate_remote_url("https://github.com/owner/repo.git").is_ok());
    }

    #[test]
    fn validate_url_accepts_ssh_scheme() {
        assert!(validate_remote_url("ssh://git@github.com/owner/repo.git").is_ok());
    }

    #[test]
    fn validate_url_rejects_ssh_git_scheme() {
        assert!(validate_remote_url("ssh+git://git@github.com/owner/repo.git").is_err());
    }

    #[test]
    fn validate_url_accepts_scp_like_with_user() {
        assert!(validate_remote_url("git@github.com:owner/repo.git").is_ok());
    }

    #[test]
    fn validate_url_accepts_scp_like_ssh_alias() {
        // A real-world case: SSH alias defined in ~/.ssh/config
        assert!(
            validate_remote_url("github-ris-test:su-17/ris-ssh-passphrase-empty-test.git").is_ok()
        );
    }

    #[test]
    fn validate_url_accepts_scp_like_without_user() {
        assert!(validate_remote_url("host.example.com:org/repo.git").is_ok());
    }

    #[test]
    fn validate_url_rejects_empty() {
        assert!(validate_remote_url("").is_err());
        assert!(validate_remote_url("   ").is_err());
    }

    #[test]
    fn validate_url_rejects_ext_transport_helper() {
        let err = validate_remote_url("ext::sh -c 'touch /tmp/pwned'").unwrap_err();
        assert!(err.to_string().contains("Unsupported"));
    }

    #[test]
    fn validate_url_rejects_fd_transport_helper() {
        let err = validate_remote_url("fd::4").unwrap_err();
        assert!(err.to_string().contains("Unsupported"));
    }

    #[test]
    fn validate_url_rejects_file_scheme() {
        assert!(validate_remote_url("file:///home/user/repo.git").is_err());
    }

    #[test]
    fn validate_url_rejects_git_scheme() {
        assert!(validate_remote_url("git://github.com/owner/repo.git").is_err());
    }

    #[test]
    fn validate_url_rejects_http_scheme() {
        assert!(validate_remote_url("http://github.com/owner/repo.git").is_err());
    }

    #[test]
    fn validate_url_rejects_absolute_path() {
        assert!(validate_remote_url("/home/user/repo.git").is_err());
    }

    #[test]
    fn validate_url_rejects_tilde_path() {
        assert!(validate_remote_url("~/repos/myrepo.git").is_err());
    }

    #[test]
    fn validate_url_rejects_relative_path() {
        assert!(validate_remote_url("./repos/myrepo.git").is_err());
        assert!(validate_remote_url("../sibling/repo").is_err());
    }

    #[test]
    fn validate_url_rejects_windows_absolute_path() {
        assert!(validate_remote_url("C:\\repos\\myrepo").is_err());
        assert!(validate_remote_url("C:/repos/myrepo").is_err());
    }

    #[test]
    fn validate_url_rejects_bare_name_without_colon() {
        assert!(validate_remote_url("justanamenocoton").is_err());
    }

    #[test]
    fn transport_safety_contains_ext_and_fd_flags() {
        let flags: Vec<&str> = TRANSPORT_SAFETY.to_vec();
        assert!(
            flags
                .windows(2)
                .any(|w| w == ["-c", "protocol.ext.allow=never"]),
            "TRANSPORT_SAFETY must contain -c protocol.ext.allow=never"
        );
        assert!(
            flags
                .windows(2)
                .any(|w| w == ["-c", "protocol.fd.allow=never"]),
            "TRANSPORT_SAFETY must contain -c protocol.fd.allow=never"
        );
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

#[cfg(test)]
mod redaction_tests {
    use super::{redact_git_error, GitError};

    #[test]
    fn redacts_https_user_password_url() {
        let msg = "fatal: Authentication failed for 'https://user:s3cr3t@github.com/org/repo.git/'";
        let out = redact_git_error(msg);
        assert!(!out.contains("s3cr3t"), "password must be redacted");
        assert!(!out.contains("user:"), "userinfo must be redacted");
        assert!(out.contains("github.com"), "host must be preserved");
        assert!(out.contains("[redacted]@"), "redacted marker must appear");
    }

    #[test]
    fn redacts_https_token_as_userinfo() {
        let msg = "remote: Invalid credentials.\nfatal: Authentication failed for 'https://ghp_TOKENVALUE@github.com/org/repo.git'";
        let out = redact_git_error(msg);
        assert!(!out.contains("TOKENVALUE"), "token must be redacted");
        assert!(out.contains("github.com"), "host must be preserved");
    }

    #[test]
    fn redacts_ghp_prefix() {
        let msg = "error: invalid token ghp_abcDEF123456";
        let out = redact_git_error(msg);
        assert!(!out.contains("abcDEF123456"), "token body must be redacted");
        assert!(out.contains("[redacted]"), "redacted marker must appear");
    }

    #[test]
    fn redacts_github_pat_prefix() {
        let msg = "using github_pat_11AAAA_longpat_value to authenticate";
        let out = redact_git_error(msg);
        assert!(!out.contains("11AAAA"), "pat body must be redacted");
        assert!(out.contains("[redacted]"), "redacted marker must appear");
    }

    #[test]
    fn redacts_token_key_value() {
        let msg = "curl failed: token=myverysecrettoken&scope=repo";
        let out = redact_git_error(msg);
        assert!(
            !out.contains("myverysecrettoken"),
            "token value must be redacted"
        );
        assert!(out.contains("token="), "key must be preserved");
        assert!(out.contains("[redacted]"), "redacted marker must appear");
    }

    #[test]
    fn redacts_access_token_key_value() {
        let msg = "oauth error: access_token=abc123def456";
        let out = redact_git_error(msg);
        assert!(
            !out.contains("abc123def456"),
            "access_token value must be redacted"
        );
        assert!(out.contains("access_token="), "key must be preserved");
    }

    #[test]
    fn redacts_password_key_value() {
        let msg = "login failed: password=hunter2 for user admin";
        let out = redact_git_error(msg);
        assert!(!out.contains("hunter2"), "password value must be redacted");
        assert!(out.contains("password="), "key must be preserved");
    }

    #[test]
    fn redacts_passphrase_key_value() {
        let msg = "decrypt: passphrase=my_pass_phrase ok";
        let out = redact_git_error(msg);
        assert!(
            !out.contains("my_pass_phrase"),
            "passphrase value must be redacted"
        );
        assert!(out.contains("passphrase="), "key must be preserved");
    }

    #[test]
    fn preserves_safe_message() {
        let msg = "error: src refspec main does not match any";
        let out = redact_git_error(msg);
        assert_eq!(out, msg, "safe message must be unchanged");
    }

    #[test]
    fn git_error_display_redacts_stderr() {
        let err = GitError::CommandFailed {
            stderr: "fatal: Authentication failed for 'https://user:secret@host.com/repo.git'"
                .to_string(),
            exit_code: Some(128),
        };
        let display = format!("{err}");
        assert!(
            !display.contains("secret"),
            "secret must be redacted in Display"
        );
        assert!(
            display.contains("host.com"),
            "host must be preserved in Display"
        );
    }

    // ── Unicode fail-open regression tests ──────────────────────────────────────

    #[test]
    fn redacts_password_in_unicode_message() {
        // Polish Unicode before the credential — must not fail open.
        let msg = "fatal: Błąd İ password=hunter2";
        let out = redact_git_error(msg);
        assert!(
            !out.contains("hunter2"),
            "secret must be redacted even with Unicode prefix"
        );
        assert!(out.contains("password="), "key must be preserved");
        assert!(out.contains("[redacted]"), "redacted marker must appear");
    }

    #[test]
    fn redacts_access_token_in_unicode_message() {
        let msg = "błąd access_token=abc123 details follow";
        let out = redact_git_error(msg);
        assert!(
            !out.contains("abc123"),
            "secret must be redacted even with Unicode prefix"
        );
        assert!(out.contains("access_token="), "key must be preserved");
    }

    #[test]
    fn unicode_context_preserved_around_redaction() {
        let msg = "fatal: Błąd İ password=hunter2 więcej tekstu";
        let out = redact_git_error(msg);
        assert!(!out.contains("hunter2"), "secret must be redacted");
        // Non-secret Unicode context before and after should survive.
        assert!(
            out.contains("Błąd"),
            "non-secret Unicode before must be preserved"
        );
        assert!(
            out.contains("więcej tekstu"),
            "non-secret Unicode after must be preserved"
        );
    }

    #[test]
    fn redacts_mixed_case_key_with_unicode_in_message() {
        // Mixed-case key variants must match when Unicode is elsewhere in the string.
        let msg = "error: André Password=topsecret";
        let out = redact_git_error(msg);
        assert!(!out.contains("topsecret"), "secret must be redacted");
        assert!(
            out.contains("André"),
            "non-secret Unicode must be preserved"
        );
    }
}
