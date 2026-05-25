import type React from "react";
import { DND_DATA_TYPE, type DndPayload } from "./dndTypes";
import type { UnitState } from "./rackOccupancy";

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
  const fromTransfer = raw ? decodeDndPayload(raw) : null;
  // Fall back to the in-memory cache when dataTransfer.getData() is unavailable
  // (e.g. programmatic DragEvents in Playwright E2E simulations).
  return fromTransfer ?? _activeDragPayload;
}

// ── Active drag singleton ──────────────────────────────────────────────────────
// HTML DnD API restricts dataTransfer.getData() to dragstart and drop events.
// During dragover we can't read the payload, so we cache it here on dragstart
// and clear it on dragend to allow pre-flight validation in drop targets.

let _activeDragPayload: DndPayload | null = null;

export function setActiveDragPayload(payload: DndPayload | null): void {
  _activeDragPayload = payload;
}

export function getActiveDragPayload(): DndPayload | null {
  return _activeDragPayload;
}

// ── Drop target validation ─────────────────────────────────────────────────────

/**
 * Returns the height in U-units to use for drop target validation.
 * rack_object always carries a concrete height; device falls back to 1U
 * when the model height is not known at drag time.
 */
export function getPayloadHeight(payload: DndPayload): number {
  return payload.defaultHeightU ?? 1;
}

/**
 * Returns true when dropping an item of `heightU` starting at `startU` is valid.
 *
 * Convention (same as buildOccupancy): units[0] = U1 (bottom), units[n-1] = top.
 * A placement from startU to (startU + heightU - 1) must fit entirely within the
 * rack and all cells in that range must be empty.
 */
export function canDropAt(
  units: UnitState[],
  startU: number,
  heightU: number,
): boolean {
  if (!Number.isInteger(heightU) || heightU < 1) return false;
  if (!Number.isInteger(startU) || startU < 1) return false;
  const endU = startU + heightU - 1;
  if (endU > units.length) return false;
  for (let u = startU; u <= endU; u++) {
    if (units[u - 1].kind !== "empty") return false;
  }
  return true;
}
