import { describe, it, expect } from "vitest";
import { parseTags } from "./tags";

describe("parseTags", () => {
  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseTags("   ")).toEqual([]);
  });

  it("parses a single tag", () => {
    expect(parseTags("production")).toEqual(["production"]);
  });

  it("parses multiple comma-separated tags", () => {
    expect(parseTags("prod,dr,warsaw")).toEqual(["prod", "dr", "warsaw"]);
  });

  it("trims whitespace around each tag", () => {
    expect(parseTags("  tag1 , tag2  ")).toEqual(["tag1", "tag2"]);
  });

  it("ignores empty segments from consecutive commas", () => {
    expect(parseTags("a,,b, ,c")).toEqual(["a", "b", "c"]);
  });
});
