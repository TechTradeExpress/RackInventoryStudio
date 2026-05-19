import type { ValidationIssueDto, ValidationSummaryDto } from "../../api/tauriClient";

export function computeValidationSummary(issues: ValidationIssueDto[]): ValidationSummaryDto {
  return {
    errors: issues.filter((i) => i.level === "error").length,
    warnings: issues.filter((i) => i.level === "warning").length,
    infos: issues.filter((i) => i.level === "info").length,
    total: issues.length,
  };
}

export function isNothingToCommitError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("nothing to commit") ||
    lower.includes("nothing added to commit")
  );
}
