// @vitest-environment jsdom
/**
 * Unit tests for DOM helper functions (isDomElementVisible, isSelectorVisible).
 *
 * jsdom environment is required because the helpers use window.getComputedStyle
 * and getBoundingClientRect, which are DOM APIs not available in Node.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDomElementVisible, isSelectorVisible } from "./dom-helpers";

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
  testId?: string;
}): HTMLElement {
  const el = document.createElement("div");
  const r = opts?.rect ?? { width: 100, height: 40 };
  el.getBoundingClientRect = () => makeRect(r.width, r.height);
  if (opts?.display !== undefined) el.style.display = opts.display;
  if (opts?.visibility !== undefined) el.style.visibility = opts.visibility;
  if (opts?.testId !== undefined) el.setAttribute("data-testid", opts.testId);
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

  it("returns false when width is 0 but height > 0", () => {
    const el = tracked({ rect: { width: 0, height: 40 } });
    expect(isDomElementVisible(el)).toBe(false);
  });

  it("returns false when height is 0 but width > 0", () => {
    const el = tracked({ rect: { width: 100, height: 0 } });
    expect(isDomElementVisible(el)).toBe(false);
  });

  it("returns true when both width and height are > 0", () => {
    const el = tracked({ rect: { width: 100, height: 40 } });
    expect(isDomElementVisible(el)).toBe(true);
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

describe("isSelectorVisible", () => {
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

  it("returns false when the selector matches nothing", () => {
    expect(isSelectorVisible('[data-testid="does-not-exist"]')).toBe(false);
  });

  it("returns false when width is 0 but height > 0", () => {
    tracked({ testId: "partial-zero", rect: { width: 0, height: 40 } });
    expect(isSelectorVisible('[data-testid="partial-zero"]')).toBe(false);
  });

  it("returns false when height is 0 but width > 0", () => {
    tracked({ testId: "partial-zero-h", rect: { width: 100, height: 0 } });
    expect(isSelectorVisible('[data-testid="partial-zero-h"]')).toBe(false);
  });

  it("returns true when both width and height are > 0", () => {
    tracked({ testId: "fully-visible", rect: { width: 100, height: 40 } });
    expect(isSelectorVisible('[data-testid="fully-visible"]')).toBe(true);
  });

  it("returns false when display is none", () => {
    tracked({ testId: "display-none", display: "none" });
    expect(isSelectorVisible('[data-testid="display-none"]')).toBe(false);
  });

  it("returns false when visibility is hidden", () => {
    tracked({ testId: "vis-hidden", visibility: "hidden" });
    expect(isSelectorVisible('[data-testid="vis-hidden"]')).toBe(false);
  });

  it("matches the semantics of isDomElementVisible for the same element", () => {
    const el = tracked({ testId: "parity-check", rect: { width: 50, height: 0 } });
    expect(isSelectorVisible('[data-testid="parity-check"]')).toBe(isDomElementVisible(el));
  });
});
