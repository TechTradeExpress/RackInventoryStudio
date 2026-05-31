import { describe, it, expect } from "vitest";
import { redactForLog, sanitizePathForLog, sanitizeErrorForLog, redactUrlCredentials } from "./redact";

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

  it("redacts unix paths in error messages", () => {
    expect(
      sanitizeErrorForLog("failed to read /home/user/repos/my-repo/repository.yaml"),
    ).toBe("failed to read [path:repository.yaml]");
  });

  it("redacts windows paths in error messages", () => {
    expect(sanitizeErrorForLog("failed C:\\Users\\me\\repo\\devices.yaml")).toBe(
      "failed [path:devices.yaml]",
    );
  });

  it("redacts url tokens in error messages", () => {
    expect(sanitizeErrorForLog("request failed https://example.com/repo")).toBe(
      "request failed [url]",
    );
  });

  it("preserves safe messages without paths", () => {
    expect(sanitizeErrorForLog("YAML parse failed at line 5")).toBe("YAML parse failed at line 5");
  });

  it("credential redaction takes precedence over path redaction", () => {
    expect(
      sanitizeErrorForLog("failed with auth token at C:\\Users\\me\\repo"),
    ).toBe("[error message redacted: possible credential]");
  });
});

describe("redactUrlCredentials", () => {
  it("redacts user:password in https URL", () => {
    const msg = "fatal: Authentication failed for 'https://user:s3cr3t@github.com/org/repo.git/'";
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain("s3cr3t");
    expect(out).not.toContain("user:");
    expect(out).toContain("github.com");
    expect(out).toContain("[redacted]@");
  });

  it("redacts token used as userinfo in https URL", () => {
    const msg = "https://ghp_SECRETTOKEN@github.com/org/repo.git";
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain("SECRETTOKEN");
    expect(out).toContain("github.com");
    expect(out).toContain("[redacted]@");
  });

  it("preserves https URL without credentials", () => {
    const msg = "error fetching https://github.com/org/repo.git";
    expect(redactUrlCredentials(msg)).toBe(msg);
  });

  it("preserves safe message without URLs", () => {
    const msg = "error: src refspec main does not match any";
    expect(redactUrlCredentials(msg)).toBe(msg);
  });

  it("redacts multiple credential-bearing URLs in one message", () => {
    const msg = "https://a:x@host1.com/r and https://b:y@host2.com/r";
    const out = redactUrlCredentials(msg);
    expect(out).not.toContain(":x@");
    expect(out).not.toContain(":y@");
    expect(out).toContain("host1.com");
    expect(out).toContain("host2.com");
  });
});
