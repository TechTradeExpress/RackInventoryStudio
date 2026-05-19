/**
 * Returns the parsed integer if the string represents a positive whole number,
 * or null for empty, whitespace-only, zero, negative, decimal, non-numeric, or
 * leading-zero strings (e.g. "01").
 */
export function parsePositiveInt(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n < 1 || String(n) !== trimmed) return null;
  return n;
}
