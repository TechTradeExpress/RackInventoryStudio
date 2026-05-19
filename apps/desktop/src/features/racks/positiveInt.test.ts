import { describe, it, expect } from "vitest";
import { parsePositiveInt } from "./positiveInt";

describe("parsePositiveInt", () => {
  it("returns null for empty string", () => {
    expect(parsePositiveInt("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parsePositiveInt("   ")).toBeNull();
  });

  it("returns the integer for a valid positive integer", () => {
    expect(parsePositiveInt("1")).toBe(1);
    expect(parsePositiveInt("42")).toBe(42);
  });

  it("accepts surrounding whitespace around a valid integer", () => {
    expect(parsePositiveInt("  5  ")).toBe(5);
    expect(parsePositiveInt("\t3\n")).toBe(3);
  });

  it("returns null for zero", () => {
    expect(parsePositiveInt("0")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parsePositiveInt("-1")).toBeNull();
    expect(parsePositiveInt("-100")).toBeNull();
  });

  it("returns null for decimal strings", () => {
    expect(parsePositiveInt("1.5")).toBeNull();
    expect(parsePositiveInt("2.0")).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt("1u")).toBeNull();
  });

  it("returns null for leading-zero strings", () => {
    expect(parsePositiveInt("01")).toBeNull();
    expect(parsePositiveInt("007")).toBeNull();
  });
});
