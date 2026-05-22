import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IcX } from "./Icon";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<ModalSize, number> = {
  sm: 460,
  md: 560,
  lg: 640,
  xl: 720,
};

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  footerMessage?: ReactNode;
  footerMessageTone?: "err" | "warn" | "ok";
  size?: ModalSize;
  /** Override pixel width directly; takes priority over size. */
  width?: number;
  /** Red top-border treatment for destructive dialogs. */
  danger?: boolean;
  /** Remove body padding (e.g. for table-body modals). */
  flush?: boolean;
  /** Prevent backdrop click from closing (e.g. when form is dirty). */
  disableBackdropClose?: boolean;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  footerMessage,
  footerMessageTone,
  size,
  width,
  danger,
  flush,
  disableBackdropClose,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const resolvedWidth = width ?? SIZE_PX[size ?? "md"];

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !disableBackdropClose) onClose?.();
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={handleBackdrop} data-testid="modal-backdrop">
      <div
        ref={dialogRef}
        className={`modal${danger ? " danger" : ""}`}
        style={{ width: resolvedWidth }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        data-testid="modal"
      >
        <div className="modal-hd">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          {onClose && (
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
              <IcX />
            </button>
          )}
        </div>
        <div className={`modal-bd${flush ? " flush" : ""}`}>{children}</div>
        {(footer || footerMessage) && (
          <div className="modal-ft">
            {footerMessage && (
              <span className={`ft-msg${footerMessageTone ? ` ${footerMessageTone}` : ""}`}>
                {footerMessage}
              </span>
            )}
            <span className="grow" />
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
