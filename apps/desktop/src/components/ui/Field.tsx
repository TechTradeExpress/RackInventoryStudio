import type { ReactNode } from "react";
import { IcAlertCircle } from "./Icon";

export interface FieldProps {
  label?: string;
  required?: boolean;
  help?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({ label, required, help, error, className, children }: FieldProps) {
  return (
    <div className={`field${error ? " invalid" : ""}${className ? ` ${className}` : ""}`}>
      {label && (
        <label>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <div className="help err">
          <IcAlertCircle size={11} />
          {" "}{error}
        </div>
      ) : (
        help && <div className="help">{help}</div>
      )}
    </div>
  );
}
