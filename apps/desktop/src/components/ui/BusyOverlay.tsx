import { useEffect, useState } from "react";
import { useBusy } from "../../lib/appBusy";

const SHOW_DELAY_MS = 150;

export function BusyOverlay() {
  const { isBusy, label } = useBusy();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isBusy) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [isBusy]);

  if (!isBusy) return null;

  return (
    <div
      className={`busy-overlay${visible ? " busy-overlay-visible" : ""}`}
      aria-busy="true"
      role="status"
      aria-label={label || "Working…"}
    >
      <div className="busy-overlay-body">
        <div className="busy-spinner" aria-hidden="true" />
        <span className="busy-label">{label || "Working…"}</span>
      </div>
    </div>
  );
}
