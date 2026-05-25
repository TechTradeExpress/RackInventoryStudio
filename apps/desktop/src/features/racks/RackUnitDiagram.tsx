import { useState, type CSSProperties } from "react";
import type { PlacementDto } from "../../api/tauriClient";
import { buildOccupancy, type UnitState } from "./rackOccupancy";
import {
  getDragPayload,
  getActiveDragPayload,
  getPayloadHeight,
  canDropAt,
  encodeDndPayload,
  setActiveDragPayload,
} from "./dndHelpers";
import { DND_DATA_TYPE, type DndPayload } from "./dndTypes";
import { derivePlacementLabel } from "./rackPlacementLabel";

interface Props {
  heightU: number;
  front: PlacementDto[];
  rear: PlacementDto[];
  side: "front" | "rear";
  selectedPlacementId: string | null;
  onSelectPlacement: (placement: PlacementDto | null) => void;
  onDropAtCell?: (side: "front" | "rear", startU: number, payload: DndPayload) => void;
  onEmptySlotClick?: (startU: number) => void;
  onMovePlacement?: (side: "front" | "rear", placementId: string, newStartU: number) => void;
}

// ── Column layout constants ────────────────────────────────────────────────────
const ROW_H   = 22;   // px per U row
const COL_U   = 36;   // px — U-number gutter (fixed)
const COL_TYPE = 70;  // px — Kind / device type (fixed)
const COL_RANGE = 62; // px — U range e.g. "U10" or "U5–U7" (fixed)
const COL_STATUS = 32; // px — status / warning indicator (fixed)
// Name: flex 2, min 100px — primary placement name (drag handle + click-to-select)
// Model: flex 1, min 60px — model name/code
// Code: flex 1, min 60px — target code / asset / serial

const colors = {
  empty: "#f8f8f8",
  emptyBorder: "#e0e0e0",
  occupied: "#4a90d9",
  occupiedTop: "#357abd",
  occupiedText: "#fff",
  occupiedSelected: "#1d4d8a",
  incomplete: "#e8a020",
  incompleteText: "#fff",
  incompleteSelected: "#9b6010",
  selectionRing: "#ffd700",
  labelBg: "#f0f0f0",
  headerBg: "#e8e8e8",
};

// Shared cell style applied to every data cell within a row
function dataCellStyle(width?: number, flex?: number, minWidth?: number): CSSProperties {
  return {
    ...(width !== undefined ? { width, flexShrink: 0 } : {}),
    ...(flex !== undefined ? { flex } : {}),
    ...(minWidth !== undefined ? { minWidth } : {}),
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 4,
    paddingRight: 4,
    display: "flex",
    alignItems: "center",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    fontSize: "0.72rem",
  };
}

// Header cell style
function headerCellStyle(width?: number, flex?: number, minWidth?: number): CSSProperties {
  return {
    ...dataCellStyle(width, flex, minWidth),
    fontWeight: "bold",
    fontSize: "0.70rem",
    color: "#444",
    justifyContent: "center",
    borderBottom: "1px solid #ccc",
  };
}

