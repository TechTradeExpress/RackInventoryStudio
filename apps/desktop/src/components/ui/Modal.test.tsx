// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal } from "./Modal";

beforeEach(() => {
  // createPortal targets document.body; ensure it exists in jsdom
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
});

describe("Modal", () => {
  it("does not render when open=false", () => {
    render(<Modal open={false} title="Hidden" onClose={vi.fn()} />);
    expect(screen.queryByTestId("modal")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders title, body and footer when open=true", () => {
    render(
      <Modal
        open
        title="Test title"
        footer={<button>Save</button>}
        onClose={vi.fn()}
      >
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Test title")).toBeTruthy();
    expect(screen.getByText("Body content")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();
  });

  it("renders subtitle when provided", () => {
    render(<Modal open title="T" subtitle="Helpful hint" onClose={vi.fn()} />);
    expect(screen.getByText("Helpful hint")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when dialog surface is clicked", () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByTestId("modal"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on backdrop click when disableBackdropClose=true", () => {
    const onClose = vi.fn();
    render(<Modal open title="T" onClose={onClose} disableBackdropClose />);
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders danger border class when danger=true", () => {
    render(<Modal open title="T" onClose={vi.fn()} danger />);
    expect(screen.getByTestId("modal").className).toContain("danger");
  });

  it("applies custom width via style", () => {
    render(<Modal open title="T" onClose={vi.fn()} width={800} />);
    const dialog = screen.getByTestId("modal") as HTMLElement;
    expect(dialog.style.width).toBe("800px");
  });
});
