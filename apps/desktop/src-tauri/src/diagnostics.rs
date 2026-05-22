/// Returns just the basename of a path to avoid logging full user paths.
pub fn basename(path: &std::path::Path) -> &str {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("<path>")
}

/// Truncates a string to `max` chars, appending "…" if cut.
pub fn truncate(s: &str, max: usize) -> std::borrow::Cow<'_, str> {
    if s.len() <= max {
        std::borrow::Cow::Borrowed(s)
    } else {
        std::borrow::Cow::Owned(format!("{}…", &s[..max]))
    }
}

/// Checks if a string looks like it might contain credentials.
fn has_sensitive_pattern(s: &str) -> bool {
    let lower = s.to_lowercase();
    lower.contains("token")
        || lower.contains("password")
        || lower.contains("secret")
        || lower.contains("private_key")
        || lower.contains("api_key")
}

/// Sanitizes an error string: truncates and redacts if it looks like a credential.
pub fn sanitize_error(err: &str) -> std::borrow::Cow<'_, str> {
    let t = truncate(err, 300);
    if has_sensitive_pattern(&t) {
        std::borrow::Cow::Owned("[error message redacted: possible credential]".to_string())
    } else {
        t
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn basename_returns_last_segment() {
        assert_eq!(basename(Path::new("/home/user/repos/my-repo")), "my-repo");
        // On Windows, Path natively parses backslash separators so
        // "C:\repos\my-repo" returns "my-repo". That is not testable on Linux.
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
        // 300 bytes + 3-byte UTF-8 ellipsis
        assert_eq!(result.len(), 303);
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
    fn sanitize_error_passes_safe_message() {
        let result = sanitize_error("YAML parse error at line 5");
        assert_eq!(result, "YAML parse error at line 5");
    }
}
