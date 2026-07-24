// @vitest-environment jsdom
/**
 * Unit tests for DOM helper functions (isDomElementVisible).
 *
 * jsdom environment is required because the helpers use window.getComputedStyle
 * and getBoundingClientRect, which are DOM APIs not available in Node.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDomElementVisible } from "./dom-helpers";

function makeRect(w: number, h: number): DOMRect {
  return {
    width: w,
    height: h,
    top: 0,
    left: 0,
    right: w,
    bottom: h,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeEl(opts?: {
  rect?: { width: number; height: number };
  display?: string;
  visibility?: string;
}): HTMLElement {
  const el = document.createElement("div");
  const r = opts?.rect ?? { width: 100, height: 40 };
  el.getBoundingClientRect = () => makeRect(r.width, r.height);
  if (opts?.display !== undefined) el.style.display = opts.display;
  if (opts?.visibility !== undefined) el.style.visibility = opts.visibility;
  document.body.appendChild(el);
  return el;
}

describe("isDomElementVisible", () => {
  const created: HTMLElement[] = [];

  beforeEach(() => {
    created.length = 0;
  });

  afterEach(() => {
    for (const el of created) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  });

  function tracked(opts?: Parameters<typeof makeEl>[0]): HTMLElement {
    const el = makeEl(opts);
    created.push(el);
    return el;
  }

  it("returns false for null", () => {
    expect(isDomElementVisible(null)).toBe(false);
  });

  it("returns false when bounding rect is zero", () => {
    const el = tracked({ rect: { width: 0, height: 0 } });
    expect(isDomElementVisible(el)).toBe(false);
  });

  it("returns false when display is none", () => {
    const el = tracked({ display: "none" });
    expect(isDomElementVisible(el)).toBe(false);
  });

  it("returns false when visibility is hidden", () => {
    const el = tracked({ visibility: "hidden" });
    expect(isDomElementVisible(el)).toBe(false);
  });

  it("returns true for a normally visible element", () => {
    const el = tracked();
    expect(isDomElementVisible(el)).toBe(true);
  });
});
