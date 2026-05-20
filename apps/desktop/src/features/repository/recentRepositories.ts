const STORAGE_KEY = "ris_recent_repos";
const MAX_RECENT = 5;

/**
 * Pure function: insert path at front, deduplicate, cap at max.
 * Exported for unit testing without a DOM environment.
 */
export function applyRecentAdd(
  existing: string[],
  path: string,
  max = MAX_RECENT,
): string[] {
  const trimmed = path.trim();
  if (!trimmed) return existing;
  return [trimmed, ...existing.filter((p) => p !== trimmed)].slice(0, max);
}

export function getRecentRepositories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function addRecentRepository(path: string): void {
  const next = applyRecentAdd(getRecentRepositories(), path);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function removeRecentRepository(path: string): void {
  const next = getRecentRepositories().filter((p) => p !== path);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}
