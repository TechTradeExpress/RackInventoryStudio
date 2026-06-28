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
