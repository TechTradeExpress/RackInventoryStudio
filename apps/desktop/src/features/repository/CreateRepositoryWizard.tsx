import { type CSSProperties, type FormEvent, useState } from "react";
import { common } from "../../lib/styles";
import {
  createRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
} from "../../api/tauriClient";
import { hasWizardErrors, validateWizardForm } from "./wizardHelpers";
import { useBusy } from "../../lib/appBusy";

interface Props {
  onSuccess: (result: OpenRepositoryResultDto) => void;
}

export function CreateRepositoryWizard({ onSuccess }: Props) {
  const { isBusy, runBusy } = useBusy();

  const [path, setPath] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validationErrors = validateWizardForm({ path, code, name });
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
    setError(null);
    try {
      const result = await runBusy("Creating repository…", () =>
        createRepository({ path: path.trim(), code: code.trim(), name: name.trim() }),
      );
      onSuccess(result);
    } catch (e) {
      setError(String(e));
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
            disabled={isBusy}
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
          disabled={isBusy}
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
          disabled={isBusy}
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
  gitNote: {
    fontSize: "0.82rem",
    color: "#444",
    marginBottom: "0.75rem",
  } as CSSProperties,
  gitNoteHint: {
    color: "#888",
  } as CSSProperties,
};
