import { describe, it, expect } from "vitest";
import { applyRecentAdd } from "./recentRepositories";

describe("applyRecentAdd", () => {
  it("adds a new path at the front of an empty list", () => {
    expect(applyRecentAdd([], "/repos/my-dc")).toEqual(["/repos/my-dc"]);
  });

  it("adds a new path at the front of a non-empty list", () => {
    const result = applyRecentAdd(["/repos/a", "/repos/b"], "/repos/c");
    expect(result[0]).toBe("/repos/c");
    expect(result).toHaveLength(3);
  });

  it("moves an existing path to the front (deduplication)", () => {
    const result = applyRecentAdd(["/repos/a", "/repos/b", "/repos/c"], "/repos/b");
    expect(result).toEqual(["/repos/b", "/repos/a", "/repos/c"]);
  });

  it("caps the list at max entries", () => {
    const existing = ["/a", "/b", "/c", "/d", "/e"];
    const result = applyRecentAdd(existing, "/f", 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("/f");
    expect(result).not.toContain("/e");
  });

  it("ignores an empty string", () => {
    const existing = ["/repos/a"];
    expect(applyRecentAdd(existing, "")).toEqual(existing);
  });

  it("ignores a whitespace-only string", () => {
    const existing = ["/repos/a"];
    expect(applyRecentAdd(existing, "   ")).toEqual(existing);
  });
});
