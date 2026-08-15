// @vitest-environment jsdom
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

  it("does not render confirm-dialog-confirm or confirm-dialog-cancel when open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="Delete?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("confirm-dialog-confirm")).toBeNull();
    expect(screen.queryByTestId("confirm-dialog-cancel")).toBeNull();
  });

  it("renders confirm-dialog-confirm and confirm-dialog-cancel when open=true", () => {
    render(
      <ConfirmDialog
        open
        title="Delete?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-dialog-confirm")).toBeTruthy();
    expect(screen.getByTestId("confirm-dialog-cancel")).toBeTruthy();
  });

  it("testids are stable regardless of custom confirmLabel and cancelLabel", () => {
    render(
      <ConfirmDialog
        open
        title="T"
        confirmLabel="Yes, remove it"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-dialog-confirm").textContent).toBe("Yes, remove it");
    expect(screen.getByTestId("confirm-dialog-cancel").textContent).toBe("Keep it");
  });

  it("calls onConfirm when confirm-dialog-confirm is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open title="Sure?" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when confirm-dialog-cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Sure?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("confirm-dialog-confirm has btn-danger class when tone=danger", () => {
    render(
      <ConfirmDialog
        open
        title="Destroy?"
        tone="danger"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-dialog-confirm").className).toContain("btn-danger");
  });
});
