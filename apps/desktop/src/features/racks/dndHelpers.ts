import type React from "react";
import { DND_DATA_TYPE, type DndPayload } from "./dndTypes";

export function encodeDndPayload(payload: DndPayload): string {
  return JSON.stringify(payload);
}

export function decodeDndPayload(raw: string): DndPayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== "object" || obj === null) return null;
    const o = obj as Record<string, unknown>;
    if (o.kind === "device") {
      if (typeof o.deviceId !== "string" || typeof o.deviceCode !== "string") return null;
      const dh = o.defaultHeightU;
      if (dh !== null && typeof dh !== "number") return null;
      return {
        kind: "device",
        deviceId: o.deviceId,
        deviceCode: o.deviceCode,
        defaultHeightU: typeof dh === "number" ? dh : null,
      };
    }
    if (o.kind === "rack_object") {
      if (
        typeof o.deviceModelId !== "string" ||
        typeof o.modelCode !== "string" ||
        typeof o.defaultHeightU !== "number"
      )
        return null;
      return {
        kind: "rack_object",
        deviceModelId: o.deviceModelId,
        modelCode: o.modelCode,
        defaultHeightU: o.defaultHeightU,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getDragPayload(
  event: React.DragEvent | DragEvent,
): DndPayload | null {
  const raw = event.dataTransfer?.getData(DND_DATA_TYPE) ?? "";
  return decodeDndPayload(raw);
}
