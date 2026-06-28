/// Returns just the basename of a path to avoid logging full user paths.
pub fn basename(path: &std::path::Path) -> &str {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("<path>")
}

/// Truncates a string to `max` chars (not bytes), appending "…" if cut.
pub fn truncate(s: &str, max: usize) -> std::borrow::Cow<'_, str> {
    if s.chars().count() <= max {
        std::borrow::Cow::Borrowed(s)
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        std::borrow::Cow::Owned(out)
    }
}

/// Checks if a string looks like it might contain credentials.
fn has_sensitive_pattern(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.contains("token")
        || lower.contains("password")
        || lower.contains("secret")
        || lower.contains("private_key")
        || lower.contains("private-key")
        || lower.contains("private key")
        || lower.contains("api_key")
        || lower.contains("api-key")
        || lower.contains("api key")
        || lower.contains("auth")
}

/// Returns the last non-empty segment of a slash- or backslash-separated token.
fn path_basename(tok: &str) -> &str {
    tok.split(['/', '\\'])
        .rfind(|s| !s.is_empty())
        .unwrap_or("?")
}

/// Replaces path-like whitespace-delimited tokens with `[path:basename]`.
/// URL tokens (http:// / https://) become `[url]`.
/// Tokens without `/` or `\` are passed through unchanged.
pub fn sanitize_paths_in_message(message: &str) -> String {
    let mut out = String::with_capacity(message.len());
    let mut first = true;
    for tok in message.split_ascii_whitespace() {
        if !first {
            out.push(' ');
        }
        first = false;
        if tok.starts_with("http://") || tok.starts_with("https://") {
            out.push_str("[url]");
        } else if tok.contains('/') || tok.contains('\\') {
            out.push_str("[path:");
            out.push_str(path_basename(tok));
            out.push(']');
        } else {
            out.push_str(tok);
        }
    }
    out
}

/// Redact HTTPS userinfo credentials from a Git URL for safe logging.
///
/// - `https://token@host/path` → `https://***@host/path`
/// - `https://user:pass@host/path` → `https://***@host/path`
/// - SSH URLs (`git@host:org/repo.git`) have no embedded secrets and are returned unchanged.
pub fn redact_git_url(url: &str) -> String {
    if let Some(rest) = url.strip_prefix("https://") {
        if let Some(at_pos) = rest.find('@') {
            let after_at = &rest[at_pos + 1..];
            return format!("https://***@{after_at}");
        }
    }
    url.to_string()
}

/// Sanitizes an error string for logging:
/// 1. Redacts the whole string if it matches a credential pattern.
/// 2. Replaces path-like tokens with `[path:basename]`.
/// 3. Truncates to 300 chars (UTF-8 safe).
pub fn sanitize_error(err: &str) -> std::borrow::Cow<'_, str> {
    if has_sensitive_pattern(err) {
        return std::borrow::Cow::Owned(
            "[error message redacted: possible credential]".to_string(),
        );
    }
    let sanitized = sanitize_paths_in_message(err);
    let truncated = truncate(&sanitized, 300);
    std::borrow::Cow::Owned(truncated.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn basename_returns_last_segment() {
        assert_eq!(basename(Path::new("/home/user/repos/my-repo")), "my-repo");
        #[cfg(windows)]
        assert_eq!(basename(Path::new("C:\\repos\\my-repo")), "my-repo");
    }

    #[test]
    fn basename_fallback_on_empty() {
        assert_eq!(basename(Path::new("")), "<path>");
    }

    #[test]
    fn truncate_short_string_unchanged() {
        assert_eq!(truncate("hello", 300), "hello");
    }

    #[test]
    fn truncate_long_string_appends_ellipsis() {
        let long = "x".repeat(400);
        let result = truncate(&long, 300);
        assert!(result.ends_with('…'));
        // 300 'x' chars + '…' = 301 chars
        assert_eq!(result.chars().count(), 301);
    }

    #[test]
    fn truncate_utf8_multibyte_does_not_panic() {
        // Polish 'ą' is 2 bytes in UTF-8; 400 repetitions exceed 300-char limit.
        let long: String = std::iter::repeat('ą').take(400).collect();
        let result = truncate(&long, 300);
        assert!(result.ends_with('…'));
        assert_eq!(result.chars().count(), 301);
    }

    #[test]
    fn sanitize_error_redacts_token() {
        let result = sanitize_error("invalid token provided");
        assert_eq!(result, "[error message redacted: possible credential]");
    }

    #[test]
    fn sanitize_error_redacts_password() {
        let result = sanitize_error("bad password");
        assert_eq!(result, "[error message redacted: possible credential]");
    }

    #[test]
    fn sanitize_error_redacts_auth() {
        let result = sanitize_error("authentication failed");
        assert_eq!(result, "[error message redacted: possible credential]");
    }

    #[test]
    fn sanitize_error_redacts_private_key_variants() {
        assert_eq!(
            sanitize_error("private key not found"),
            "[error message redacted: possible credential]"
        );
        assert_eq!(
            sanitize_error("invalid private-key format"),
            "[error message redacted: possible credential]"
        );
        assert_eq!(
            sanitize_error("private_key missing"),
            "[error message redacted: possible credential]"
        );
    }

    #[test]
    fn sanitize_error_redacts_api_key_variants() {
        assert_eq!(
            sanitize_error("api key invalid"),
            "[error message redacted: possible credential]"
        );
        assert_eq!(
            sanitize_error("bad api-key"),
            "[error message redacted: possible credential]"
        );
        assert_eq!(
            sanitize_error("api_key not set"),
            "[error message redacted: possible credential]"
        );
    }

    #[test]
    fn sanitize_error_redacts_unix_path() {
        let result = sanitize_error("failed to read /home/user/repos/my-repo/repository.yaml");
        assert_eq!(result, "failed to read [path:repository.yaml]");
    }

    #[test]
    fn sanitize_error_redacts_windows_path() {
        let result = sanitize_error("failed C:\\Users\\me\\repo\\devices.yaml");
        assert_eq!(result, "failed [path:devices.yaml]");
    }

    #[test]
    fn sanitize_error_preserves_safe_message() {
        let result = sanitize_error("YAML parse error at line 5");
        assert_eq!(result, "YAML parse error at line 5");
    }

    #[test]
    fn redact_git_url_hides_plain_token() {
        let result = redact_git_url("https://ghp_secret123@github.com/org/repo.git");
        assert_eq!(result, "https://***@github.com/org/repo.git");
    }

    #[test]
    fn redact_git_url_hides_user_pass() {
        let result = redact_git_url("https://alice:hunter2@github.com/org/repo.git");
        assert_eq!(result, "https://***@github.com/org/repo.git");
    }

    #[test]
    fn redact_git_url_leaves_ssh_url_unchanged() {
        let url = "git@github.com:org/repo.git";
        assert_eq!(redact_git_url(url), url);
    }

    #[test]
    fn redact_git_url_leaves_ssh_alias_unchanged() {
        let url = "github-ris-test:org/repo.git";
        assert_eq!(redact_git_url(url), url);
    }

    #[test]
    fn redact_git_url_leaves_plain_https_unchanged() {
        let url = "https://github.com/org/repo.git";
        assert_eq!(redact_git_url(url), url);
    }
}
