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

fn init_bare(dir: &Path, name: &str) -> std::path::PathBuf {
    let bare_path = dir.join(name);
    let out = Command::new("git")
        .args(["init", "--bare", name])
        .current_dir(dir)
        .output()
        .expect("git init --bare");
    assert!(
        out.status.success(),
        "git init --bare failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    bare_path
}

fn setup_working_repo_with_commit(dir: &Path) {
    ris_git::init_repository(dir).unwrap();
    configure_identity(dir);
    std::fs::write(dir.join("inventory.yaml"), "code: dc01").unwrap();
    ris_git::commit_all(dir, "Initial commit").unwrap();
}

fn clone_repo(bare_path: &Path, dest: &Path) {
    let out = Command::new("git")
        .arg("clone")
        .arg(bare_path)
        .arg(dest)
        .output()
        .expect("git clone should run");
    assert!(
        out.status.success(),
        "git clone failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    configure_identity(dest);
}

// ── list_remotes ──────────────────────────────────────────────────────────────

#[test]
fn list_remotes_empty_for_new_repo() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let remotes = ris_git::list_remotes(tmp.path()).unwrap();
    assert!(remotes.is_empty());
}

#[test]
fn add_remote_and_list_returns_it() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();

    let bare_path = init_bare(tmp.path(), "remote.git");
    ris_git::add_remote(tmp.path(), "origin", &bare_path.to_string_lossy()).unwrap();

    let remotes = ris_git::list_remotes(tmp.path()).unwrap();
    assert_eq!(remotes.len(), 1);
    assert_eq!(remotes[0].name, "origin");
    assert_eq!(remotes[0].url, bare_path.to_string_lossy());
}

// ── add_remote validation ─────────────────────────────────────────────────────

#[test]
fn add_remote_rejects_blank_name() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let result = ris_git::add_remote(tmp.path(), "", "https://example.invalid/repo.git");
    assert!(
        matches!(result, Err(ris_git::GitError::InvalidInput(_))),
        "expected InvalidInput, got: {result:?}"
    );
}

#[test]
fn add_remote_rejects_name_with_spaces() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let result = ris_git::add_remote(tmp.path(), "my remote", "https://example.invalid/repo.git");
    assert!(
        matches!(result, Err(ris_git::GitError::InvalidInput(_))),
        "expected InvalidInput, got: {result:?}"
    );
}

#[test]
fn add_remote_rejects_blank_url() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    let result = ris_git::add_remote(tmp.path(), "origin", "  ");
    assert!(
        matches!(result, Err(ris_git::GitError::InvalidInput(_))),
        "expected InvalidInput, got: {result:?}"
    );
}

// ── push ──────────────────────────────────────────────────────────────────────

#[test]
fn push_current_branch_pushes_to_bare_remote() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    let repo_a = tmp.path().join("repo_a");
    std::fs::create_dir_all(&repo_a).unwrap();
    setup_working_repo_with_commit(&repo_a);
    ris_git::add_remote(&repo_a, "origin", &bare_path.to_string_lossy()).unwrap();

    ris_git::push_current_branch(&repo_a, "origin").unwrap();

    // Verify: status shows upstream after push with -u
    let s = ris_git::status(&repo_a).unwrap();
    assert!(
        s.upstream.is_some(),
        "upstream should be set after push -u, got: {:?}",
        s
    );
    assert!(s.is_clean);
    assert_eq!(s.ahead, None); // nothing ahead after a fresh push
}

#[test]
fn status_shows_ahead_after_local_commit_post_push() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    let repo_a = tmp.path().join("repo_a");
    std::fs::create_dir_all(&repo_a).unwrap();
    setup_working_repo_with_commit(&repo_a);
    ris_git::add_remote(&repo_a, "origin", &bare_path.to_string_lossy()).unwrap();
    ris_git::push_current_branch(&repo_a, "origin").unwrap();

    // Make another local commit without pushing
    std::fs::write(repo_a.join("extra.yaml"), "extra").unwrap();
    ris_git::commit_all(&repo_a, "Extra local commit").unwrap();

    let s = ris_git::status(&repo_a).unwrap();
    assert_eq!(
        s.ahead,
        Some(1),
        "should be ahead by 1 after local commit: {s:?}"
    );
}

// ── pull ──────────────────────────────────────────────────────────────────────

