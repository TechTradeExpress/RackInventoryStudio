/**
 * Validate a Git clone URL for unsafe transports.
 *
 * Mirrors the backend `validate_remote_url` logic in `ris-git` as
 * defense-in-depth. Backend validation remains authoritative.
 *
 * Accepted:
 * - `https://…`
 * - `ssh://…`
 * - SCP-like SSH: `[user@]host:path`
 *
 * Rejected:
 * - blank
 * - `ext::…`, `fd::…`, or any `::` transport helper
 * - `file://…` or any other `://` scheme
 */
export function validateCloneUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Git URL is required.";
  if (trimmed.includes("::"))
    return "Unsupported Git URL. Use HTTPS or SSH clone URLs.";
  if (trimmed.startsWith("https://") || trimmed.startsWith("ssh://"))
    return null;
  if (trimmed.includes("://"))
    return "Unsupported Git URL. Use HTTPS or SSH clone URLs.";
  // SCP-like SSH: must contain a colon (e.g. git@github.com:org/repo.git)
  if (trimmed.includes(":")) return null;
  return "Unsupported Git URL. Use HTTPS or SSH clone URLs.";
}

/**
 * Derive a directory name from a Git URL.
 *
 * Strips a trailing `.git` suffix, then returns the last segment after `/` or `:`.
 * Works for:
 * - `https://github.com/org/repo.git` → `"repo"`
 * - `git@github.com:org/repo.git` → `"repo"`
 * - `github-alias:org/repo.git` → `"repo"`
 */
export function dirNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  const withoutGit = trimmed.endsWith(".git") ? trimmed.slice(0, -4) : trimmed;
  const parts = withoutGit.split(/[/:]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Validate the directory name for a clone destination.
 * Returns an error string, or null if valid.
 */
export function validateCloneDirName(name: string): string | null {
  if (!name.trim()) return "Directory name is required.";
  if (name.includes("/") || name.includes("\\"))
    return "Directory name must not contain path separators.";
  if (/[<>:"|?*]/.test(name))
    return "Directory name contains a character not allowed in folder names.";
  return null;
}

/**
 * Compute the full clone destination path from parent directory + directory name.
 * Mirrors `computePreviewPath` in wizardHelpers.
 */
export function computeClonePath(parent: string, dirName: string): string {
  const p = parent.trim().replace(/[\\/]+$/, "");
  const d = dirName.trim();
  if (!p || !d) return "";
  const sep = p.includes("\\") ? "\\" : "/";
  return `${p}${sep}${d}`;
}
