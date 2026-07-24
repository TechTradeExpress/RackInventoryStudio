/**
 * DOM helper functions shared by WDIO specs and support modules.
 *
 * These functions are designed to run in browser context (via browser.execute())
 * and are exported so they can be unit-tested in a jsdom environment.
 *
 * Because browser.execute() serialises functions with .toString(), any function
 * here must be self-contained — no closure captures, no module imports.
 */

/**
 * Returns true if el exists, has a non-zero bounding rect,
 * and is not hidden via CSS display or visibility.
 *
 * This is the canonical visibility definition used by WDIO helpers.
 * Where the function cannot be referenced directly (inside browser.execute()
 * closures that also need a querySelector), inline the equivalent logic and
 * add a comment citing isDomElementVisible semantics.
 */
export function isDomElementVisible(el: Element | null): boolean {
  if (!el) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el as HTMLElement);
  return style.display !== "none" && style.visibility !== "hidden";
}
