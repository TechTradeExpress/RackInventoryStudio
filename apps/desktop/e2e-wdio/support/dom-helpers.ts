/**
 * DOM helper functions shared by WDIO specs and support modules.
 *
 * These functions are designed to run in browser context (via browser.execute())
 * and are exported so they can be unit-tested in a jsdom environment.
 *
 * Because browser.execute() serialises functions with .toString(), any function
 * here must be self-contained — no closure captures, no module imports, and no
 * calls to other functions in this module (a call to isDomElementVisible from
 * inside isSelectorVisible would resolve to `undefined` in the browser context,
 * since only the passed function's own source is sent across).
 */

/**
 * Returns true if el exists, has a bounding rect with both dimensions > 0,
 * and is not hidden via CSS display or visibility.
 *
 * This is the canonical visibility definition. An element with only one
 * zero dimension (e.g. width > 0 but height === 0) is not visible — the
 * check below uses `<= 0 ||`, not `=== 0 &&`, on purpose.
 */
export function isDomElementVisible(el: Element | null): boolean {
  if (!el) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el as HTMLElement);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Selector-based counterpart of isDomElementVisible, safe to pass directly
 * as the function argument to browser.execute(isSelectorVisible, selector) —
 * it is the single canonical implementation used by every WDIO helper and
 * spec that needs a visibility check, instead of each call site hand-copying
 * the same rect/display/visibility logic.
 *
 * Semantics are identical to isDomElementVisible (kept as a separate,
 * self-contained function body only because browser.execute() cannot resolve
 * a call from here to isDomElementVisible() in the browser context).
 */
export function isSelectorVisible(selector: string): boolean {
  const el = document.querySelector(selector);
  if (!el) return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el as HTMLElement);
  return style.display !== "none" && style.visibility !== "hidden";
}
