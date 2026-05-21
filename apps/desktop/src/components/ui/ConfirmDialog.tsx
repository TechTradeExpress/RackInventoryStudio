import type { ReactNode } from "react";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" renders red border and a danger-styled confirm button. */
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      danger={tone === "danger"}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
