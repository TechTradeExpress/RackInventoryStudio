import { type CSSProperties, type FormEvent, useState } from "react";
import { common } from "../../lib/styles";
import {
  createRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
} from "../../api/tauriClient";
import { hasWizardErrors, validateWizardForm } from "./wizardHelpers";

interface Props {
  onSuccess: (result: OpenRepositoryResultDto) => void;
}

export function CreateRepositoryWizard({ onSuccess }: Props) {
  const [path, setPath] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [initializeGit, setInitializeGit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationErrors = validateWizardForm({ path, code, name, initializeGit });
  const formHasErrors = hasWizardErrors(validationErrors);

  async function handleBrowse() {
    try {
      const selected = await selectRepositoryFolder();
      if (selected !== null) setPath(selected);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (formHasErrors) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createRepository({
        path: path.trim(),
        code: code.trim(),
        name: name.trim(),
        initialize_git: initializeGit,
      });
      onSuccess(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={styles.field}>
        <label style={styles.label}>Directory</label>
        <div style={common.row}>
          <input
            style={common.input}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="Path to new repository directory…"
            disabled={creating}
          />
          <button
            type="button"
            style={common.btn}
            onClick={handleBrowse}
            disabled={creating}
          >
            Browse…
          </button>
        </div>
        {validationErrors.path && (
          <div style={styles.fieldError}>{validationErrors.path}</div>
        )}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Code</label>
        <input
          style={common.input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. my-datacenter"
          disabled={creating}
        />
        <div style={styles.fieldHint}>
          Lowercase letters, digits, hyphens, dots, underscores. No spaces.
        </div>
        {validationErrors.code && (
          <div style={styles.fieldError}>{validationErrors.code}</div>
        )}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Name</label>
        <input
          style={common.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Datacenter"
          disabled={creating}
        />
        {validationErrors.name && (
          <div style={styles.fieldError}>{validationErrors.name}</div>
        )}
      </div>

      <div style={styles.checkboxRow}>
        <input
          type="checkbox"
          id="wizard-init-git"
          checked={initializeGit}
          onChange={(e) => setInitializeGit(e.target.checked)}
          disabled={creating}
        />
        <label htmlFor="wizard-init-git" style={styles.checkboxLabel}>
          Initialize Git repository
        </label>
      </div>

      <button
        type="submit"
        style={common.btn}
        disabled={creating || formHasErrors}
      >
        {creating ? "Creating…" : "Create repository"}
      </button>

      {error && (
        <div style={{ ...common.errorBox, marginTop: "0.5rem" }}>{error}</div>
      )}
    </form>
  );
}

const styles = {
  field: {
    marginBottom: "0.65rem",
  },
  label: {
    display: "block",
    fontSize: "0.82rem",
    fontWeight: 600,
    marginBottom: "0.25rem",
    color: "#444",
  } as CSSProperties,
  fieldHint: {
    fontSize: "0.78rem",
    color: "#888",
    marginTop: "0.15rem",
  } as CSSProperties,
  fieldError: {
    fontSize: "0.8rem",
    color: "#b00020",
    marginTop: "0.15rem",
  } as CSSProperties,
  checkboxRow: {
    display: "flex",
    gap: "0.45rem",
    alignItems: "center",
    marginBottom: "0.75rem",
  } as CSSProperties,
  checkboxLabel: {
    fontSize: "0.85rem",
    cursor: "pointer",
  } as CSSProperties,
};
