import { describe, expect, it } from "vitest";
import { computePreviewPath, hasWizardErrors, validateWizardForm } from "./wizardHelpers";

const base = {
  parentPath: "/some/path",
  code: "my-repo",
  name: "My Repository",
};

describe("validateWizardForm", () => {
  it("returns no errors for valid input", () => {
    expect(validateWizardForm(base)).toEqual({});
  });

  it("requires parentPath", () => {
    expect(validateWizardForm({ ...base, parentPath: "   " }).parentPath).toBeDefined();
  });

  it("requires code", () => {
    expect(validateWizardForm({ ...base, code: "" }).code).toBeDefined();
  });

  it("rejects blank code", () => {
    expect(validateWizardForm({ ...base, code: "   " }).code).toBeDefined();
  });

  it("rejects code with uppercase letters", () => {
    expect(validateWizardForm({ ...base, code: "MyRepo" }).code).toBeDefined();
  });

  it("rejects code with spaces", () => {
    expect(validateWizardForm({ ...base, code: "my repo" }).code).toBeDefined();
  });

  it("rejects code starting with a hyphen", () => {
    expect(validateWizardForm({ ...base, code: "-bad" }).code).toBeDefined();
  });

  it("rejects code starting with a dot", () => {
    expect(validateWizardForm({ ...base, code: ".bad" }).code).toBeDefined();
  });

  it("accepts code with dots, hyphens, underscores after first char", () => {
    expect(validateWizardForm({ ...base, code: "my.repo-1_test" }).code).toBeUndefined();
  });

  it("accepts single-char code", () => {
    expect(validateWizardForm({ ...base, code: "a" }).code).toBeUndefined();
  });

  it("requires name", () => {
    expect(validateWizardForm({ ...base, name: "   " }).name).toBeDefined();
  });

  it("returns no errors when all required fields are provided", () => {
    expect(validateWizardForm({ parentPath: "/a", code: "a", name: "A" })).toEqual({});
  });
});

describe("hasWizardErrors", () => {
  it("returns false for empty errors object", () => {
    expect(hasWizardErrors({})).toBe(false);
  });

  it("returns true when code error is present", () => {
    expect(hasWizardErrors({ code: "invalid" })).toBe(true);
  });

  it("returns true when parentPath error is present", () => {
    expect(hasWizardErrors({ parentPath: "required" })).toBe(true);
  });

  it("returns true when name error is present", () => {
    expect(hasWizardErrors({ name: "required" })).toBe(true);
  });
});

describe("computePreviewPath", () => {
  it("joins parent and code with forward slash on unix paths", () => {
    expect(computePreviewPath("/home/user/repos", "my-datacenter")).toBe(
      "/home/user/repos/my-datacenter",
    );
  });

  it("joins parent and code with backslash on Windows paths", () => {
    expect(computePreviewPath("D:\\RIS", "test-lab")).toBe("D:\\RIS\\test-lab");
  });

  it("returns empty string when parent is blank", () => {
    expect(computePreviewPath("   ", "my-repo")).toBe("");
  });

  it("returns empty string when code is blank", () => {
    expect(computePreviewPath("/some/path", "   ")).toBe("");
  });

  it("returns empty string when both are blank", () => {
    expect(computePreviewPath("", "")).toBe("");
  });

  it("name does not appear in the preview path", () => {
    const preview = computePreviewPath("/a", "my-code");
    expect(preview).not.toContain("My Name");
    expect(preview).toBe("/a/my-code");
  });
});
