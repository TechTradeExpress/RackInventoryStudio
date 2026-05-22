import { info, warn, error } from "@tauri-apps/plugin-log";

// Calls the Tauri log plugin function and silently drops any failure.
// When running outside Tauri (tests, plain browser) the function throws
// or returns a rejected promise — both are caught here so callers never fail.
function fire(fn: (msg: string) => Promise<void>, msg: string): void {
  try {
    fn(msg).catch(() => {});
  } catch {
    // not in Tauri runtime
  }
}

export function logInfo(msg: string): void {
  fire(info, msg);
}

export function logWarn(msg: string): void {
  fire(warn, msg);
}

export function logError(msg: string): void {
  fire(error, msg);
}
