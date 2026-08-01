import type { ReactNode } from "react";

interface PanelProps {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  testId?: string;
}

export function Panel({ title, desc, actions, children, flush, testId }: PanelProps) {
  const hasHeader = title || desc || actions;
  return (
    <div className="panel">
      {hasHeader && (
        <div className="panel-hd">
          <div>
            {title && <h2 className="phd-title" data-testid={testId}>{title}</h2>}
            {desc  && <span className="phd-desc">{desc}</span>}
          </div>
          {actions && <div className="phd-actions">{actions}</div>}
        </div>
      )}
      <div className={`panel-bd${flush ? " flush" : ""}`}>{children}</div>
    </div>
  );
}
