// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

afterEach(() => cleanup());

describe("UnsavedChangesDialog", () => {
  it("does not render when open=false", () => {
    render(
      <UnsavedChangesDialog
        open={false}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders default title and all three buttons when open=true", () => {
    render(
      <UnsavedChangesDialog
        open
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByText("Save and continue")).toBeTruthy();
    expect(screen.getByText("Continue without saving")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("renders custom title and body", () => {
    render(
      <UnsavedChangesDialog
        open
        title="Custom title"
        body="Custom body text"
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Custom title")).toBeTruthy();
    expect(screen.getByText("Custom body text")).toBeTruthy();
  });

  it("calls onSave when 'Save and continue' is clicked", () => {
    const onSave = vi.fn();
    render(
      <UnsavedChangesDialog open onSave={onSave} onDiscard={vi.fn()} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Save and continue"));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("calls onDiscard when 'Continue without saving' is clicked", () => {
    const onDiscard = vi.fn();
    render(
      <UnsavedChangesDialog open onSave={vi.fn()} onDiscard={onDiscard} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Continue without saving"));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("calls onCancel when 'Cancel' is clicked", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog open onSave={vi.fn()} onDiscard={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog open onSave={vi.fn()} onDiscard={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables all buttons and shows 'Saving…' when saving=true", () => {
    render(
      <UnsavedChangesDialog
        open
        saving
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Saving…")).toBeTruthy();
    expect(screen.queryByText("Save and continue")).toBeNull();

    const buttons = screen.getAllByRole("button").filter((b) => b.className.includes("btn") && !b.className.includes("btn-ghost"));
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("does not call onCancel when Escape is pressed while saving", () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesDialog
        open
        saving
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onCancel={onCancel}
      />,
    );
    // Modal removes close handler when saving (onClose=undefined), so Escape does nothing.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("'Save and continue' button carries data-testid='unsaved-changes-save'", () => {
    render(
      <UnsavedChangesDialog open onSave={vi.fn()} onDiscard={vi.fn()} onCancel={vi.fn()} />,
    );
    const btn = screen.getByTestId("unsaved-changes-save");
    expect(btn.textContent?.trim()).toBe("Save and continue");
  });
});
