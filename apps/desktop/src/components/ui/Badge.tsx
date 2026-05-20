import type { ReactNode } from "react";

export type BadgeTone = "info" | "ok" | "warn" | "err" | "muted";

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Badge({ tone = "muted", dot, icon, children }: BadgeProps) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="bd" />}
      {icon}
      {children}
    </span>
  );
}
