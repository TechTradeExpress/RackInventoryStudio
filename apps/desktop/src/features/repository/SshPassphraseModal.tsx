import { useState, useEffect, useRef } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { respondSshPassphrase } from "../../api/tauriClient";

export interface SshPassphraseModalProps {
  open: boolean;
  /** The prompt string from OpenSSH (sanitized by the backend). */
  prompt: string;
  /**
   * Session ID from the `ssh-passphrase-requested` event, as a hex string.
   * Must be sent back with the response.  Kept as string to avoid JS number
   * precision loss (random u64 values exceed Number.MAX_SAFE_INTEGER).
   */
  sessionId: string;
  /**
   * When true the backend session has already ended (timeout while modal was
   * open, or push completed).  The modal disables submit and shows a friendly
   * expiry message so the user knows to retry Push.
   */
  expired: boolean;
  /** Called after the passphrase has been submitted, the modal cancelled, or the session expired. */
  onDismiss: () => void;
}

export function SshPassphraseModal({
  open,
  prompt,
  sessionId,
  expired,
  onDismiss,
}: SshPassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens or a new session starts (new sessionId).
  // Resetting on sessionId change prevents a passphrase typed for a previous
  // session from being submitted to a replacement session.
  useEffect(() => {
    if (open) {
      console.log(`[askpass] modal active session=${sessionId}`);
      setPassphrase("");
      setError(null);
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, sessionId]);

  // Clear the passphrase when the session expires so it cannot be accidentally
  // submitted after the backend has already moved on.
  useEffect(() => {
    if (expired) {
      console.log(`[askpass] modal expired session=${sessionId}`);
      setPassphrase("");
    }
  }, [expired]);

  async function submit() {
    if (pending || expired) return;
    setPending(true);
    setError(null);
    try {
      await respondSshPassphrase(passphrase, sessionId);
    } catch (e) {
      const raw = String(e);
      // Replace raw backend error with a user-friendly message.
      setError(
        raw.includes("expired") || raw.includes("replaced") || raw.includes("active")
          ? "This SSH passphrase request expired or was replaced. Please retry Push."
          : raw,
      );
      setPending(false);
      return;
    }
    setPassphrase("");
    onDismiss();
  }

  async function cancel() {
    if (pending) return;
    if (!expired) {
      // Only send cancel to backend if the session is still active.
      setPending(true);
      try {
        await respondSshPassphrase(null, sessionId);
      } catch {
        // Ignore — session may already be gone.
      }
    }
    setPassphrase("");
    onDismiss();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
  }

  const footerMsg = expired
    ? "This SSH passphrase request expired or was replaced. Please retry Push."
    : (error ?? undefined);

  const footerTone: "err" | undefined = expired ? "err" : error ? "err" : undefined;

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
            {expired ? "Close" : "Cancel"}
          </button>
          {!expired && (
            <button className="btn btn-primary" onClick={submit} disabled={pending}>
              {pending ? "Sending…" : "Continue"}
            </button>
          )}
        </>
      }
      footerMessage={footerMsg}
      footerMessageTone={footerTone}
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
      {!expired && (
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
      )}
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
