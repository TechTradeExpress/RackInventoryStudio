// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LocationFormModal } from "./LocationFormModal";
import type { LocationDto } from "../../api/tauriClient";

// Mock the Tauri API calls
vi.mock("../../api/tauriClient", () => ({
  addLocation: vi.fn(),
  updateLocation: vi.fn(),
}));

import { addLocation, updateLocation } from "../../api/tauriClient";

const mockAdd = vi.mocked(addLocation);
const mockUpdate = vi.mocked(updateLocation);

const FIXTURE_LOC: LocationDto = {
  id: "loc-1",
  code: "warsaw-a",
  name: "Warsaw Server Room A",
  description: "Main DC",
  address: "ul. Testowa 1",
  tags: ["production"],
  rack_count: 3,
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockAdd.mockResolvedValue("new-id");
  mockUpdate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LocationFormModal — add mode", () => {
  it("does not render when open=false", () => {
    render(
      <LocationFormModal
        open={false}
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders add title and empty fields when open=true", () => {
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Add location")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
  });

  it("shows required footer message when required fields are empty", () => {
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Required:/)).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls addLocation and onSaved/onClose on valid submit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Test Location" } });
    fireEvent.click(screen.getByText("Create location"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Test Location" }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("does not include code in addLocation call", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Test Location" } });
    fireEvent.click(screen.getByText("Create location"));

    await waitFor(() => {
      const call = mockAdd.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
    });
  });

  it("disables Create button when required fields are empty", () => {
    render(
      <LocationFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const btn = screen.getByText("Create location") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("LocationFormModal — edit mode", () => {
  it("renders edit title and pre-populated fields", () => {
    render(
      <LocationFormModal
        open
        editing={FIXTURE_LOC}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Edit location")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Warsaw Server Room A",
    );
  });

  it("calls updateLocation without code on save", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <LocationFormModal
        open
        editing={FIXTURE_LOC}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Renamed Room" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "loc-1", name: "Renamed Room" }),
      );
      const call = mockUpdate.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("resets form values when reopened with different location", () => {
    const { rerender } = render(
      <LocationFormModal
        open
        editing={FIXTURE_LOC}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const other: LocationDto = { ...FIXTURE_LOC, id: "loc-2", code: "berlin-b", name: "Berlin DC" };
    rerender(
      <LocationFormModal
        open
        editing={other}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Berlin DC");
  });
});