export function RackUnitDiagram({
  heightU,
  front,
  rear,
  side,
  selectedPlacementId,
  onSelectPlacement,
  onDropAtCell,
  onEmptySlotClick,
  onMovePlacement,
}: Props) {
  const activePlacements = side === "front" ? front : rear;
  const activeOcc = buildOccupancy(heightU, activePlacements);
  const allWarnings = activeOcc.warnings.map((w) => ({
    side: side === "front" ? "Front" : "Rear",
    ...w,
  }));

  // Hovered state for drag-drop preview (was inside SideColumn, now lifted here)
  const [hovered, setHovered] = useState<{
    startU: number;
    heightU: number;
    valid: boolean;
  } | null>(null);

  function isInRange(cellU: number): boolean {
    if (!hovered) return false;
    return cellU >= hovered.startU && cellU <= hovered.startU + hovered.heightU - 1;
  }

  // units[0] = U1 (bottom); render top-to-bottom → reverse
  const rows = [...activeOcc.units].reverse();

  const sideLabel = side === "front" ? "Front" : "Rear";

  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.78rem", color: "#666" }}>
        {sideLabel} side · U{heightU} at top · U1 at bottom · Click empty row to place · Click row to inspect · Drag from palette · Drag placed row to move
      </p>

      {/* Legend */}
      <div
        aria-label="Diagram legend"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem 1rem",
          marginBottom: "0.5rem",
          fontSize: "0.75rem",
        }}
      >
        {[
          [colors.empty, colors.emptyBorder, "solid", "Available — click to place"],
          [colors.occupied, undefined, undefined, "Occupied — click to inspect"],
          [colors.occupiedSelected, undefined, undefined, "Selected"],
          [colors.incomplete, undefined, undefined, "Warning / incomplete"],
          ["#c8e6c0", "#4a7c3f", "dashed", "Drop target (drag)"],
        ].map(([bg, bdrColor, bdrStyle, label]) => (
          <span key={label as string}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                background: bg as string,
                ...(bdrColor ? { border: `1px ${bdrStyle} ${bdrColor}` } : {}),
                ...( label === "Selected" ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {} ),
                verticalAlign: "middle",
                marginRight: 3,
              }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          maxHeight: "60vh",
          overflowY: "auto",
          overflowX: "auto",
          border: "1px solid #ddd",
          borderRadius: 3,
          width: "100%",
        }}
      >
        {/* Header row */}
        <div
          aria-label="Rack diagram header"
          style={{
            display: "flex",
            background: colors.headerBg,
            position: "sticky",
            top: 0,
            zIndex: 1,
            minWidth: "fit-content",
          }}
        >
          <div style={headerCellStyle(COL_U)}>U</div>
          <div style={{ ...headerCellStyle(undefined, 2, 100), borderLeft: "2px solid #bbb" }} data-testid="diagram-col-name">
            Name
          </div>
          <div style={headerCellStyle(COL_TYPE)}>Type</div>
          <div style={headerCellStyle(undefined, 1, 60)}>Model</div>
          <div style={headerCellStyle(undefined, 1, 60)}>Code / SN</div>
          <div style={headerCellStyle(COL_RANGE)}>U range</div>
          <div style={{ ...headerCellStyle(COL_STATUS), borderRight: "none" }}>
            <span title="Status">St.</span>
          </div>
        </div>

        {/* Data rows */}
        <div style={{ minWidth: "fit-content" }}>
          {rows.map((state: UnitState, idx: number) => {
            const startU = heightU - idx;

            // Non-top continuation cell: invisible spacer (maintains grid alignment)
            if (state.kind === "occupied" && !state.isTop) {
              return <div key={idx} style={{ height: 0, overflow: "hidden" }} />;
            }

            // ── Occupied top row ─────────────────────────────────────────────
            if (state.kind === "occupied" && state.isTop) {
              const p = state.placement;
              const label = derivePlacementLabel(p);
              const rowH = label.effectiveHeightU * ROW_H;
              const isSelected = p.id === selectedPlacementId;
              const hoveredInvalid = isInRange(startU) && hovered !== null && !hovered.valid;

              const rowStyle: CSSProperties = {
                display: "flex",
                height: rowH,
                background: isSelected ? colors.occupiedSelected : colors.occupiedTop,
                color: colors.occupiedText,
                borderBottom: "2px solid rgba(0,0,0,0.18)",
                cursor: onMovePlacement ? "grab" : "pointer",
                userSelect: "none",
                ...(isSelected
                  ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` }
                  : {}),
                ...(hoveredInvalid ? { outline: "2px dashed #cc4444" } : {}),
              };

              // Metadata values
              const typeLabel = p.device_type ?? p.target_kind ?? "—";
              const modelLabel = label.model ?? "—";
              const codeLabel =
                p.target_code ??
                (p.target_asset_tag ? `Asset: ${p.target_asset_tag}` : null) ??
                (p.target_serial ? `SN: ${p.target_serial}` : null) ??
                "—";

              return (
                <div
                  key={idx}
                  data-testid={`placed-${side}-${p.id}`}
                  title={label.title}
                  style={rowStyle}
                  draggable={!!onMovePlacement}
                  onClick={() => onSelectPlacement(p)}
                  onDragStart={
                    onMovePlacement
                      ? (e) => {
                          const payload: DndPayload = {
                            kind: "placement",
                            placementId: p.id,
                            startU,
                            heightU: label.effectiveHeightU,
                            side,
                          };
                          e.dataTransfer.setData(DND_DATA_TYPE, encodeDndPayload(payload));
                          e.dataTransfer.effectAllowed = "move";
                          setActiveDragPayload(payload);
                        }
                      : undefined
                  }
                  onDragEnd={onMovePlacement ? () => setActiveDragPayload(null) : undefined}
                >
                  {/* U column */}
                  <div
                    style={{
                      ...dataCellStyle(COL_U),
                      background: colors.labelBg,
                      color: "#555",
                      justifyContent: "center",
                      borderRight: "1px solid #ccc",
                      alignSelf: "flex-start",
                      height: "100%",
                    }}
                  >
                    {startU}
                  </div>
                  {/* Name */}
                  <div
                    style={{
                      ...dataCellStyle(undefined, 2, 100),
                      fontWeight: 600,
                      borderLeft: "2px solid rgba(0,0,0,0.15)",
                      height: "100%",
                      alignItems: "flex-start",
                      paddingTop: 3,
                      flexDirection: "column",
                      gap: 1,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
                      {label.primary}
                    </span>
                  </div>
                  {/* Type */}
                  <div style={{ ...dataCellStyle(COL_TYPE), height: "100%", alignItems: "flex-start", paddingTop: 3 }}>
                    {typeLabel}
                  </div>
                  {/* Model */}
                  <div style={{ ...dataCellStyle(undefined, 1, 60), height: "100%", alignItems: "flex-start", paddingTop: 3 }}>
                    {modelLabel}
                  </div>
                  {/* Code / SN */}
                  <div style={{ ...dataCellStyle(undefined, 1, 60), height: "100%", alignItems: "flex-start", paddingTop: 3 }}>
                    {codeLabel}
                  </div>
                  {/* U range */}
                  <div style={{ ...dataCellStyle(COL_RANGE), height: "100%", alignItems: "flex-start", paddingTop: 3, justifyContent: "center" }}>
                    {label.uRange}
                  </div>
                  {/* Status */}
                  <div style={{ ...dataCellStyle(COL_STATUS), height: "100%", alignItems: "flex-start", paddingTop: 3, justifyContent: "center", borderRight: "none" }}>
                    —
                  </div>
                </div>
              );
            }

            // ── Incomplete row ───────────────────────────────────────────────
            if (state.kind === "incomplete") {
              const p = state.placement;
              const isSelected = p.id === selectedPlacementId;
              const rowStyle: CSSProperties = {
                display: "flex",
                height: ROW_H,
                background: isSelected ? colors.incompleteSelected : colors.incomplete,
                color: colors.incompleteText,
                borderBottom: "1px solid rgba(0,0,0,0.15)",
                cursor: "pointer",
                userSelect: "none",
                ...(isSelected
                  ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` }
                  : {}),
              };
              const codeLabel = p.target_code ?? p.code;
              return (
                <div key={idx} title={p.code} style={rowStyle} onClick={() => onSelectPlacement(p)}>
                  <div style={{ ...dataCellStyle(COL_U), background: colors.labelBg, color: "#555", justifyContent: "center", borderRight: "1px solid #ccc" }}>
                    {startU}
                  </div>
                  <div style={{ ...dataCellStyle(undefined, 2, 100), borderLeft: "2px solid rgba(0,0,0,0.15)" }}>
                    ⚠ {p.target_name ?? codeLabel}
                  </div>
                  <div style={dataCellStyle(COL_TYPE)}>{p.target_kind}</div>
                  <div style={dataCellStyle(undefined, 1, 60)}>—</div>
                  <div style={dataCellStyle(undefined, 1, 60)}>{codeLabel}</div>
                  <div style={{ ...dataCellStyle(COL_RANGE), justifyContent: "center" }}>{`U${p.start_u}`}</div>
                  <div style={{ ...dataCellStyle(COL_STATUS), justifyContent: "center", borderRight: "none" }}>⚠</div>
                </div>
              );
            }

            // ── Empty row: drop target ───────────────────────────────────────
            let rowStyle: CSSProperties = {
              display: "flex",
              height: ROW_H,
              background: colors.empty,
              borderBottom: `1px solid ${colors.emptyBorder}`,
              cursor: onEmptySlotClick ? "pointer" : "default",
              userSelect: "none",
            };
            if (isInRange(startU)) {
              rowStyle = hovered!.valid
                ? { ...rowStyle, background: "#c8e6c0", outline: "2px dashed #4a7c3f" }
                : { ...rowStyle, background: "#fde8e8", outline: "2px dashed #cc4444" };
            }

            return (
              <div
                key={idx}
                data-testid={`drop-cell-${side}-${startU}`}
                style={rowStyle}
                onClick={() => {
                  onSelectPlacement(null);
                  if (onEmptySlotClick) onEmptySlotClick(startU);
                }}
                onDragOver={
                  onDropAtCell || onMovePlacement
                    ? (e) => {
                        e.preventDefault();
                        const payload = getActiveDragPayload();
                        if (!payload) return;
                        const payloadH = getPayloadHeight(payload);
                        const excludeId =
                          payload.kind === "placement" ? payload.placementId : undefined;
                        const valid = canDropAt(
                          activeOcc.units,
                          startU,
                          payloadH,
                          excludeId,
                        );
                        e.dataTransfer.dropEffect =
                          payload.kind === "placement"
                            ? valid ? "move" : "none"
                            : valid ? "copy" : "none";
                        setHovered({ startU, heightU: payloadH, valid });
                      }
                    : undefined
                }
                onDragLeave={
                  onDropAtCell || onMovePlacement ? () => setHovered(null) : undefined
                }
                onDrop={
                  onDropAtCell || onMovePlacement
                    ? (e) => {
                        e.preventDefault();
                        setHovered(null);
                        const payload = getDragPayload(e);
                        if (!payload) return;
                        const payloadH = getPayloadHeight(payload);
                        const excludeId =
                          payload.kind === "placement" ? payload.placementId : undefined;
                        if (!canDropAt(activeOcc.units, startU, payloadH, excludeId)) return;
                        if (payload.kind === "placement") {
                          if (startU === payload.startU && side === payload.side) return;
                          onMovePlacement?.(side, payload.placementId, startU);
                        } else {
                          onDropAtCell?.(side, startU, payload);
                        }
                      }
                    : undefined
                }
              >
                <div
                  style={{
                    ...dataCellStyle(COL_U),
                    background: colors.labelBg,
                    color: "#888",
                    justifyContent: "center",
                    borderRight: "1px solid #ccc",
                  }}
                >
                  {startU}
                </div>
                <div style={{ ...dataCellStyle(undefined, 2, 100), borderLeft: "2px solid #bbb" }} />
                <div style={dataCellStyle(COL_TYPE)} />
                <div style={dataCellStyle(undefined, 1, 60)} />
                <div style={dataCellStyle(undefined, 1, 60)} />
                <div style={dataCellStyle(COL_RANGE)} />
                <div style={{ ...dataCellStyle(COL_STATUS), borderRight: "none" }} />
              </div>
            );
          })}
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div
          style={{
            marginTop: "0.5rem",
            padding: "0.4rem 0.6rem",
            background: "#fffbe6",
            border: "1px solid #e6c000",
            borderRadius: 3,
            fontSize: "0.78rem",
          }}
        >
          <strong>Diagram warnings:</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
            {allWarnings.map((w, i) => (
              <li key={i}>
                [{w.side}] {w.placementCode}: {w.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
