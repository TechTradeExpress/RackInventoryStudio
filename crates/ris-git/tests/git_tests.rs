use std::path::Path;
use std::process::Command;

// ── helpers ───────────────────────────────────────────────────────────────────

fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn configure_identity(repo_path: &Path) {
    for (key, value) in [
        ("user.email", "test@example.invalid"),
        ("user.name", "RackInventoryStudio Test"),
    ] {
        Command::new("git")
            .args(["config", key, value])
            .current_dir(repo_path)
            .output()
            .expect("git config should run");
    }
}

// ── is_git_repository ─────────────────────────────────────────────────────────

#[test]
fn non_git_directory_is_not_repository() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    assert!(!ris_git::is_git_repository(tmp.path()).unwrap());
}

#[test]
fn after_init_directory_is_repository() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    assert!(ris_git::is_git_repository(tmp.path()).unwrap());
}

// ── status ────────────────────────────────────────────────────────────────────

#[test]
fn status_on_non_git_directory_returns_not_repository() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let s = ris_git::status(tmp.path()).unwrap();
    assert!(!s.is_repository);
}

#[test]
fn status_after_init_is_clean_and_empty() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let s = ris_git::status(tmp.path()).unwrap();
    assert!(s.is_repository);
    assert!(s.is_clean);
    assert_eq!(s.staged_count, 0);
    assert_eq!(s.unstaged_count, 0);
    assert_eq!(s.untracked_count, 0);
}

#[test]
fn untracked_file_is_counted() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    std::fs::write(tmp.path().join("rack.yaml"), "rack: r01").unwrap();
    let s = ris_git::status(tmp.path()).unwrap();
    assert!(s.is_repository);
    assert!(!s.is_clean);
    assert_eq!(s.untracked_count, 1);
    assert_eq!(s.staged_count, 0);
    assert_eq!(s.unstaged_count, 0);
}

// ── recent_commits ────────────────────────────────────────────────────────────

#[test]
fn recent_commits_on_empty_repo_returns_empty() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let commits = ris_git::recent_commits(tmp.path(), 5).unwrap();
    assert!(commits.is_empty());
}

#[test]
fn recent_commits_returns_commits_newest_first() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());

    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();
    ris_git::commit_all(tmp.path(), "First commit").unwrap();

    std::fs::write(tmp.path().join("b.yaml"), "b").unwrap();
    ris_git::commit_all(tmp.path(), "Second commit").unwrap();

    let commits = ris_git::recent_commits(tmp.path(), 5).unwrap();
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].subject, "Second commit");
    assert_eq!(commits[1].subject, "First commit");
}

#[test]
fn recent_commits_respects_limit() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());

    for i in 0..4 {
        std::fs::write(tmp.path().join(format!("f{i}.yaml")), "x").unwrap();
        ris_git::commit_all(tmp.path(), &format!("Commit {i}")).unwrap();
    }

    let commits = ris_git::recent_commits(tmp.path(), 2).unwrap();
    assert_eq!(commits.len(), 2);
}

// ── commit_all ────────────────────────────────────────────────────────────────

#[test]
fn commit_creates_commit_with_correct_subject() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("inventory.yaml"), "code: dc01").unwrap();

    let commit = ris_git::commit_all(tmp.path(), "Initial inventory commit").unwrap();
    assert!(!commit.hash.is_empty());
    assert_eq!(commit.short_hash.len(), 7);
    assert_eq!(commit.subject, "Initial inventory commit");
    assert!(commit.author.is_some());
    assert!(commit.date.is_some());
}

#[test]
fn commit_nothing_to_commit_returns_error() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();
    ris_git::commit_all(tmp.path(), "Initial").unwrap();

    let result = ris_git::commit_all(tmp.path(), "Should fail — nothing new");
    assert!(
        matches!(result, Err(ris_git::GitError::NothingToCommit)),
        "expected NothingToCommit, got: {result:?}"
    );
}

#[test]
fn commit_blank_message_returns_empty_message_error() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();

    let result = ris_git::commit_all(tmp.path(), "   ");
    assert!(
        matches!(result, Err(ris_git::GitError::EmptyCommitMessage)),
        "expected EmptyCommitMessage, got: {result:?}"
    );
}

#[test]
fn status_is_clean_after_commit() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("rack.yaml"), "rack: r01").unwrap();
    ris_git::commit_all(tmp.path(), "Add rack").unwrap();

    let s = ris_git::status(tmp.path()).unwrap();
    assert!(s.is_repository);
    assert!(s.is_clean);
    assert_eq!(s.untracked_count, 0);
}
