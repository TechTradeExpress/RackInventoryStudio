// @vitest-environment jsdom
/**
 * Focused integration test: verifies that using the inspector "Remove from rack"
 * button updates session recency so the removed device appears first in the
 * unplaced palette — the same behaviour as the DnD unplace path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RackDetailPanel } from "./RackDetailPanel";
import type { RackSummaryDto, RackDetailDto, PlacementDto, DeviceDto } from "../../api/tauriClient";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockGetRackDetail = vi.hoisted(() => vi.fn());
const mockListDevices = vi.hoisted(() => vi.fn());
const mockListDeviceModels = vi.hoisted(() => vi.fn());
const mockRemovePlacement = vi.hoisted(() => vi.fn());
const mockMovePlacement = vi.hoisted(() => vi.fn());

vi.mock("../../api/tauriClient", () => ({
  getRackDetail: mockGetRackDetail,
  listDevices: mockListDevices,
  listDeviceModels: mockListDeviceModels,
  removePlacement: mockRemovePlacement,
  movePlacement: mockMovePlacement,
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

// Stub heavy modals — not under test here
vi.mock("./PlacePlacementModal", () => ({ PlacePlacementModal: () => null }));
vi.mock("./EditPlacementModal", () => ({ EditPlacementModal: () => null }));
vi.mock("../devices/DeviceFormModal", () => ({ DeviceFormModal: () => null }));
vi.mock("../deviceModels/DeviceModelFormModal", () => ({ DeviceModelFormModal: () => null }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLACEMENT_ID = "plc-target-1";
const TARGET_DEVICE_ID = "dev-target";

function makeDevice(id: string, isPlaced = false): DeviceDto {
  return {
    id,
    code: `srv-${id}`,
    name: `Server ${id}`,
    device_type: "server",
    is_placed: isPlaced,
    device_model_id: null,
    device_model_code: null,
    serial_number: null,
    asset_tag: null,
    external_ref: null,
    status: "active",
    description: null,
    tags: [],
  };
}

// 6 permanently unplaced devices (fills the visible cap exactly before the removal)
const SIX_UNPLACED: DeviceDto[] = Array.from({ length: 6 }, (_, i) =>
  makeDevice(`d${i + 1}`),
);

const PLACED_DEVICE: DeviceDto = makeDevice(TARGET_DEVICE_ID, true);
const TARGET_DEVICE_UNPLACED: DeviceDto = makeDevice(TARGET_DEVICE_ID, false);

const PLACEMENT: PlacementDto = {
  id: PLACEMENT_ID,
  code: "plc-target-1",
  target_kind: "device",
  target_id: TARGET_DEVICE_ID,
  target_code: "srv-target",
  target_name: "Target Server",
  device_type: "server",
  start_u: 1,
  height_u: 1,
  effective_height_u: 1,
  end_u: 1,
  note: null,
  tags: [],
  model_name: null,
  model_code: null,
  target_serial: null,
  target_asset_tag: null,
};

const RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "datacenter-a",
  height_u: 10,
  row: null,
  description: null,
  tags: [],
  front_placement_count: 1,
  rear_placement_count: 0,
  placement_count: 1,
  front_used_u: 1,
  rear_used_u: 0,
};

const DETAIL_WITH_PLACEMENT: RackDetailDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "datacenter-a",
  height_u: 10,
  row: null,
  front: [PLACEMENT],
  rear: [],
};

const DETAIL_EMPTY: RackDetailDto = { ...DETAIL_WITH_PLACEMENT, front: [], rear: [] };

// ── Test setup ────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RackDetailPanel — inspector unplace updates recency", () => {
  it("device removed via inspector 'Remove from rack' appears first in palette", async () => {
    // The removal flag gates mock responses — flips to true when removePlacement fires.
    let removalDone = false;

    mockGetRackDetail.mockImplementation(() =>
      Promise.resolve(removalDone ? DETAIL_EMPTY : DETAIL_WITH_PLACEMENT),
    );
    mockListDevices.mockImplementation(() => {
      if (!removalDone) {
        // Before: 6 unplaced + target device is still placed
        return Promise.resolve([...SIX_UNPLACED, PLACED_DEVICE]);
      }
      // After: target device is now unplaced; backend returns it as first entry
      return Promise.resolve([TARGET_DEVICE_UNPLACED, ...SIX_UNPLACED]);
    });
    mockListDeviceModels.mockResolvedValue([]);
    mockRemovePlacement.mockImplementation(() => {
      removalDone = true;
      return Promise.resolve(undefined);
    });
    mockMovePlacement.mockResolvedValue(undefined);

    render(
      <RackDetailPanel
        rack={RACK}
        mutationToken={0}
        onRepositoryMutated={vi.fn()}
        onNavigateToRackPlacement={() => false}
        initialNavigation={null}
      />,
    );

    // Wait for the placed device card to appear in the rack diagram
    await waitFor(() => {
      expect(screen.getByTestId(`placed-front-${PLACEMENT_ID}`)).toBeTruthy();
    });

    // Select the placement (click opens the inspector)
    fireEvent.click(screen.getByTestId(`placed-front-${PLACEMENT_ID}`));

    // Inspector should show "Remove from rack"
    await waitFor(() => {
      expect(screen.getByTestId("remove-from-rack-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));

    // Confirm in the dialog
    const allBtns = await screen.findAllByRole("button", { name: "Remove from rack" });
    const confirmBtn = allBtns.find((b) => b.className.includes("btn-danger"))!;
    fireEvent.click(confirmBtn);

    // After refresh: 7 unplaced devices → overflow indicator must appear
    await waitFor(() => {
      expect(screen.getByTestId("palette-overflow-indicator")).toBeTruthy();
    });

    // The target device must be first in the visible palette (recency ordering)
    const firstCard = screen
      .getByTestId("palette-overflow-indicator")
      .closest(".palette")
      ?.querySelector("[data-testid^='dnd-device-']");

    expect(firstCard?.getAttribute("data-testid")).toBe(
      `dnd-device-${TARGET_DEVICE_ID}`,
    );
  });

  it("rack_object placement removal does not add any id to recency list", async () => {
    // A rack_object placement being removed must not pollute the device recency list.
    // Verify: after removing a rack_object placement, the 6 unplaced devices still
    // show in their original backend order (no recency reordering).
    let removalDone = false;

    const RACK_OBJECT_PLACEMENT: PlacementDto = {
      ...PLACEMENT,
      id: "plc-ro-1",
      target_kind: "rack_object",
      target_id: "model-blank-1u",
      target_name: "1U Blank",
    };

    mockGetRackDetail.mockImplementation(() =>
      Promise.resolve(
        removalDone
          ? { ...DETAIL_EMPTY }
          : { ...DETAIL_WITH_PLACEMENT, front: [RACK_OBJECT_PLACEMENT] },
      ),
    );
    // Only 6 unplaced devices — no overflow before or after
    mockListDevices.mockResolvedValue(SIX_UNPLACED);
    mockListDeviceModels.mockResolvedValue([]);
    mockRemovePlacement.mockImplementation(() => {
      removalDone = true;
      return Promise.resolve(undefined);
    });
    mockMovePlacement.mockResolvedValue(undefined);

    render(
      <RackDetailPanel
        rack={RACK}
        mutationToken={0}
        onRepositoryMutated={vi.fn()}
        onNavigateToRackPlacement={() => false}
        initialNavigation={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("placed-front-plc-ro-1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("placed-front-plc-ro-1"));

    await waitFor(() => {
      expect(screen.getByTestId("remove-from-rack-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));

    const allBtns = await screen.findAllByRole("button", { name: "Remove from rack" });
    const confirmBtn = allBtns.find((b) => b.className.includes("btn-danger"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockRemovePlacement).toHaveBeenCalledTimes(1);
    });

    // No overflow — 6 unplaced devices, stable order preserved
    await waitFor(() => {
      expect(screen.queryByTestId("palette-overflow-indicator")).toBeNull();
    });

    // Devices appear in original order (d1 first)
    const palette = screen
      .getByTestId("dnd-device-d1")
      .closest(".palette");
    const cards = Array.from(
      palette!.querySelectorAll("[data-testid^='dnd-device-']"),
    );
    expect(cards[0].getAttribute("data-testid")).toBe("dnd-device-d1");
  });
});
