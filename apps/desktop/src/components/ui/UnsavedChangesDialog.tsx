import type { ReactNode } from "react";
import { Modal } from "./Modal";

export interface UnsavedChangesDialogProps {
  open: boolean;
  title?: ReactNode;
  body?: ReactNode;
  /** While true, buttons are disabled and "Save and continue" shows "Saving…". */
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  open,
  title = "Unsaved changes",
  body,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={saving ? undefined : onCancel}
      disableBackdropClose={saving}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn" onClick={onDiscard} disabled={saving}>
            Continue without saving
          </button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
