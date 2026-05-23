export const UNSAVED_MSG = {
  open: "You have unsaved inventory changes. Opening another repository will discard them. Continue?",
  close: "You have unsaved inventory changes. Closing this repository will discard them. Continue?",
  create:
    "You have unsaved inventory changes. Creating a new repository will close the current one and discard unsaved changes. Continue?",
} as const;

export function confirmUnsavedDiscard(hasUnsavedChanges: boolean, message: string): boolean {
  if (!hasUnsavedChanges) return true;
  return window.confirm(message);
}
