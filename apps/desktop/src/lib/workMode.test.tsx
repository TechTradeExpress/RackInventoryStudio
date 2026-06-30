// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { WorkModeProvider, useWorkMode, WORK_MODE_DEFAULT_STATUS } from "./workMode";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("useWorkMode — default and switching", () => {
  it("defaults to 'planning' when localStorage is empty", () => {
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    expect(result.current.mode).toBe("planning");
  });

  it("switching to 'on-site' updates the mode", () => {
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    act(() => { result.current.setMode("on-site"); });
    expect(result.current.mode).toBe("on-site");
  });

  it("switching back to 'planning' updates the mode", () => {
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    act(() => { result.current.setMode("on-site"); });
    act(() => { result.current.setMode("planning"); });
    expect(result.current.mode).toBe("planning");
  });
});

describe("useWorkMode — localStorage persistence", () => {
  it("persists mode to localStorage on change", () => {
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    act(() => { result.current.setMode("on-site"); });
    expect(localStorage.getItem("ris.workMode")).toBe("on-site");
  });

  it("reads persisted 'on-site' mode from localStorage on mount", () => {
    localStorage.setItem("ris.workMode", "on-site");
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    expect(result.current.mode).toBe("on-site");
  });

  it("reads persisted 'planning' mode from localStorage on mount", () => {
    localStorage.setItem("ris.workMode", "planning");
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    expect(result.current.mode).toBe("planning");
  });

  it("falls back to 'planning' for an unknown localStorage value", () => {
    localStorage.setItem("ris.workMode", "unknown-value");
    const { result } = renderHook(() => useWorkMode(), { wrapper: WorkModeProvider });
    expect(result.current.mode).toBe("planning");
  });
});

describe("useWorkMode — fallback outside provider", () => {
  it("returns 'planning' mode when no WorkModeProvider is present", () => {
    const { result } = renderHook(() => useWorkMode());
    expect(result.current.mode).toBe("planning");
  });

  it("setMode is a no-op when no WorkModeProvider is present", () => {
    const { result } = renderHook(() => useWorkMode());
    expect(() => act(() => { result.current.setMode("on-site"); })).not.toThrow();
    expect(result.current.mode).toBe("planning");
  });
});

describe("WORK_MODE_DEFAULT_STATUS", () => {
  it("maps 'planning' to 'planned'", () => {
    expect(WORK_MODE_DEFAULT_STATUS["planning"]).toBe("planned");
  });

  it("maps 'on-site' to 'installed'", () => {
    expect(WORK_MODE_DEFAULT_STATUS["on-site"]).toBe("installed");
  });
});
