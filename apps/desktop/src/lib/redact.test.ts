import { describe, it, expect } from "vitest";
import { redactForLog, sanitizePathForLog, sanitizeErrorForLog } from "./redact";

describe("redactForLog", () => {
  it("redacts values containing 'token'", () => {
    expect(redactForLog("my_token_value")).toBe("[redacted]");
  });

  it("redacts values containing 'password'", () => {
    expect(redactForLog("password123")).toBe("[redacted]");
  });

  it("redacts values containing 'secret'", () => {
    expect(redactForLog("my_secret_key")).toBe("[redacted]");
  });

  it("redacts values containing 'private_key'", () => {
    expect(redactForLog("private_key_abc")).toBe("[redacted]");
  });

  it("redacts values containing 'api_key'", () => {
    expect(redactForLog("api_key_xyz")).toBe("[redacted]");
  });

  it("passes through safe short values unchanged", () => {
    expect(redactForLog("repository opened")).toBe("repository opened");
  });

  it("truncates strings longer than 300 chars", () => {
    const long = "a".repeat(400);
    const result = redactForLog(long);
    expect(result).toHaveLength(301); // 300 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("passes through empty string", () => {
    expect(redactForLog("")).toBe("");
  });
});

describe("sanitizePathForLog", () => {
  it("returns basename of a Unix path", () => {
    expect(sanitizePathForLog("/home/user/repos/my-repo")).toBe("my-repo");
  });

  it("returns basename of a Windows path", () => {
    expect(sanitizePathForLog("C:\\Users\\user\\repos\\my-repo")).toBe("my-repo");
  });

  it("returns basename of a shallow path", () => {
    expect(sanitizePathForLog("/my-repo")).toBe("my-repo");
  });

  it("returns <path> for empty string", () => {
    expect(sanitizePathForLog("")).toBe("<path>");
  });

  it("handles trailing separator", () => {
    expect(sanitizePathForLog("/home/user/repos/my-repo/")).toBe("my-repo");
  });
});

describe("sanitizeErrorForLog", () => {
  it("converts Error objects to message string", () => {
    expect(sanitizeErrorForLog(new Error("disk full"))).toBe("disk full");
  });

  it("converts string errors", () => {
    expect(sanitizeErrorForLog("YAML parse failed")).toBe("YAML parse failed");
  });

  it("handles null/undefined", () => {
    expect(sanitizeErrorForLog(null)).toBe("null");
    expect(sanitizeErrorForLog(undefined)).toBe("unknown error");
  });

  it("truncates long error messages", () => {
    const long = "x".repeat(400);
    const result = sanitizeErrorForLog(new Error(long));
    expect(result.length).toBe(301);
    expect(result.endsWith("…")).toBe(true);
  });

  it("redacts error messages containing credential patterns", () => {
    expect(sanitizeErrorForLog(new Error("invalid token provided"))).toBe(
      "[error message redacted: possible credential]",
    );
  });
});
