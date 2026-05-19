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

// ── internal helpers ──────────────────────────────────────────────────────────

fn run_git(repo_path: &Path, args: &[&str]) -> Result<std::process::Output, GitError> {
    Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .map_err(GitError::from)
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

fn parse_porcelain_v1(output: &str) -> GitStatusSummary {
    let mut branch: Option<String> = None;
    let mut staged_count = 0usize;
    let mut unstaged_count = 0usize;
    let mut untracked_count = 0usize;
    let mut message: Option<String> = None;

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            if let Some(dot_pos) = rest.find("...") {
                branch = Some(rest[..dot_pos].to_string());
            } else if let Some(branch_name) = rest.strip_prefix("No commits yet on ") {
                branch = Some(branch_name.to_string());
                message = Some("No commits yet".to_string());
            } else {
                branch = Some(rest.to_string());
            }
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
        is_clean,
        staged_count,
        unstaged_count,
        untracked_count,
        message,
    }
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
