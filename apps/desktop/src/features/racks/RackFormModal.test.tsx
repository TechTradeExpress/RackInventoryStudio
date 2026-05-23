import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RackFormModal } from "./RackFormModal";
import type { RackSummaryDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  addRack: vi.fn(),
  updateRack: vi.fn(),
}));

import { addRack, updateRack } from "../../api/tauriClient";

const mockAdd = vi.mocked(addRack);
const mockUpdate = vi.mocked(updateRack);

const FIXTURE_RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "warsaw-a",
  height_u: 42,
  row: "A",
  description: "Main rack",
  tags: ["production"],
  front_placement_count: 3,
  rear_placement_count: 1,
  placement_count: 4,
};

const BASE_PROPS = {
  locationId: "loc-1",
  locationLabel: "warsaw-a — Warsaw A",
  onClose: vi.fn(),
  onSaved: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockAdd.mockResolvedValue("new-rack-id");
  mockUpdate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RackFormModal — closed", () => {
  it("does not render when open=false", () => {
    render(<RackFormModal open={false} editing={null} {...BASE_PROPS} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("RackFormModal — add mode", () => {
  it("shows Add rack title and empty fields", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect(screen.getByText("Add rack")).toBeTruthy();
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("");
  });

  it("shows required footer message when fields are empty", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect(screen.getByText(/Required:/)).toBeTruthy();
    expect(screen.getByText(/Required:/).textContent).not.toContain("location");
  });

  it("Create rack button is disabled when required fields are empty", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    const btn = screen.getByText("Create rack") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows location as read-only with context label", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    const field = screen.getByTestId("field-location") as HTMLInputElement;
    expect(field.value).toBe("warsaw-a — Warsaw A");
    expect(field.readOnly).toBe(true);
    expect(field.disabled).toBe(true);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows code format error for invalid code", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "INVALID CODE!" },
    });
    expect(screen.getByText(/lowercase letters/i)).toBeTruthy();
  });

  it("calls addRack with locationId prop, onSaved, onClose on valid submit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "rack-test" },
    });
    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Test Rack" },
    });
    fireEvent.change(screen.getByTestId("field-height-u"), {
      target: { value: "42" },
    });

    fireEvent.click(screen.getByText("Create rack"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          location_id: "loc-1",
          code: "rack-test",
          name: "Test Rack",
          height_u: 42,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

describe("RackFormModal — edit mode", () => {
  it("shows Edit rack title and pre-populated fields", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    expect(screen.getByText("Edit rack")).toBeTruthy();
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("rack-a01");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack A01");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("42");
  });

  it("disables code field in edit mode", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-code") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows location as read-only in edit mode with help text", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    const field = screen.getByTestId("field-location") as HTMLInputElement;
    expect(field.value).toBe("warsaw-a — Warsaw A");
    expect(field.disabled).toBe(true);
    expect(screen.getByText(/Location is fixed/i)).toBeTruthy();
  });

  it("calls updateRack with locationId prop, onSaved, onClose on valid edit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Renamed Rack" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "rack-1",
          location_id: "loc-1",
          code: "rack-a01",
          name: "Renamed Rack",
          height_u: 42,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("resets form when reopened with a different rack", () => {
    const { rerender } = render(
      <RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />,
    );
    const other: RackSummaryDto = {
      ...FIXTURE_RACK,
      id: "rack-2",
      code: "rack-b01",
      name: "Rack B01",
      height_u: 24,
    };
    rerender(<RackFormModal open editing={other} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("rack-b01");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack B01");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("24");
  });
});
