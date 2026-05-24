import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlacePlacementModal } from "./PlacePlacementModal";
import type { DeviceDto, DeviceModelDto, RackSummaryDto } from "../../api/tauriClient";

// Mock busy context — runBusy just calls the fn directly
vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

vi.mock("../../api/tauriClient", () => ({
  placeDevice: vi.fn(),
  placeRackObject: vi.fn(),
}));

import { placeDevice, placeRackObject } from "../../api/tauriClient";
const mockPlaceDevice = vi.mocked(placeDevice);
const mockPlaceRackObject = vi.mocked(placeRackObject);

const FIXTURE_RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "datacenter-a",
  height_u: 42,
  row: "A",
  description: null,
  tags: [],
  front_placement_count: 0,
  rear_placement_count: 0,
  placement_count: 0,
};

const DEVICE_1: DeviceDto = {
  id: "dev-1",
  code: "srv-01",
  device_type: "server",
  name: "Server 01",
  serial_number: "SRV001",
  asset_tag: null,
  external_ref: null,
  status: "installed",
  device_model_code: "srv-model",
  device_model_id: "model-1",
  is_placed: false,
  description: null,
  tags: [],
};

const RACK_OBJ_1: DeviceModelDto = {
  id: "model-2",
  code: "blank-1u",
  device_type: "rack_object",
  name: "Blank 1U",
  vendor: null,
  model_number: null,
  default_height_u: 1,
  description: null,
  tags: [],
};

const BASE_PROPS = {
  open: true,
  rack: FIXTURE_RACK,
  side: "front" as const,
  startU: 5,
  availableDevices: [DEVICE_1],
  availableRackObjects: [RACK_OBJ_1],
  onClose: vi.fn(),
  onPlaced: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockPlaceDevice.mockResolvedValue("new-placement-id");
  mockPlaceRackObject.mockResolvedValue("new-rack-obj-placement-id");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlacePlacementModal — closed", () => {
  it("does not render when open=false", () => {
    render(<PlacePlacementModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PlacePlacementModal — open", () => {
  it("renders with rack/side/startU context in subtitle", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    expect(screen.getByText("Place equipment")).toBeTruthy();
    expect(screen.getByText(/rack-a01/)).toBeTruthy();
    expect(screen.getByText(/Front/)).toBeTruthy();
  });

  it("pre-fills start U from prop", () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={10} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("10");
  });

  it("start U is empty when startU prop is null", () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={null} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("Place button is disabled when no device is selected", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Place button is enabled after selecting a device", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("calls placeDevice with correct payload on valid submit", async () => {
    const onPlaced = vi.fn();
    const onClose = vi.fn();
    render(
      <PlacePlacementModal {...BASE_PROPS} onPlaced={onPlaced} onClose={onClose} />,
    );

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(mockPlaceDevice).toHaveBeenCalledWith({
        rack_id: "rack-1",
        device_id: "dev-1",
        side: "front",
        start_u: 5,
        height_u: null,
      });
      expect(onPlaced).toHaveBeenCalledWith("new-placement-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("calls placeRackObject when rack object type is selected", async () => {
    const onPlaced = vi.fn();
    render(<PlacePlacementModal {...BASE_PROPS} onPlaced={onPlaced} />);

    // Switch to rack_object mode
    fireEvent.click(screen.getByDisplayValue("rack_object") ?? screen.getAllByRole("radio")[1]);
    fireEvent.change(screen.getByTestId("rack-object-select"), {
      target: { value: "model-2" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(mockPlaceRackObject).toHaveBeenCalledWith(
        expect.objectContaining({
          rack_id: "rack-1",
          device_model_id: "model-2",
          side: "front",
          start_u: 5,
        }),
      );
      expect(onPlaced).toHaveBeenCalledWith("new-rack-obj-placement-id");
    });
  });

  it("shows error message in footer when backend rejects", async () => {
    mockPlaceDevice.mockRejectedValueOnce(new Error("U slot occupied"));
    render(<PlacePlacementModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(screen.getByText(/U slot occupied/)).toBeTruthy();
    });
  });

  it("shows validation error when start U is missing", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={null} />);

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    // Place btn disabled when no startU, manually trigger via form validation
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    // Enable by typing a bad value then clicking
    fireEvent.change(screen.getByTestId("start-u-input"), {
      target: { value: "" },
    });
    // Simulate click even though disabled — implementation prevents submit via validate()
    // Instead verify the button is disabled (no device selected implies no submit)
    expect(btn.disabled).toBe(false); // device is selected
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Start U must be a positive integer/)).toBeTruthy();
    });
    expect(mockPlaceDevice).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<PlacePlacementModal {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
