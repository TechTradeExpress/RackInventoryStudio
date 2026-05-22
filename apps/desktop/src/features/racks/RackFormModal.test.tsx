import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RackFormModal } from "./RackFormModal";
import type { LocationDto, RackSummaryDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  addRack: vi.fn(),
  updateRack: vi.fn(),
}));

import { addRack, updateRack } from "../../api/tauriClient";

const mockAdd = vi.mocked(addRack);
const mockUpdate = vi.mocked(updateRack);

const LOCATIONS: LocationDto[] = [
  {
    id: "loc-1",
    code: "warsaw-a",
    name: "Warsaw A",
    description: null,
    address: null,
    tags: [],
    rack_count: 2,
  },
  {
    id: "loc-2",
    code: "berlin-b",
    name: "Berlin B",
    description: null,
    address: null,
    tags: [],
    rack_count: 0,
  },
];

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
    render(
      <RackFormModal
        open={false}
        editing={null}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("RackFormModal — add mode", () => {
  it("shows Add rack title and empty fields", () => {
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Add rack")).toBeTruthy();
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("");
  });

  it("shows required footer message when fields are empty", () => {
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Required:/)).toBeTruthy();
  });

  it("Create rack button is disabled when required fields are empty", () => {
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const btn = screen.getByText("Create rack") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
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
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows code format error for invalid code", () => {
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "INVALID CODE!" },
    });
    expect(screen.getByText(/lowercase letters/i)).toBeTruthy();
  });

  it("calls addRack, onSaved, onClose on valid submit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal
        open
        editing={null}
        locations={LOCATIONS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-location"), {
      target: { value: "loc-1" },
    });
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
    render(
      <RackFormModal
        open
        editing={FIXTURE_RACK}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Edit rack")).toBeTruthy();
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("rack-a01");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack A01");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("42");
  });

  it("disables code field in edit mode", () => {
    render(
      <RackFormModal
        open
        editing={FIXTURE_RACK}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-code") as HTMLInputElement).disabled).toBe(true);
  });

  it("calls updateRack, onSaved, onClose on valid edit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RackFormModal
        open
        editing={FIXTURE_RACK}
        locations={LOCATIONS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Renamed Rack" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "rack-1",
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
      <RackFormModal
        open
        editing={FIXTURE_RACK}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const other: RackSummaryDto = {
      ...FIXTURE_RACK,
      id: "rack-2",
      code: "rack-b01",
      name: "Rack B01",
      height_u: 24,
    };
    rerender(
      <RackFormModal
        open
        editing={other}
        locations={LOCATIONS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("rack-b01");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Rack B01");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("24");
  });
});
