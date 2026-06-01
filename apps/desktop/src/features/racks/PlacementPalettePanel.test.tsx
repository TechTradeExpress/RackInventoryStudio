// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlacementPalettePanel } from "./PlacementPalettePanel";
import type { RackSummaryDto, DeviceDto } from "../../api/tauriClient";
import { listDevices, listDeviceModels } from "../../api/tauriClient";
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

function makeDevice(id: string, overrides: Partial<DeviceDto> = {}): DeviceDto {
  return {
    id,
    code: `device-${id}`,
    name: `Device ${id}`,
    device_model_id: null,
    device_model_code: null,
    device_type: "server",
    is_placed: false,
    serial_number: null,
    asset_tag: null,
    external_ref: null,
    status: "active",
    description: null,
    tags: [],
    ...overrides,
  };
}

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
  vi.mocked(listDevices).mockResolvedValue([]);
  vi.mocked(listDeviceModels).mockResolvedValue([]);
});

afterEach(() => {
  setActiveDragPayload(null);
  cleanup();
  vi.clearAllMocks();
});

// ── Persistent unplace drop zone ───────────────────────────────────────────────

describe("PlacementPalettePanel — persistent unplace drop zone", () => {
  it("renders unplace-drop-zone even when there are no unplaced devices", async () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    // Drop zone must be in the DOM immediately, not just during drag
    expect(screen.getByTestId("unplace-drop-zone")).toBeTruthy();
  });

  it("drop zone shows instructional copy", async () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    expect(screen.getByTestId("unplace-drop-zone").textContent).toContain("remove from rack");
  });

  it("drop zone is visible while unplaced list is loading", () => {
    vi.mocked(listDevices).mockReturnValue(new Promise(() => {}));
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    expect(screen.getByTestId("unplace-drop-zone")).toBeTruthy();
  });

  it("calls onUnplacePlacement when a placement payload is dropped on unplace-drop-zone", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("unplace-drop-zone");
    setActiveDragPayload(PLACEMENT_PAYLOAD);

    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).toHaveBeenCalledWith("placement-abc");
    expect(onUnplace).toHaveBeenCalledTimes(1);
  });

  it("ignores drop on unplace-drop-zone when payload kind is 'device'", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("unplace-drop-zone");
    setActiveDragPayload(DEVICE_PAYLOAD);

    fireEvent.dragOver(zone);
    fireEvent.drop(zone);

    expect(onUnplace).not.toHaveBeenCalled();
  });

  it("ignores drop on unplace-drop-zone when payload kind is 'rack_object'", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);

    const zone = screen.getByTestId("unplace-drop-zone");
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

  it("does not throw when onUnplacePlacement is not provided", () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    const zone = screen.getByTestId("unplace-drop-zone");
    setActiveDragPayload(PLACEMENT_PAYLOAD);
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);
    // No error thrown
  });

  it("does not call onUnplacePlacement when no payload is active", () => {
    const onUnplace = vi.fn();
    render(<PlacementPalettePanel {...BASE_PROPS} onUnplacePlacement={onUnplace} />);
    const zone = screen.getByTestId("unplace-drop-zone");
    // No setActiveDragPayload
    fireEvent.dragOver(zone);
    fireEvent.drop(zone);
    expect(onUnplace).not.toHaveBeenCalled();
  });
});

// ── Outer drop-zone container (backward-compatible) ────────────────────────────

describe("PlacementPalettePanel — drop zone container", () => {
  it("renders the palette-drop-zone container", () => {
    render(<PlacementPalettePanel {...BASE_PROPS} />);
    expect(screen.getByTestId("palette-drop-zone")).toBeTruthy();
  });
});

// ── Palette device limit (max 6) ───────────────────────────────────────────────

