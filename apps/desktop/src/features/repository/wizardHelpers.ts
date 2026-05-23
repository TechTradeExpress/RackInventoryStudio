export interface WizardFormState {
  path: string;
  code: string;
  name: string;
}

export interface WizardFormErrors {
  path?: string;
  code?: string;
  name?: string;
}

const CODE_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function validateWizardForm(state: WizardFormState): WizardFormErrors {
  const errors: WizardFormErrors = {};
  if (!state.path.trim()) {
    errors.path = "Path is required.";
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
