// Mock for @tauri-apps/plugin-log used in Playwright e2e tests.
// All log calls are silently dropped — no Tauri runtime is required.
export const info = async (_msg: string): Promise<void> => {};
export const warn = async (_msg: string): Promise<void> => {};
export const error = async (_msg: string): Promise<void> => {};
export const debug = async (_msg: string): Promise<void> => {};
export const trace = async (_msg: string): Promise<void> => {};
export const attachLogger = async (_handler: unknown): Promise<() => void> =>
  () => {};