describe("PlacementPalettePanel — device limit", () => {
  it("shows at most 6 unplaced devices when there are more", async () => {
    const devices = Array.from({ length: 9 }, (_, i) => makeDevice(`d${i + 1}`));
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-d1")).toBeTruthy();
    });

    // Only first 6 are rendered
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByTestId(`dnd-device-d${i}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("dnd-device-d7")).toBeNull();
    expect(screen.queryByTestId("dnd-device-d8")).toBeNull();
    expect(screen.queryByTestId("dnd-device-d9")).toBeNull();
  });

  it("shows all devices when count is exactly 6", async () => {
    const devices = Array.from({ length: 6 }, (_, i) => makeDevice(`e${i + 1}`));
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-e6")).toBeTruthy();
    });
    expect(screen.queryByTestId("palette-overflow-indicator")).toBeNull();
  });

  it("shows overflow indicator with correct counts when > 6 devices", async () => {
    const devices = Array.from({ length: 8 }, (_, i) => makeDevice(`f${i + 1}`));
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("palette-overflow-indicator")).toBeTruthy();
    });

    const indicator = screen.getByTestId("palette-overflow-indicator");
    expect(indicator.textContent).toContain("6");
    expect(indicator.textContent).toContain("8");
  });

  it("Show all button reveals all devices", async () => {
    const devices = Array.from({ length: 9 }, (_, i) => makeDevice(`g${i + 1}`));
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("show-all-devices-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("show-all-devices-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-g9")).toBeTruthy();
    });
    expect(screen.queryByTestId("palette-overflow-indicator")).toBeNull();
  });

  it("shows no overflow indicator when there are fewer than 6 devices", async () => {
    const devices = Array.from({ length: 3 }, (_, i) => makeDevice(`h${i + 1}`));
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-h1")).toBeTruthy();
    });
    expect(screen.queryByTestId("palette-overflow-indicator")).toBeNull();
    expect(screen.queryByTestId("show-all-devices-btn")).toBeNull();
  });
});

// ── Recency ordering ───────────────────────────────────────────────────────────

describe("PlacementPalettePanel — recency ordering", () => {
  it("displays recently unplaced devices before others", async () => {
    const devices = [
      makeDevice("old-1"),
      makeDevice("old-2"),
      makeDevice("old-3"),
      makeDevice("recent-4"),
    ];
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(
      <PlacementPalettePanel
        {...BASE_PROPS}
        recentlyUnplacedDeviceIds={["recent-4"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-recent-4")).toBeTruthy();
    });

    const palette = screen.getByTestId("dnd-device-recent-4").closest(".palette");
    if (!palette) throw new Error("palette not found");

    const cards = Array.from(palette.querySelectorAll("[data-testid^='dnd-device-']"));
    expect(cards[0].getAttribute("data-testid")).toBe("dnd-device-recent-4");
  });

  it("shows most recent first when multiple devices were recently unplaced", async () => {
    const devices = [
      makeDevice("a1"),
      makeDevice("b2"),
      makeDevice("c3"),
    ];
    vi.mocked(listDevices).mockResolvedValue(devices);

    // b2 was unplaced first, then a1 most recently
    render(
      <PlacementPalettePanel
        {...BASE_PROPS}
        recentlyUnplacedDeviceIds={["b2", "a1"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-a1")).toBeTruthy();
    });

    const palette = screen.getByTestId("dnd-device-a1").closest(".palette");
    if (!palette) throw new Error("palette not found");

    const cards = Array.from(palette.querySelectorAll("[data-testid^='dnd-device-']"));
    expect(cards[0].getAttribute("data-testid")).toBe("dnd-device-a1");
    expect(cards[1].getAttribute("data-testid")).toBe("dnd-device-b2");
  });

  it("preserves stable order when no recency information is provided", async () => {
    const devices = [makeDevice("x1"), makeDevice("x2"), makeDevice("x3")];
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-x1")).toBeTruthy();
    });

    const palette = screen.getByTestId("dnd-device-x1").closest(".palette");
    if (!palette) throw new Error("palette not found");

    const cards = Array.from(palette.querySelectorAll("[data-testid^='dnd-device-']"));
    expect(cards[0].getAttribute("data-testid")).toBe("dnd-device-x1");
    expect(cards[1].getAttribute("data-testid")).toBe("dnd-device-x2");
    expect(cards[2].getAttribute("data-testid")).toBe("dnd-device-x3");
  });
});

// ── Existing DnD placement behavior (devices into rack) ───────────────────────

describe("PlacementPalettePanel — DnD place behavior", () => {
  it("device card is draggable", async () => {
    vi.mocked(listDevices).mockResolvedValue([makeDevice("drag-1")]);

    render(<PlacementPalettePanel {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("dnd-device-drag-1")).toBeTruthy();
    });

    expect(
      screen.getByTestId("dnd-device-drag-1").getAttribute("draggable"),
    ).toBe("true");
  });

  it("Place… button calls onPlaceDevice with the device id", async () => {
    vi.mocked(listDevices).mockResolvedValue([makeDevice("place-me")]);
    const onPlace = vi.fn();

    render(
      <PlacementPalettePanel {...BASE_PROPS} onPlaceDevice={onPlace} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("place-btn-device-place-me")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("place-btn-device-place-me"));
    expect(onPlace).toHaveBeenCalledWith("place-me");
  });
});

// ── Code-leakage regression ────────────────────────────────────────────────────

describe("PlacementPalettePanel — code leakage regression", () => {
  it("device with a name renders name, not code, in card text, title, and aria-label", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("named-dev", { code: "device-secret-code-123", name: "Web Server 01" }),
    ]);

    render(<PlacementPalettePanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId("dnd-device-named-dev")).toBeTruthy());

    const card = screen.getByTestId("dnd-device-named-dev");
    expect(card.textContent).toContain("Web Server 01");
    expect(card.textContent).not.toContain("device-secret-code-123");

    const placeBtn = screen.getByTestId("place-btn-device-named-dev");
    expect(placeBtn.getAttribute("title")).toContain("Web Server 01");
    expect(placeBtn.getAttribute("title")).not.toContain("device-secret-code-123");
    expect(placeBtn.getAttribute("aria-label")).toContain("Web Server 01");
    expect(placeBtn.getAttribute("aria-label")).not.toContain("device-secret-code-123");
  });

  it("device with no name shows 'Unnamed device', never the code, in card text, title, and aria-label", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("unnamed-dev", { code: "device-secret-code-123", name: null }),
    ]);

    render(<PlacementPalettePanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByTestId("dnd-device-unnamed-dev")).toBeTruthy());

    const card = screen.getByTestId("dnd-device-unnamed-dev");
    expect(card.textContent).toContain("Unnamed device");
    expect(card.textContent).not.toContain("device-secret-code-123");

    const placeBtn = screen.getByTestId("place-btn-device-unnamed-dev");
    expect(placeBtn.getAttribute("title")).not.toContain("device-secret-code-123");
    expect(placeBtn.getAttribute("aria-label")).not.toContain("device-secret-code-123");
    expect(placeBtn.getAttribute("aria-label")).toContain("Unnamed device");
  });
});
