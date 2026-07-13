import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  testId?: string;
}

export function PageHeader({ title, subtitle, actions, testId }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 data-testid={testId}>{title}</h1>
        {subtitle && <div className="ph-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}
