import { describe, it, expect } from "vitest";
import { computeValidationSummary, isNothingToCommitError } from "./publishHelpers";
import type { ValidationIssueDto } from "../../api/tauriClient";

function makeIssue(level: "error" | "warning" | "info"): ValidationIssueDto {
  return {
    code: `VAL-TEST`,
    level,
    message: "test",
    object_type: null,
    object_id: null,
    object_code: null,
    file_path: null,
    rack_id: null,
  };
}

describe("computeValidationSummary", () => {
  it("returns zeros for empty list", () => {
    expect(computeValidationSummary([])).toEqual({
      errors: 0,
      warnings: 0,
      infos: 0,
      total: 0,
    });
  });

  it("counts errors correctly", () => {
    const issues = [makeIssue("error"), makeIssue("error"), makeIssue("warning")];
    const result = computeValidationSummary(issues);
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(1);
    expect(result.infos).toBe(0);
    expect(result.total).toBe(3);
  });

  it("counts only infos", () => {
    const issues = [makeIssue("info"), makeIssue("info")];
    const result = computeValidationSummary(issues);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.infos).toBe(2);
    expect(result.total).toBe(2);
  });

  it("counts mixed levels", () => {
    const issues = [
      makeIssue("error"),
      makeIssue("warning"),
      makeIssue("warning"),
      makeIssue("info"),
    ];
    const result = computeValidationSummary(issues);
    expect(result).toEqual({ errors: 1, warnings: 2, infos: 1, total: 4 });
  });
});

describe("isNothingToCommitError", () => {
  it("detects 'nothing to commit'", () => {
    expect(isNothingToCommitError("nothing to commit, working tree clean")).toBe(true);
  });

  it("detects 'nothing added to commit'", () => {
    expect(isNothingToCommitError("nothing added to commit but untracked files present")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isNothingToCommitError("NOTHING TO COMMIT")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isNothingToCommitError("fatal: not a git repository")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isNothingToCommitError("")).toBe(false);
  });
});
