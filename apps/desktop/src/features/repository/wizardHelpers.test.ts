import { describe, expect, it } from "vitest";
import { hasWizardErrors, validateWizardForm } from "./wizardHelpers";

const base = {
  path: "/some/path",
  code: "my-repo",
  name: "My Repository",
};

describe("validateWizardForm", () => {
  it("returns no errors for valid input", () => {
    expect(validateWizardForm(base)).toEqual({});
  });

  it("requires path", () => {
    expect(validateWizardForm({ ...base, path: "   " }).path).toBeDefined();
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
    expect(validateWizardForm({ path: "/a", code: "a", name: "A" })).toEqual({});
  });
});

describe("hasWizardErrors", () => {
  it("returns false for empty errors object", () => {
    expect(hasWizardErrors({})).toBe(false);
  });

  it("returns true when code error is present", () => {
    expect(hasWizardErrors({ code: "invalid" })).toBe(true);
  });

  it("returns true when path error is present", () => {
    expect(hasWizardErrors({ path: "required" })).toBe(true);
  });

  it("returns true when name error is present", () => {
    expect(hasWizardErrors({ name: "required" })).toBe(true);
  });
});
