import { describe, it, expect, vi, afterEach } from "vitest";
import { confirmUnsavedDiscard, UNSAVED_MSG } from "./unsavedGuard";

describe("confirmUnsavedDiscard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Case 1 — no unsaved changes: proceed without confirmation
  it("returns true immediately when there are no unsaved changes", () => {
    const spy = vi.spyOn(window, "confirm");
    const result = confirmUnsavedDiscard(false, UNSAVED_MSG.open);
    expect(result).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  // Case 2 — unsaved changes + user confirms: proceed
  it("returns true when unsaved changes exist and user confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(confirmUnsavedDiscard(true, UNSAVED_MSG.open)).toBe(true);
  });

  // Case 3 — unsaved changes + user cancels: block
  it("returns false when unsaved changes exist and user cancels", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(confirmUnsavedDiscard(true, UNSAVED_MSG.open)).toBe(false);
  });

  // Case 4 — close message: same guard behaviour
  it("blocks close when user cancels confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(confirmUnsavedDiscard(true, UNSAVED_MSG.close)).toBe(false);
  });

  // Case 5 — close proceeds when confirmed
  it("allows close when user confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(confirmUnsavedDiscard(true, UNSAVED_MSG.close)).toBe(true);
  });

  it("passes the provided message to window.confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const msg = UNSAVED_MSG.create;
    confirmUnsavedDiscard(true, msg);
    expect(window.confirm).toHaveBeenCalledWith(msg);
  });

  it("does not call window.confirm when hasUnsavedChanges is false regardless of message", () => {
    const spy = vi.spyOn(window, "confirm");
    confirmUnsavedDiscard(false, UNSAVED_MSG.close);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("UNSAVED_MSG", () => {
  it("open message mentions opening another repository", () => {
    expect(UNSAVED_MSG.open).toContain("Opening another repository");
  });

  it("close message mentions closing this repository", () => {
    expect(UNSAVED_MSG.close).toContain("Closing this repository");
  });

  it("create message mentions creating a new repository", () => {
    expect(UNSAVED_MSG.create).toContain("Creating a new repository");
  });
});
