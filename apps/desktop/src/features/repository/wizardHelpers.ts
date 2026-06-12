export interface WizardFormState {
  parentPath: string;
  code: string;
  name: string;
}

export interface WizardFormErrors {
  parentPath?: string;
  code?: string;
  name?: string;
}

const CODE_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function validateWizardForm(state: WizardFormState): WizardFormErrors {
  const errors: WizardFormErrors = {};
  if (!state.parentPath.trim()) {
    errors.parentPath = "Parent directory is required.";
  }
  if (!state.code.trim()) {
    errors.code = "Code is required.";
  } else if (!CODE_RE.test(state.code.trim())) {
    errors.code =
      "Code must start with a lowercase letter or digit and contain only lowercase letters, digits, hyphens, dots, or underscores.";
  }
  if (!state.name.trim()) {
    errors.name = "Name is required.";
  }
  return errors;
}

export function hasWizardErrors(errors: WizardFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function computePreviewPath(parent: string, code: string): string {
  const p = parent.trim();
  const c = code.trim();
  if (!p || !c) return "";
  const sep = p.includes("\\") ? "\\" : "/";
  return `${p}${sep}${c}`;
}
