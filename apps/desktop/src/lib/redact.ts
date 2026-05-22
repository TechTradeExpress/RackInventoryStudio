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
 * Safely stringify an unknown error value, truncated and redacted.
 */
export function sanitizeErrorForLog(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : err === undefined ? "unknown error" : String(err);
  const trimmed = msg.length > MAX_LENGTH ? msg.slice(0, MAX_LENGTH) + "…" : msg;
  if (SENSITIVE_PATTERN.test(trimmed)) return "[error message redacted: possible credential]";
  return trimmed;
}
