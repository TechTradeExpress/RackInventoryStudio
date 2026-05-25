import { describe, it, expect } from "vitest";
import {
  encodeDndPayload,
  decodeDndPayload,
  canDropAt,
  getPayloadHeight,
  getDragPayload,
  setActiveDragPayload,
} from "./dndHelpers";
import { buildOccupancy } from "./rackOccupancy";
import type { DndPayload } from "./dndTypes";
import type { PlacementDto } from "../../api/tauriClient";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makePlacement({
  code,
  ...rest
}: Partial<PlacementDto> & { code: string }): PlacementDto {
  return {
    id: code,
    code,
    target_kind: "device",
    target_id: "t1",
    target_code: code,
    target_name: null,
    device_type: null,
    start_u: 1,
    height_u: null,
    effective_height_u: 1,
    end_u: 1,
    note: null,
    tags: [],
    model_name: null,
    model_code: null,
    target_serial: null,
    target_asset_tag: null,
    ...rest,
  };
}

// ── encode / decode ────────────────────────────────────────────────────────────

describe("encodeDndPayload / decodeDndPayload", () => {
  it("round-trips a device payload with numeric defaultHeightU", () => {
    const payload: DndPayload = {
      kind: "device",
      deviceId: "id-1",
      deviceCode: "DEV-01",
      defaultHeightU: 2,
    };
    expect(decodeDndPayload(encodeDndPayload(payload))).toEqual(payload);
  });

  it("round-trips a device payload with null defaultHeightU", () => {
    const payload: DndPayload = {
      kind: "device",
      deviceId: "id-2",
      deviceCode: "DEV-02",
      defaultHeightU: null,
    };
    expect(decodeDndPayload(encodeDndPayload(payload))).toEqual(payload);
  });

  it("round-trips a rack_object payload", () => {
    const payload: DndPayload = {
      kind: "rack_object",
      deviceModelId: "model-1",
      modelCode: "PATCH-01",
      defaultHeightU: 1,
    };
    expect(decodeDndPayload(encodeDndPayload(payload))).toEqual(payload);
  });

  it("returns null for an empty string", () => {
    expect(decodeDndPayload("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(decodeDndPayload("{not-json")).toBeNull();
  });

  it("returns null for an unknown kind", () => {
    expect(
      decodeDndPayload(JSON.stringify({ kind: "unknown", deviceId: "x" })),
    ).toBeNull();
  });

  it("returns null for a device payload missing deviceId", () => {
    expect(
      decodeDndPayload(
        JSON.stringify({ kind: "device", deviceCode: "X", defaultHeightU: 1 }),
      ),
    ).toBeNull();
  });
});

// ── canDropAt ─────────────────────────────────────────────────────────────────

describe("canDropAt", () => {
  it("1U item on any empty cell in an empty rack is valid", () => {
    const { units } = buildOccupancy(4, []);
    expect(canDropAt(units, 1, 1)).toBe(true);
    expect(canDropAt(units, 4, 1)).toBe(true);
  });

  it("2U item is valid when both cells in range are empty", () => {
    const { units } = buildOccupancy(4, []);
    expect(canDropAt(units, 1, 2)).toBe(true); // U1–U2
    expect(canDropAt(units, 3, 2)).toBe(true); // U3–U4
  });

  it("4U item is valid when all cells are empty (fits exactly)", () => {
    const { units } = buildOccupancy(4, []);
    expect(canDropAt(units, 1, 4)).toBe(true);
  });

  it("out-of-bounds above top of rack is invalid", () => {
    const { units } = buildOccupancy(4, []);
    // 2U from U4 would need U5 which doesn't exist
    expect(canDropAt(units, 4, 2)).toBe(false);
    // 4U from U2 would need U5
    expect(canDropAt(units, 2, 4)).toBe(false);
  });

  it("startU outside rack bounds is invalid", () => {
    const { units } = buildOccupancy(4, []);
    expect(canDropAt(units, 5, 1)).toBe(false); // above rack
    expect(canDropAt(units, 0, 1)).toBe(false); // below rack
  });

  it("overlap with an occupied cell is invalid", () => {
    const p = makePlacement({ code: "A", start_u: 2, end_u: 2, effective_height_u: 1 });
    const { units } = buildOccupancy(4, [p]);
    expect(canDropAt(units, 2, 1)).toBe(false); // directly on occupied U2
    expect(canDropAt(units, 1, 2)).toBe(false); // range U1–U2 overlaps occupied U2
    expect(canDropAt(units, 2, 2)).toBe(false); // range U2–U3 starts on occupied U2
  });

  it("overlap with an incomplete cell is invalid", () => {
    // Placement with unknown height → marked as incomplete at start_u
    const p = makePlacement({ code: "B", start_u: 3, end_u: null, effective_height_u: null });
    const { units } = buildOccupancy(4, [p]);
    expect(units[2].kind).toBe("incomplete"); // U3 = index 2
    expect(canDropAt(units, 3, 1)).toBe(false); // directly on incomplete
    expect(canDropAt(units, 2, 2)).toBe(false); // range U2–U3 overlaps incomplete at U3
  });

  it("non-integer or zero heightU is invalid", () => {
    const { units } = buildOccupancy(4, []);
    expect(canDropAt(units, 1, 0)).toBe(false);
    expect(canDropAt(units, 1, 1.5)).toBe(false);
  });
});

// ── getPayloadHeight ───────────────────────────────────────────────────────────

describe("getPayloadHeight", () => {
  it("returns defaultHeightU for a device with known height", () => {
    const payload: DndPayload = {
      kind: "device",
      deviceId: "id-1",
      deviceCode: "D1",
      defaultHeightU: 3,
    };
    expect(getPayloadHeight(payload)).toBe(3);
  });

  it("returns 1 for a device with null defaultHeightU", () => {
    const payload: DndPayload = {
      kind: "device",
      deviceId: "id-2",
      deviceCode: "D2",
      defaultHeightU: null,
    };
    expect(getPayloadHeight(payload)).toBe(1);
  });

  it("returns defaultHeightU for a rack_object", () => {
    const payload: DndPayload = {
      kind: "rack_object",
      deviceModelId: "m-1",
      modelCode: "RO1",
      defaultHeightU: 2,
    };
    expect(getPayloadHeight(payload)).toBe(2);
  });
});

// ── getDragPayload — _activeDragPayload fallback ───────────────────────────────

describe("getDragPayload — dataTransfer fallback", () => {
  it("returns payload from _activeDragPayload when dataTransfer.getData returns empty string", () => {
    const payload: DndPayload = {
      kind: "device",
      deviceId: "id-1",
      deviceCode: "D1",
      defaultHeightU: 1,
    };
    setActiveDragPayload(payload);
    const fakeEvent = {
      dataTransfer: { getData: () => "" },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(payload);
    setActiveDragPayload(null);
  });

  it("prefers dataTransfer payload over _activeDragPayload when both are set", () => {
    const transferPayload: DndPayload = {
      kind: "device",
      deviceId: "id-1",
      deviceCode: "D1",
      defaultHeightU: 1,
    };
    const cachedPayload: DndPayload = {
      kind: "device",
      deviceId: "id-2",
      deviceCode: "D2",
      defaultHeightU: 2,
    };
    setActiveDragPayload(cachedPayload);
    const fakeEvent = {
      dataTransfer: { getData: () => encodeDndPayload(transferPayload) },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(transferPayload);
    setActiveDragPayload(null);
  });

  it("returns null when both dataTransfer and _activeDragPayload are empty", () => {
    setActiveDragPayload(null);
    const fakeEvent = {
      dataTransfer: { getData: () => "" },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toBeNull();
  });
});
