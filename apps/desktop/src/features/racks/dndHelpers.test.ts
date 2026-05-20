import { describe, it, expect } from "vitest";
import { encodeDndPayload, decodeDndPayload } from "./dndHelpers";
import type { DndPayload } from "./dndTypes";

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
