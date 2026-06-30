import type { ReactNode } from "react";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  testId?: string;
}

export interface SegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel?: string;
  testId?: string;
}

export function Segmented<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  testId,
}: SegmentedProps<T>) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel} data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`seg-btn${value === o.value ? " on" : ""}`}
          onClick={() => onChange(o.value)}
          data-testid={o.testId}
        >
          {o.icon}
          <span>{o.label}</span>
          {o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
