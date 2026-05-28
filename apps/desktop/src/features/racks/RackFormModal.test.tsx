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
  height_u: 24,
  row: "A",
  description: "Main rack",
  tags: ["production"],
  front_placement_count: 3,
  rear_placement_count: 1,
  placement_count: 4,
  front_used_u: 6,
  rear_used_u: 2,
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
  it("shows Add rack title", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect(screen.getByText("Add rack")).toBeTruthy();
  });

  it("pre-fills height with 42 in add mode", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("42");
  });

  it("name field is empty in add mode", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
  });

  it("add modal is not dirty when only the default height is set", () => {
    const onClose = vi.fn();
    render(<RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows required footer message for name when empty (height pre-filled)", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    const msg = screen.getByText(/Required:/).textContent ?? "";
    expect(msg).toContain("name");
    expect(msg).not.toContain("height");
  });

  it("Create rack button is disabled when name is empty", () => {
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

  it("row field is labelled 'Row / aisle'", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect(screen.getByText("Row / aisle")).toBeTruthy();
  });

  it("height field shows help text about 42U", () => {
    render(<RackFormModal open editing={null} {...BASE_PROPS} />);
    expect(screen.getByText(/Standard full-height racks are often 42U/i)).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls addRack with default height 42 when user does not change it", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Test Rack" },
    });

    fireEvent.click(screen.getByText("Create rack"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          location_id: "loc-1",
          name: "Test Rack",
          height_u: 42,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("does not include code in addRack call", async () => {
    const onClose = vi.fn();
    render(
      <RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Test Rack" } });
    fireEvent.click(screen.getByText("Create rack"));

    await waitFor(() => {
      const call = mockAdd.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
    });
  });

  it("calls addRack with overridden height when user changes it", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal open editing={null} {...BASE_PROPS} onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Test Rack" } });
    fireEvent.change(screen.getByTestId("field-height-u"), { target: { value: "12" } });

    fireEvent.click(screen.getByText("Create rack"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ height_u: 12 }),
      );
    });
  });
});

describe("RackFormModal — edit mode", () => {
  it("shows Edit rack title and pre-populated fields", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    expect(screen.getByText("Edit rack")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack A01");
  });

  it("edit mode preserves existing height (24) and does not replace with 42", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("24");
  });

  it("shows location as read-only in edit mode with help text", () => {
    render(<RackFormModal open editing={FIXTURE_RACK} {...BASE_PROPS} />);
    const field = screen.getByTestId("field-location") as HTMLInputElement;
    expect(field.value).toBe("warsaw-a — Warsaw A");
    expect(field.disabled).toBe(true);
    expect(screen.getByText(/Location is fixed/i)).toBeTruthy();
  });

  it("calls updateRack without code on save", async () => {
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
          name: "Renamed Rack",
          height_u: 24,
        }),
      );
      const call = mockUpdate.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("row payload maps to the row field (persisted field name unchanged)", async () => {
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
        expect.objectContaining({ row: "A" }),
      );
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
      height_u: 48,
    };
    rerender(<RackFormModal open editing={other} {...BASE_PROPS} />);
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack B01");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("48");
  });
});
