import { describe, it, expect } from "vitest";
import {
  encodeDndPayload,
  decodeDndPayload,
  canDropAt,
  getPayloadHeight,
  getDragPayload,
  setActiveDragPayload,
  writeDragData,
} from "./dndHelpers";
import { buildOccupancy } from "./rackOccupancy";
import { DND_DATA_TYPE, type DndPayload } from "./dndTypes";
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

  it("round-trips a placement payload", () => {
    const payload: DndPayload = {
      kind: "placement",
      placementId: "plc-abc",
      startU: 5,
      heightU: 2,
      side: "rear",
    };
    expect(decodeDndPayload(encodeDndPayload(payload))).toEqual(payload);
  });

  it("returns null for a placement payload with invalid side", () => {
    expect(
      decodeDndPayload(
        JSON.stringify({ kind: "placement", placementId: "x", startU: 1, heightU: 1, side: "top" }),
      ),
    ).toBeNull();
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

// ── canDropAt — excludePlacementId ────────────────────────────────────────────

describe("canDropAt — excludePlacementId", () => {
  it("treats excluded placement's own cells as empty", () => {
    const p = makePlacement({ code: "X", id: "p-x", start_u: 2, end_u: 3, effective_height_u: 2 });
    const { units } = buildOccupancy(4, [p]);
    // Without exclude: can't drop at U2 (occupied)
    expect(canDropAt(units, 2, 2)).toBe(false);
    // With exclude: U2–U3 are treated as empty because they belong to the excluded placement
    expect(canDropAt(units, 2, 2, "p-x")).toBe(true);
  });

  it("excludePlacementId does not clear cells belonging to a different placement", () => {
    const pA = makePlacement({ code: "A", id: "p-a", start_u: 1, end_u: 1, effective_height_u: 1 });
    const pB = makePlacement({ code: "B", id: "p-b", start_u: 2, end_u: 2, effective_height_u: 1 });
    const { units } = buildOccupancy(4, [pA, pB]);
    // Excluding p-a: U1 is free but U2 (p-b) is still blocked
    expect(canDropAt(units, 1, 2, "p-a")).toBe(false); // U1 free + U2 blocked by p-b
    expect(canDropAt(units, 1, 1, "p-a")).toBe(true);  // only U1, which belongs to p-a
  });

  it("allows moving a 2U placement to an adjacent non-overlapping position", () => {
    const p = makePlacement({ code: "C", id: "p-c", start_u: 3, end_u: 4, effective_height_u: 2 });
    const { units } = buildOccupancy(6, [p]);
    // Move from U3–U4 to U1–U2 (no overlap): should be valid even without exclude
    expect(canDropAt(units, 1, 2)).toBe(true);
    // Move to U2–U3 (overlaps U3 which belongs to p-c): valid with exclude
    expect(canDropAt(units, 2, 2)).toBe(false);
    expect(canDropAt(units, 2, 2, "p-c")).toBe(true);
  });

  it("still blocks if there is a truly occupied cell in range beyond the excluded one", () => {
    const pA = makePlacement({ code: "A", id: "p-a", start_u: 2, end_u: 2, effective_height_u: 1 });
    const pB = makePlacement({ code: "B", id: "p-b", start_u: 4, end_u: 4, effective_height_u: 1 });
    const { units } = buildOccupancy(5, [pA, pB]);
    // Excluding p-a, trying to drop a 3U item at U2–U4: U4 is still blocked by p-b
    expect(canDropAt(units, 2, 3, "p-a")).toBe(false);
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

  it("returns heightU for a placement payload", () => {
    const payload: DndPayload = {
      kind: "placement",
      placementId: "plc-1",
      startU: 3,
      heightU: 4,
      side: "front",
    };
    expect(getPayloadHeight(payload)).toBe(4);
  });
});

// ── writeDragData ──────────────────────────────────────────────────────────────

describe("writeDragData", () => {
  it("writes to custom MIME type and text/plain", () => {
    const stored: Record<string, string> = {};
    const mockDt = {
      setData: (type: string, val: string) => { stored[type] = val; },
    } as unknown as DataTransfer;
    const payload: DndPayload = { kind: "device", deviceId: "x", deviceCode: "X", defaultHeightU: 1 };
    const encoded = encodeDndPayload(payload);
    writeDragData(mockDt, encoded);
    expect(stored[DND_DATA_TYPE]).toBe(encoded);
    expect(stored["text/plain"]).toBe(encoded);
  });

  it("does not throw when setData throws for custom MIME", () => {
    const mockDt = {
      setData: (type: string) => {
        if (type === DND_DATA_TYPE) throw new Error("not allowed");
      },
    } as unknown as DataTransfer;
    const payload: DndPayload = { kind: "device", deviceId: "x", deviceCode: "X", defaultHeightU: 1 };
    expect(() => writeDragData(mockDt, encodeDndPayload(payload))).not.toThrow();
  });

  it("does not throw when setData throws for all MIME types", () => {
    const mockDt = {
      setData: () => { throw new Error("not allowed"); },
    } as unknown as DataTransfer;
    const payload: DndPayload = { kind: "device", deviceId: "x", deviceCode: "X", defaultHeightU: 1 };
    expect(() => writeDragData(mockDt, encodeDndPayload(payload))).not.toThrow();
  });
});

// ── getDragPayload — read priority ────────────────────────────────────────────

describe("getDragPayload — read priority", () => {
  it("returns payload from custom MIME when present", () => {
    const payload: DndPayload = { kind: "device", deviceId: "id-1", deviceCode: "D1", defaultHeightU: 1 };
    setActiveDragPayload(null);
    const fakeEvent = {
      dataTransfer: { getData: (type: string) => type === DND_DATA_TYPE ? encodeDndPayload(payload) : "" },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(payload);
  });

  it("reads text/plain fallback when custom MIME returns empty (Windows WebView2 compatibility)", () => {
    const payload: DndPayload = { kind: "device", deviceId: "id-1", deviceCode: "D1", defaultHeightU: 1 };
    setActiveDragPayload(null);
    const fakeEvent = {
      dataTransfer: {
        getData: (type: string) => type === "text/plain" ? encodeDndPayload(payload) : "",
      },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(payload);
    setActiveDragPayload(null);
  });

  it("prefers custom MIME over text/plain when both are set", () => {
    const customPayload: DndPayload = { kind: "device", deviceId: "custom", deviceCode: "C", defaultHeightU: 1 };
    const textPayload: DndPayload = { kind: "device", deviceId: "text", deviceCode: "T", defaultHeightU: 2 };
    setActiveDragPayload(null);
    const fakeEvent = {
      dataTransfer: {
        getData: (type: string) =>
          type === DND_DATA_TYPE ? encodeDndPayload(customPayload) : encodeDndPayload(textPayload),
      },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(customPayload);
  });

  it("returns payload from _activeDragPayload when both dataTransfer entries return empty", () => {
    const payload: DndPayload = { kind: "device", deviceId: "id-1", deviceCode: "D1", defaultHeightU: 1 };
    setActiveDragPayload(payload);
    const fakeEvent = {
      dataTransfer: { getData: () => "" },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(payload);
    setActiveDragPayload(null);
  });

  it("handles getData throwing gracefully, falls back to in-memory cache", () => {
    const payload: DndPayload = { kind: "device", deviceId: "x", deviceCode: "X", defaultHeightU: 1 };
    setActiveDragPayload(payload);
    const fakeEvent = {
      dataTransfer: { getData: () => { throw new Error("not allowed"); } },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toEqual(payload);
    setActiveDragPayload(null);
  });

  it("returns null when all sources are empty", () => {
    setActiveDragPayload(null);
    const fakeEvent = {
      dataTransfer: { getData: () => "" },
    } as unknown as DragEvent;
    expect(getDragPayload(fakeEvent)).toBeNull();
  });
});
