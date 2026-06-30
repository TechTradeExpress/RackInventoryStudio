import { createContext, useContext, useState, type ReactNode } from "react";

export type WorkMode = "planning" | "on-site";

const STORAGE_KEY = "ris.workMode";
const DEFAULT_MODE: WorkMode = "planning";

/** Maps work mode to the default device status for new devices. */
export const WORK_MODE_DEFAULT_STATUS: Record<WorkMode, string> = {
  "planning": "planned",
  "on-site": "installed",
};

function readStoredMode(): WorkMode {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "planning" || val === "on-site") return val;
  } catch {
    // localStorage unavailable (e.g. SSR or security restrictions)
  }
  return DEFAULT_MODE;
}

interface WorkModeCtx {
  mode: WorkMode;
  setMode: (m: WorkMode) => void;
}

const WorkModeContext = createContext<WorkModeCtx | null>(null);

export function WorkModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<WorkMode>(readStoredMode);

  function setMode(m: WorkMode) {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      // ignore — mode stays in React state
    }
  }

  return (
    <WorkModeContext.Provider value={{ mode, setMode }}>
      {children}
    </WorkModeContext.Provider>
  );
}

/**
 * Returns the current work mode and a setter.
 * Falls back to { mode: "planning", setMode: noop } when rendered outside
 * WorkModeProvider so existing tests don't need to be wrapped.
 */
export function useWorkMode(): WorkModeCtx {
  const ctx = useContext(WorkModeContext);
  if (!ctx) return { mode: DEFAULT_MODE, setMode: () => {} };
  return ctx;
}
