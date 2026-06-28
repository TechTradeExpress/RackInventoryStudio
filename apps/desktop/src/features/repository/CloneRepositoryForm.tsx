import { type FormEvent, useState } from "react";
import { useBusy } from "../../lib/appBusy";
import {
  cloneRepository,
  selectRepositoryFolder,
  type OpenRepositoryResultDto,
} from "../../api/tauriClient";
import { computeClonePath, dirNameFromUrl, validateCloneDirName } from "./cloneHelpers";
import { IcFolder } from "../../components/ui/Icon";

interface Props {
  onSuccess: (result: OpenRepositoryResultDto) => void;
}

export function CloneRepositoryForm({ onSuccess }: Props) {
  const { isBusy, runBusy } = useBusy();

  const [url, setUrl] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [dirName, setDirName] = useState("");
  const [dirNameTouched, setDirNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive dir name from URL when the user hasn't manually edited it.
  function handleUrlChange(newUrl: string) {
    setUrl(newUrl);
    if (!dirNameTouched) {
      setDirName(dirNameFromUrl(newUrl));
    }
  }

  function handleDirNameChange(v: string) {
    setDirName(v);
    setDirNameTouched(true);
  }

  async function handleBrowse() {
    try {
      const selected = await selectRepositoryFolder();
      if (selected !== null) setParentPath(selected);
    } catch (e) {
      setError(String(e));
    }
  }

  const urlError = url.trim() ? null : "Git URL is required.";
  const parentError = parentPath.trim() ? null : "Parent directory is required.";
  const dirError = validateCloneDirName(dirName);
  const destination = computeClonePath(parentPath, dirName);
  const canSubmit = !urlError && !parentError && !dirError && !isBusy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const result = await runBusy("Cloning repository…", () =>
        cloneRepository(url.trim(), destination),
      );
      onSuccess(result);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="clone-form">
      <div className="field">
        <label className="fld-label">Git URL</label>
        <input
          type="text"
          className="input ri-mono"
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          disabled={isBusy}
          data-testid="clone-url"
          autoComplete="off"
          spellCheck={false}
        />
        {url.trim() === "" && urlError && (
          <div className="fld-error" data-testid="clone-url-error">{urlError}</div>
        )}
      </div>

      <div className="field">
        <label className="fld-label">Parent directory</label>
        <div className="input-group">
          <input
            type="text"
            className="input ri-mono"
            value={parentPath}
            onChange={(e) => setParentPath(e.target.value)}
            placeholder="Choose a parent directory…"
            disabled={isBusy}
            data-testid="clone-parent"
          />
          <button
            type="button"
            className="btn"
            onClick={handleBrowse}
            disabled={isBusy}
            data-testid="clone-browse"
          >
            <IcFolder size={12} /> Browse…
          </button>
        </div>
        {parentPath.trim() === "" && parentError && (
          <div className="fld-error" data-testid="clone-parent-error">{parentError}</div>
        )}
      </div>

      <div className="field">
        <label className="fld-label">Directory name</label>
        <input
          type="text"
          className="input ri-mono"
          value={dirName}
          onChange={(e) => handleDirNameChange(e.target.value)}
          placeholder="Derived from URL automatically"
          disabled={isBusy}
          data-testid="clone-dirname"
        />
        {dirError && (
          <div className="fld-error" data-testid="clone-dirname-error">{dirError}</div>
        )}
      </div>

      {destination && (
        <div className="fld-help" style={{ marginBottom: 8 }} data-testid="clone-preview">
          Clone to: <span className="mono">{destination}</span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!canSubmit}
        data-testid="clone-submit"
      >
        Clone repository
      </button>

      {error && (
        <div className="banner banner-err" style={{ marginTop: 8 }} data-testid="clone-error">
          {error}
        </div>
      )}
    </form>
  );
}