#[test]
fn pull_ff_only_fast_forwards_from_remote() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    // Repo A: push initial commit
    let repo_a = tmp.path().join("repo_a");
    std::fs::create_dir_all(&repo_a).unwrap();
    setup_working_repo_with_commit(&repo_a);
    ris_git::add_remote(&repo_a, "origin", &bare_path.to_string_lossy()).unwrap();
    ris_git::push_current_branch(&repo_a, "origin").unwrap();

    // Clone to repo B, add commit, push back to bare
    let repo_b = tmp.path().join("repo_b");
    clone_repo(&bare_path, &repo_b);
    std::fs::write(repo_b.join("from_b.yaml"), "from b").unwrap();
    ris_git::commit_all(&repo_b, "Add file from B").unwrap();
    let push_out = Command::new("git")
        .arg("push")
        .current_dir(&repo_b)
        .output()
        .unwrap();
    assert!(
        push_out.status.success(),
        "B push failed: {}",
        String::from_utf8_lossy(&push_out.stderr)
    );

    // Repo A: pull should fast-forward and bring in the new file
    ris_git::pull_ff_only(&repo_a, "origin").unwrap();
    assert!(
        repo_a.join("from_b.yaml").exists(),
        "pulled file should exist in repo A after pull"
    );
}

#[test]
fn pull_ff_only_rejects_dirty_working_tree() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    let repo_a = tmp.path().join("repo_a");
    std::fs::create_dir_all(&repo_a).unwrap();
    setup_working_repo_with_commit(&repo_a);
    ris_git::add_remote(&repo_a, "origin", &bare_path.to_string_lossy()).unwrap();
    ris_git::push_current_branch(&repo_a, "origin").unwrap();

    // Add an untracked file to make the working tree dirty
    std::fs::write(repo_a.join("untracked.yaml"), "dirty").unwrap();

    let result = ris_git::pull_ff_only(&repo_a, "origin");
    assert!(
        matches!(result, Err(ris_git::GitError::DirtyWorkingTree)),
        "expected DirtyWorkingTree, got: {result:?}"
    );
}

// ── status parsing (unit) ─────────────────────────────────────────────────────

#[test]
fn parse_status_with_no_upstream() {
    if !git_available() {
        return;
    }
    // Use a fresh repo with a commit but no remote — status should have no upstream
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();
    ris_git::commit_all(tmp.path(), "Initial").unwrap();

    let s = ris_git::status(tmp.path()).unwrap();
    assert!(s.is_repository);
    assert!(s.upstream.is_none(), "no upstream expected: {s:?}");
    assert!(s.ahead.is_none());
    assert!(s.behind.is_none());
}

// ── GitSecurityMode::Askpass integration tests ────────────────────────────────

#[test]
fn askpass_mode_push_to_local_remote_succeeds() {
    // Verify that push with GitSecurityMode::Askpass works correctly against a
    // local file:// remote (hooks override is transparent for local operations).
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);

    let remote_url = format!("file://{}", bare_path.display());
    ris_git::add_remote(&workdir, "origin", &remote_url).unwrap();

    let result = ris_git::push_current_branch_with_env(
        &workdir,
        "origin",
        &[],
        ris_git::GitSecurityMode::Askpass {
            ssh_command: "ssh".to_string(),
        },
    );
    assert!(
        result.is_ok(),
        "askpass-mode push to local remote must succeed: {result:?}"
    );
}

#[test]
fn askpass_mode_pull_from_local_remote_succeeds() {
    // Verify that pull with GitSecurityMode::Askpass fast-forwards correctly.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    // repo_a: push initial commit
    let repo_a = tmp.path().join("repo_a");
    std::fs::create_dir_all(&repo_a).unwrap();
    setup_working_repo_with_commit(&repo_a);
    let remote_url = format!("file://{}", bare_path.display());
    ris_git::add_remote(&repo_a, "origin", &remote_url).unwrap();
    ris_git::push_current_branch(&repo_a, "origin").unwrap();

    // repo_b: clone and add a new commit
    let repo_b = tmp.path().join("repo_b");
    clone_repo(&bare_path, &repo_b);
    configure_identity(&repo_b);
    std::fs::write(repo_b.join("extra.yaml"), "extra").unwrap();
    ris_git::commit_all(&repo_b, "Second commit").unwrap();
    ris_git::push_current_branch(&repo_b, "origin").unwrap();

    // repo_a: pull with askpass mode should fast-forward
    let result = ris_git::pull_ff_only_with_env(
        &repo_a,
        "origin",
        &[],
        ris_git::GitSecurityMode::Askpass {
            ssh_command: "ssh".to_string(),
        },
    );
    assert!(
        result.is_ok(),
        "askpass-mode pull from local remote must succeed: {result:?}"
    );
}

