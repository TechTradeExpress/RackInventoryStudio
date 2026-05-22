import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(() => cleanup());

describe("ConfirmDialog", () => {
  it("does not render when open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders title and body when open=true", () => {
    render(
      <ConfirmDialog
        open
        title="Delete item?"
        body="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete item?")).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Sure?" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Sure?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Sure?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses custom confirm/cancel labels", () => {
    render(
      <ConfirmDialog
        open
        title="T"
        confirmLabel="Yes, delete"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Yes, delete")).toBeTruthy();
    expect(screen.getByText("Keep it")).toBeTruthy();
  });

  it("applies danger class when tone=danger", () => {
    render(
      <ConfirmDialog
        open
        title="Destroy?"
        tone="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("modal").className).toContain("danger");
  });
});
