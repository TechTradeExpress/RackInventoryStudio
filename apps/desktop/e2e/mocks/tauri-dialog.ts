// Mock for @tauri-apps/plugin-dialog used in Playwright E2E tests.
// The Browse / Choose CSV file buttons would normally open a native dialog;
// here we return deterministic values so tests don't stall waiting for UI.

import { FIXTURE_REPO_PATH } from "./tauri-core";

export function open(options?: {
  directory?: boolean;
  multiple?: boolean;
  title?: string;
  filters?: unknown[];
}): Promise<string | string[] | null> {
  if (options?.directory) {
    return Promise.resolve(FIXTURE_REPO_PATH);
  }
  // CSV file dialog — return null (cancelled) so tests use textarea instead
  return Promise.resolve(null);
}

export function save(_options?: {
  title?: string;
  defaultPath?: string;
  filters?: unknown[];
}): Promise<string | null> {
  // Save dialog — return null (cancelled) in E2E; no file is written during automated tests
  return Promise.resolve(null);
}
