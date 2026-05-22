import type { ReactNode } from "react";
import { IcInfo, IcCheckCircle, IcAlertTriangle, IcAlertCircle, IcX } from "./Icon";

export type BannerTone = "info" | "ok" | "warn" | "err";

interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
}

const DEFAULT_ICONS: Record<BannerTone, ReactNode> = {
  info: <IcInfo size={14} />,
  ok:   <IcCheckCircle size={14} />,
  warn: <IcAlertTriangle size={14} />,
  err:  <IcAlertCircle size={14} />,
};

export function Banner({ tone = "info", title, children, actions, icon, onDismiss }: BannerProps) {
  return (
    <div className={`banner banner-${tone}`}>
      <span className="bn-icon">{icon ?? DEFAULT_ICONS[tone]}</span>
      <div className="grow">
        {title && <div className="bn-title">{title}</div>}
        {children && <div className="bn-body">{children}</div>}
      </div>
      {actions && <div className="bn-actions">{actions}</div>}
      {onDismiss && (
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onDismiss} aria-label="Dismiss">
          <IcX size={12} />
        </button>
      )}
    </div>
  );
}
