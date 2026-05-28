import { useState, useEffect, useRef } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { respondSshPassphrase } from "../../api/tauriClient";

export interface SshPassphraseModalProps {
  open: boolean;
  /** The prompt string from OpenSSH (sanitized by the backend). */
  prompt: string;
  /** Called after the passphrase has been submitted or the modal cancelled. */
  onDismiss: () => void;
}

export function SshPassphraseModal({ open, prompt, onDismiss }: SshPassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens.
  useEffect(() => {
    if (open) {
      setPassphrase("");
      setError(null);
      setPending(false);
      // Defer focus so the portal is mounted.
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await respondSshPassphrase(passphrase);
    } catch (e) {
      setError(String(e));
      setPending(false);
      return;
    }
    setPassphrase("");
    onDismiss();
  }

  async function cancel() {
    if (pending) return;
    setPending(true);
    try {
      await respondSshPassphrase(null);
    } catch {
      // Ignore — session may already be gone.
    }
    setPassphrase("");
    onDismiss();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
  }

  return (
    <Modal
      open={open}
      title="SSH key passphrase required"
      onClose={cancel}
      disableBackdropClose
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary" onClick={cancel} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Sending…" : "Continue"}
          </button>
        </>
      }
      footerMessage={error ?? undefined}
      footerMessageTone={error ? "err" : undefined}
    >
      <p style={{ marginBottom: 12 }}>
        OpenSSH is requesting a passphrase. This will be used once and not stored.
      </p>
      {prompt && (
        <p
          style={{
            marginBottom: 12,
            fontFamily: "monospace",
            fontSize: "0.85em",
            color: "var(--fg-muted, #888)",
            wordBreak: "break-all",
          }}
        >
          {prompt}
        </p>
      )}
      <Field label="Passphrase">
        <input
          ref={inputRef}
          type="password"
          className="input"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={pending}
          autoComplete="off"
          data-testid="ssh-passphrase-input"
        />
      </Field>
      <p
        style={{
          marginTop: 14,
          fontSize: "0.82em",
          color: "var(--fg-muted, #888)",
        }}
      >
        To avoid this prompt in the future, add the key to ssh-agent with{" "}
        <code>ssh-add</code>.
      </p>
    </Modal>
  );
}
