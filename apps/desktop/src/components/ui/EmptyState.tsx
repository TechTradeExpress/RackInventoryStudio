import type { ReactNode } from "react";
import { IcBox } from "./Icon";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ icon, title, body, actions }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="es-illus">{icon ?? <IcBox size={24} strokeWidth={1.2} />}</div>
      <div className="es-title">{title}</div>
      {body && <div className="es-body">{body}</div>}
      {actions && <div className="es-actions">{actions}</div>}
    </div>
  );
}
