export type SortDir = "asc" | "desc";

export function toggleDir(d: SortDir): SortDir {
  return d === "asc" ? "desc" : "asc";
}

/**
 * Returns true when every token in the query is found (case-insensitive) in at
 * least one of the supplied fields. Returns true when the query is blank.
 */
export function matchesSearch(q: string, ...fields: (string | null | undefined)[]): boolean {
  const trimmed = q.trim();
  if (!trimmed) return true;
  const needle = trimmed.toLowerCase();
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

export function cmpStr(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  const av = (a ?? "").toLowerCase();
  const bv = (b ?? "").toLowerCase();
  const c = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === "asc" ? c : -c;
}

export function cmpNum(a: number, b: number, dir: SortDir): number {
  return dir === "asc" ? a - b : b - a;
}