#[test]
fn normal_mode_push_unaffected_by_security_refactor() {
    // Regression: push_current_branch (Normal mode) must still work after
    // the GitSecurityMode refactor.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");

    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    ris_git::add_remote(&workdir, "origin", &bare_path.to_string_lossy()).unwrap();

    let result = ris_git::push_current_branch(&workdir, "origin");
    assert!(result.is_ok(), "normal-mode push must succeed: {result:?}");
}

// ── has_remote ────────────────────────────────────────────────────────────────

#[test]
fn has_remote_returns_true_for_configured_remote() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");
    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    ris_git::add_remote(&workdir, "origin", &bare_path.to_string_lossy()).unwrap();

    assert!(
        ris_git::has_remote(&workdir, "origin").unwrap(),
        "has_remote should be true for a configured remote"
    );
}

#[test]
fn has_remote_returns_false_for_missing_remote() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();

    assert!(
        !ris_git::has_remote(tmp.path(), "origin").unwrap(),
        "has_remote should be false when no remote is configured"
    );
}

// ── branch_has_upstream ───────────────────────────────────────────────────────

#[test]
fn branch_has_upstream_false_before_first_push() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();
    ris_git::commit_all(tmp.path(), "Initial").unwrap();

    let has_up = ris_git::branch_has_upstream(tmp.path()).unwrap();
    assert!(!has_up, "no upstream expected before first push");
}

#[test]
fn branch_has_upstream_true_after_push_with_set_upstream() {
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");
    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    ris_git::add_remote(&workdir, "origin", &bare_path.to_string_lossy()).unwrap();

    // Before push: no upstream
    assert!(!ris_git::branch_has_upstream(&workdir).unwrap());

    ris_git::push_current_branch(&workdir, "origin").unwrap();

    // After push -u: upstream should be set
    assert!(
        ris_git::branch_has_upstream(&workdir).unwrap(),
        "upstream should be set after push -u"
    );
}

// ── SSH alias remote regression ───────────────────────────────────────────────

#[test]
fn push_args_ssh_alias_remote_uses_name_not_url() {
    // Core regression: when origin is configured as an SSH alias like
    // ssh-alias:owner/repo.git, the push command must target the remote NAME
    // "origin", not a constructed URL.
    let args = ris_git::push_args("origin", "main", false);

    // Must be "push -u origin main" — no URL substitution
    assert_eq!(args[0], "push");
    assert_eq!(args[1], "-u");
    assert_eq!(
        args[2], "origin",
        "push target must be the remote name, not a URL"
    );
    assert_eq!(args[3], "main");

    for arg in &args {
        assert!(
            !arg.contains("github.com"),
            "push args must not contain a constructed github.com URL: {arg}"
        );
        assert!(
            !arg.contains("git@"),
            "push args must not contain git@ syntax: {arg}"
        );
    }
}

#[test]
fn push_args_no_upstream_sets_tracking_flag() {
    // First push to a branch with no upstream must include -u.
    let args = ris_git::push_args("origin", "feature-branch", false);
    assert!(
        args.contains(&"-u".to_string()),
        "first push must include -u to set tracking branch: {args:?}"
    );
}

#[test]
fn push_args_existing_upstream_omits_tracking_flag() {
    // Subsequent push when upstream is already configured must not include -u.
    let args = ris_git::push_args("origin", "main", true);
    assert!(
        !args.contains(&"-u".to_string()),
        "push with upstream must not include -u: {args:?}"
    );
    assert_eq!(args, vec!["push", "origin", "main"]);
}

#[test]
fn push_second_time_omits_set_upstream_flag() {
    // Integration: first push sets upstream (-u), second push must not use -u.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");
    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    ris_git::add_remote(&workdir, "origin", &bare_path.to_string_lossy()).unwrap();

    // First push: branch_has_upstream is false → push_args uses -u
    ris_git::push_current_branch(&workdir, "origin").unwrap();
    assert!(
        ris_git::branch_has_upstream(&workdir).unwrap(),
        "upstream should be configured after first push"
    );

    // Second push: branch_has_upstream is true → push_args omits -u → still works
    std::fs::write(workdir.join("extra.yaml"), "extra").unwrap();
    ris_git::commit_all(&workdir, "Extra commit").unwrap();
    let result = ris_git::push_current_branch(&workdir, "origin");
    assert!(result.is_ok(), "second push must succeed: {result:?}");
}

