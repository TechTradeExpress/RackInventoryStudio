/**
 * Parses a comma-separated tag string into a trimmed, non-empty string array.
 */
export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
