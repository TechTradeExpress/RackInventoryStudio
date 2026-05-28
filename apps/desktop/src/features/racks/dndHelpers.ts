import type React from "react";
import { DND_DATA_TYPE, type DndPayload } from "./dndTypes";
import type { UnitState } from "./rackOccupancy";

// ── Cross-platform DataTransfer write/read ─────────────────────────────────────
// On Windows with Tauri + WebView2, custom MIME types may not survive the DnD
// lifecycle (getData returns "" even when setData succeeded). Writing to
// text/plain as a fallback ensures the payload is readable on all platforms.
// dragDropEnabled must also be set to false in tauri.conf.json so that WebView2
// does not intercept HTML5 DnD events for native file drop handling.

/**
 * Write the encoded DnD payload to the DataTransfer object.
 *
 * Writes to both the custom MIME type and text/plain. The text/plain entry
 * acts as a compatibility fallback for Windows WebView2, where custom MIME
 * types may return an empty string from getData() in some event contexts.
 * Both writes are individually guarded — setData can throw in restricted
 * environments (e.g. outside a dragstart handler).
 */
export function writeDragData(dt: DataTransfer, encoded: string): void {
  try { dt.setData(DND_DATA_TYPE, encoded); } catch { /* ignore */ }
  try { dt.setData("text/plain", encoded); } catch { /* ignore */ }
}

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
    if (o.kind === "placement") {
      if (
        typeof o.placementId !== "string" ||
        typeof o.startU !== "number" ||
        typeof o.heightU !== "number" ||
        (o.side !== "front" && o.side !== "rear")
      )
        return null;
      return {
        kind: "placement",
        placementId: o.placementId as string,
        startU: o.startU as number,
        heightU: o.heightU as number,
        side: o.side as "front" | "rear",
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
  const dt = event.dataTransfer;
  if (dt) {
    // 1. Custom MIME type (preferred; set by writeDragData on drag start).
    try {
      const raw = dt.getData(DND_DATA_TYPE);
      if (raw) {
        const p = decodeDndPayload(raw);
        if (p) return p;
      }
    } catch { /* ignore — getData can throw outside a drop handler */ }
    // 2. text/plain fallback — more reliable on Windows WebView2.
    try {
      const raw = dt.getData("text/plain");
      if (raw) {
        const p = decodeDndPayload(raw);
        if (p) return p;
      }
    } catch { /* ignore */ }
  }
  // 3. In-memory cache — used by Playwright E2E and dragover handlers where
  //    the spec forbids reading dataTransfer outside dragstart/drop.
  return _activeDragPayload;
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
 * rack_object and placement carry a concrete height; device falls back to 1U
 * when the model height is not known at drag time.
 */
export function getPayloadHeight(payload: DndPayload): number {
  if (payload.kind === "placement") return payload.heightU;
  return payload.defaultHeightU ?? 1;
}

/**
 * Returns true when dropping an item of `heightU` starting at `startU` is valid.
 *
 * Convention (same as buildOccupancy): units[0] = U1 (bottom), units[n-1] = top.
 * A placement from startU to (startU + heightU - 1) must fit entirely within the
 * rack and all cells in that range must be empty.
 *
 * Pass `excludePlacementId` when moving an already-placed item so its own cells
 * are treated as empty during the drop validation.
 */
export function canDropAt(
  units: UnitState[],
  startU: number,
  heightU: number,
  excludePlacementId?: string,
): boolean {
  if (!Number.isInteger(heightU) || heightU < 1) return false;
  if (!Number.isInteger(startU) || startU < 1) return false;
  const endU = startU + heightU - 1;
  if (endU > units.length) return false;
  for (let u = startU; u <= endU; u++) {
    const state = units[u - 1];
    if (state.kind === "empty") continue;
    if (
      excludePlacementId &&
      (state.kind === "occupied" || state.kind === "incomplete") &&
      state.placement.id === excludePlacementId
    )
      continue;
    return false;
  }
  return true;
}
