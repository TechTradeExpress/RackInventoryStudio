const SENSITIVE_PATTERN = /token|password|secret|private.?key|api.?key|auth/i;
const MAX_LENGTH = 300;

/**
 * Redact a string value that might contain credentials or sensitive data.
 * Returns "[redacted]" if the value matches a sensitive pattern.
 * Truncates long values.
 */
export function redactForLog(value: string): string {
  if (SENSITIVE_PATTERN.test(value)) return "[redacted]";
  return value.length > MAX_LENGTH ? value.slice(0, MAX_LENGTH) + "…" : value;
}

/**
 * Return only the basename of a path so full user paths are not logged.
 */
export function sanitizePathForLog(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "<path>";
}

/**
 * Replaces whitespace-delimited path-like tokens with [path:basename].
 * URL tokens (http:// / https://) become [url].
 * Tokens without / or \ are left unchanged.
 * Mirrors the behaviour of sanitize_paths_in_message() in Rust diagnostics.rs.
 */
function sanitizePathsInMessage(message: string): string {
  const tokens = message.split(/\s+/);
  const result: string[] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    if (tok.startsWith("http://") || tok.startsWith("https://")) {
      result.push("[url]");
    } else if (tok.includes("/") || tok.includes("\\")) {
      const normalized = tok.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "?";
      result.push(`[path:${base}]`);
    } else {
      result.push(tok);
    }
  }
  return result.join(" ");
}

/**
 * Redact inline HTTPS credentials from a user-facing error message.
 * `https://user:pass@host` → `https://[redacted]@host`
 * Does not nuke the whole message — preserves error context.
 */
export function redactUrlCredentials(msg: string): string {
  return msg.replace(
    /https:\/\/([^@\s'")\/>]+)@/g,
    "https://[redacted]@"
  );
}

/**
 * Safely stringify an unknown error value, redacted and truncated.
 * Order: credential check → path redaction → truncation.
 */
export function sanitizeErrorForLog(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : err === undefined ? "unknown error" : String(err);
  if (SENSITIVE_PATTERN.test(msg)) return "[error message redacted: possible credential]";
  const sanitized = sanitizePathsInMessage(msg);
  return sanitized.length > MAX_LENGTH ? sanitized.slice(0, MAX_LENGTH) + "…" : sanitized;
}
