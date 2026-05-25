import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PlacementPalettePanel } from "./PlacementPalettePanel";
import type { RackSummaryDto } from "../../api/tauriClient";
import { setActiveDragPayload } from "./dndHelpers";
import type { DndPayload } from "./dndTypes";

vi.mock("../../api/tauriClient", () => ({
  listDevices: vi.fn().mockResolvedValue([]),
  listDeviceModels: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

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
  front_used_u: 0,
  rear_used_u: 0,
};

const PLACEMENT_PAYLOAD: DndPayload = {
  kind: "placement",
  placementId: "placement-abc",
  startU: 5,
  heightU: 1,
  side: "front",
};

const DEVICE_PAYLOAD: DndPayload = {
  kind: "device",
  deviceId: "device-1",
  deviceCode: "srv-01",
  defaultHeightU: 1,
};

const BASE_PROPS = {
  rack: FIXTURE_RACK,
  reloadToken: 0,
  mutationToken: 0,
  activeSide: "front" as const,
  onPlaceDevice: vi.fn(),
  onPlaceRackObject: vi.fn(),
};

beforeEach(() => {
  setActiveDragPayload(null);
});

afterEach(() => {
  setActiveDragPayload(null);
  cleanup();
  vi.clearAllMocks();
});

describe("PlacementPalettePanel — drop zone", () => {
  it("renders the palette-drop-zone container", () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    expect(screen.getByTestId("palette-drop-zone")).toBeTruthy();
  });

  it("calls onUnplacePlacement when a placement payload is dropped", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("palette-drop-zone");

    // Set active payload (simulates dragstart on a placed item)
    setActiveDragPayload(PLACEMENT_PAYLOAD);

    // Simulate drag over and drop
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).toHaveBeenCalledWith("placement-abc");
    expect(onUnplace).toHaveBeenCalledTimes(1);
  });

  it("ignores drop when payload kind is 'device'", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("palette-drop-zone");

    setActiveDragPayload(DEVICE_PAYLOAD);

    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).not.toHaveBeenCalled();
  });

  it("ignores drop when payload kind is 'rack_object'", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("palette-drop-zone");

    setActiveDragPayload({
      kind: "rack_object",
      deviceModelId: "model-1",
      modelCode: "blank-1u",
      defaultHeightU: 1,
    });

    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).not.toHaveBeenCalled();
  });

  it("ignores drop when onUnplacePlacement is not provided", () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);

    const zone = screen.getByTestId("palette-drop-zone");
    setActiveDragPayload(PLACEMENT_PAYLOAD);

    // Should not throw
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);
  });

  it("does not call onUnplacePlacement when no payload is active", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("palette-drop-zone");
    // No setActiveDragPayload — payload is null

    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).not.toHaveBeenCalled();
  });
});