#[test]
fn push_returns_error_on_detached_head() {
    // Detached HEAD must produce a clear error, not an empty push.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");
    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    ris_git::add_remote(&workdir, "origin", &bare_path.to_string_lossy()).unwrap();
    ris_git::push_current_branch(&workdir, "origin").unwrap();

    // Detach HEAD by checking out the commit hash directly
    let log_out = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&workdir)
        .output()
        .unwrap();
    let hash = String::from_utf8_lossy(&log_out.stdout).trim().to_string();
    let detach_out = Command::new("git")
        .args(["checkout", &hash])
        .current_dir(&workdir)
        .output()
        .unwrap();
    assert!(
        detach_out.status.success(),
        "git checkout (detach) failed: {}",
        String::from_utf8_lossy(&detach_out.stderr)
    );

    let result = ris_git::push_current_branch(&workdir, "origin");
    assert!(
        result.is_err(),
        "push in detached HEAD state must return an error"
    );
    let err_msg = result.unwrap_err().to_string();
    assert!(
        err_msg.contains("detached") || err_msg.contains("branch"),
        "error should mention detached HEAD or branch: {err_msg}"
    );
}

#[test]
fn push_invalid_remote_name_returns_error() {
    // validate_remote_name must reject names that look like URLs.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    ris_git::init_repository(tmp.path()).unwrap();
    configure_identity(tmp.path());
    std::fs::write(tmp.path().join("a.yaml"), "a").unwrap();
    ris_git::commit_all(tmp.path(), "Initial").unwrap();

    // Passing a URL as remote name must be rejected by validate_remote_name.
    let result = ris_git::push_current_branch(tmp.path(), "git@github.com:owner/repo.git");
    assert!(
        matches!(result, Err(ris_git::GitError::InvalidInput(_))),
        "URL passed as remote name must return InvalidInput: {result:?}"
    );
}

#[test]
fn askpass_mode_push_uses_same_remote_name_command() {
    // Askpass mode must use the same push_args path (remote name, conditional -u),
    // not a different code path that constructs a URL.
    if !git_available() {
        return;
    }
    let tmp = tempfile::TempDir::new().unwrap();
    let bare_path = init_bare(tmp.path(), "remote.git");
    let workdir = tmp.path().join("work");
    std::fs::create_dir_all(&workdir).unwrap();
    setup_working_repo_with_commit(&workdir);
    let remote_url = format!("file://{}", bare_path.display());
    ris_git::add_remote(&workdir, "origin", &remote_url).unwrap();

    // First push in Askpass mode: must include -u (no upstream yet).
    assert!(!ris_git::branch_has_upstream(&workdir).unwrap());
    let result = ris_git::push_current_branch_with_env(
        &workdir,
        "origin",
        &[],
        ris_git::GitSecurityMode::Askpass {
            ssh_command: "ssh".to_string(),
        },
    );
    assert!(
        result.is_ok(),
        "askpass-mode first push must succeed: {result:?}"
    );
    assert!(
        ris_git::branch_has_upstream(&workdir).unwrap(),
        "upstream should be set after askpass-mode first push"
    );

    // Second push in Askpass mode: upstream now exists, -u is omitted.
    std::fs::write(workdir.join("extra.yaml"), "extra").unwrap();
    ris_git::commit_all(&workdir, "Extra commit").unwrap();
    let result2 = ris_git::push_current_branch_with_env(
        &workdir,
        "origin",
        &[],
        ris_git::GitSecurityMode::Askpass {
            ssh_command: "ssh".to_string(),
        },
    );
    assert!(
        result2.is_ok(),
        "askpass-mode second push must succeed: {result2:?}"
    );
}

// ── SSH alias classification (integration-test perspective) ───────────────────

#[test]
fn ssh_alias_remote_url_is_classified_as_ssh() {
    // An SSH alias like ssh-alias:owner/repo.git must be classified as SSH so
    // that askpass is enabled.  The push target remains the remote NAME "origin".
    assert!(
        ris_git::is_ssh_url("ssh-alias:owner/repo.git"),
        "scp-like SSH alias must be classified as SSH"
    );
    assert!(
        ris_git::is_ssh_url("my-work-host:projects/repo.git"),
        "custom hostname alias must be classified as SSH"
    );
    assert!(
        ris_git::is_ssh_url("user@custom-host:path/repo.git"),
        "user@alias scp syntax must be classified as SSH"
    );
}

#[test]
fn non_ssh_remote_urls_are_not_classified_as_ssh() {
    assert!(!ris_git::is_ssh_url("https://github.com/owner/repo.git"));
    assert!(!ris_git::is_ssh_url("http://example.com/repo.git"));
    assert!(!ris_git::is_ssh_url("/home/user/repo.git"));
    assert!(!ris_git::is_ssh_url("C:\\repos\\myrepo"));
    assert!(!ris_git::is_ssh_url("C:/repos/myrepo"));
    assert!(!ris_git::is_ssh_url("../sibling/repo.git"));
}
