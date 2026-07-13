import { type CSSProperties, type FormEvent, useState } from "react";
import { common } from "../../lib/styles";
import {
  createRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
} from "../../api/tauriClient";
import { computePreviewPath, hasWizardErrors, validateWizardForm } from "./wizardHelpers";
import { useBusy } from "../../lib/appBusy";

interface Props {
  onSuccess: (result: OpenRepositoryResultDto) => void;
}

export function CreateRepositoryWizard({ onSuccess }: Props) {
  const { isBusy, runBusy } = useBusy();

  const [parentPath, setParentPath] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validationErrors = validateWizardForm({ parentPath, code, name });
  const formHasErrors = hasWizardErrors(validationErrors);
  const previewPath = computePreviewPath(parentPath, code);

  async function handleBrowse() {
    try {
      const selected = await selectRepositoryFolder();
      if (selected !== null) setParentPath(selected);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (formHasErrors) return;
    setError(null);
    try {
      const result = await runBusy("Creating repository…", () =>
        createRepository({ parent_path: parentPath.trim(), code: code.trim(), name: name.trim() }),
      );
      onSuccess(result);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={styles.field}>
        <label style={styles.label}>Parent directory</label>
        <div style={common.row}>
          <input
            style={common.input}
            value={parentPath}
            onChange={(e) => setParentPath(e.target.value)}
            placeholder="Path to parent directory…"
            disabled={isBusy}
            data-testid="repository-create-parent-input"
          />
          <button
            type="button"
            style={common.btn}
            onClick={handleBrowse}
            disabled={isBusy}
          >
            Browse…
          </button>
        </div>
        {validationErrors.parentPath && (
          <div style={styles.fieldError}>{validationErrors.parentPath}</div>
        )}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Code</label>
        <input
          style={common.input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. my-datacenter"
          disabled={isBusy}
          data-testid="repository-create-code-input"
        />
        <div style={styles.fieldHint}>
          Lowercase letters, digits, hyphens, dots, underscores. No spaces.
        </div>
        {validationErrors.code && (
          <div style={styles.fieldError}>{validationErrors.code}</div>
        )}
      </div>

      {previewPath && (
        <div style={styles.previewPath}>
          Repository will be created at: <span style={styles.previewPathValue}>{previewPath}</span>
        </div>
      )}

      <div style={styles.field}>
        <label style={styles.label}>Name</label>
        <input
          style={common.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Datacenter"
          disabled={isBusy}
          data-testid="repository-create-name-input"
        />
        {validationErrors.name && (
          <div style={styles.fieldError}>{validationErrors.name}</div>
        )}
      </div>

      <div style={styles.gitNote}>
        Git repository will be initialized automatically.
        <span style={styles.gitNoteHint}>
          {" "}Git is required for change history and Safe Publish.
        </span>
      </div>

      <button
        type="submit"
        style={common.btn}
        disabled={isBusy || formHasErrors}
        data-testid="repository-create-submit"
      >
        Create repository
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
  previewPath: {
    fontSize: "0.82rem",
    color: "#555",
    marginBottom: "0.65rem",
  } as CSSProperties,
  previewPathValue: {
    fontFamily: "monospace",
    color: "#333",
  } as CSSProperties,
  gitNote: {
    fontSize: "0.82rem",
    color: "#444",
    marginBottom: "0.75rem",
  } as CSSProperties,
  gitNoteHint: {
    color: "#888",
  } as CSSProperties,
};
