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

// ── Column layout ──────────────────────────────────────────────────────────────
// Columns: U (fixed) | Name (flex 2) | Model (flex 1) | Code / SN (flex 1)
const ROW_H = 22; // px per U row
const COL_U = 60; // px — wide enough for "U42–U42"

const colors = {
  empty: "#f8f8f8",
  emptyBorder: "#e0e0e0",
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
    justifyContent: "center",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    fontSize: "0.72rem",
  };
}

function headerCellStyle(width?: number, flex?: number, minWidth?: number): CSSProperties {
  return {
    ...dataCellStyle(width, flex, minWidth),
    fontWeight: "bold",
    fontSize: "0.70rem",
    color: "#444",
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
        {sideLabel} side · U{heightU} at top · U1 at bottom · Click empty row to place · Click to inspect · Drag from palette · Drag name cell to move · Drag to palette to unplace
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
          ["#357abd", undefined, undefined, "Occupied — click to inspect"],
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
                ...(label === "Selected" ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {}),
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
          <div
            style={{ ...headerCellStyle(undefined, 2, 100), borderLeft: "2px solid #bbb" }}
            data-testid="diagram-col-name"
          >
            Name
          </div>
          <div style={headerCellStyle(undefined, 1, 80)} data-testid="diagram-col-model">Model</div>
          <div
            style={{ ...headerCellStyle(undefined, 1, 80), borderRight: "none" }}
            data-testid="diagram-col-code"
          >
            Code / SN
          </div>
        </div>

        {/* Data rows */}
        <div style={{ minWidth: "fit-content" }}>
          {rows.map((state: UnitState, idx: number) => {
            const startU = heightU - idx;

            // Non-top continuation cell: invisible spacer
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
                cursor: "pointer",
                userSelect: "none",
                ...(isSelected ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {}),
                ...(hoveredInvalid ? { outline: "2px dashed #cc4444" } : {}),
              };

              const modelLabel = label.model ?? "—";
              const codeLabel =
                p.target_code ??
                (p.target_asset_tag ? `Asset: ${p.target_asset_tag}` : null) ??
                (p.target_serial ? `SN: ${p.target_serial}` : null) ??
                "—";

              return (
                <div
                  key={idx}
                  data-testid={`placed-row-${side}-${p.id}`}
                  title={label.title}
                  style={rowStyle}
                  onClick={() => onSelectPlacement(p)}
                >
                  {/* U column — static; shows full U range for multi-U placements */}
                  <div
                    style={{
                      ...dataCellStyle(COL_U),
                      background: colors.labelBg,
                      color: "#555",
                      borderRight: "1px solid #ccc",
                      height: "100%",
                      fontSize: "0.68rem",
                      fontWeight: 500,
                    }}
                  >
                    {label.uRange}
                  </div>

                  {/* Name — drag handle; testid here so E2E can target the draggable element */}
                  <div
                    data-testid={`placed-${side}-${p.id}`}
                    style={{
                      ...dataCellStyle(undefined, 2, 100),
                      fontWeight: 600,
                      borderLeft: "2px solid rgba(0,0,0,0.15)",
                      height: "100%",
                      cursor: onMovePlacement ? "grab" : "pointer",
                    }}
                    draggable={!!onMovePlacement}
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
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                        textAlign: "center",
                      }}
                    >
                      {label.primary}
                    </span>
                  </div>

                  {/* Model */}
                  <div style={{ ...dataCellStyle(undefined, 1, 80), height: "100%" }}>
                    {modelLabel}
                  </div>

                  {/* Code / SN */}
                  <div style={{ ...dataCellStyle(undefined, 1, 80), height: "100%", borderRight: "none" }}>
                    {codeLabel}
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
                ...(isSelected ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {}),
              };
              const codeLabel = p.target_code ?? p.code;
              return (
                <div key={idx} title={p.code} style={rowStyle} onClick={() => onSelectPlacement(p)}>
                  <div
                    style={{
                      ...dataCellStyle(COL_U),
                      background: colors.labelBg,
                      color: "#555",
                      borderRight: "1px solid #ccc",
                      fontSize: "0.68rem",
                    }}
                  >
                    {`U${p.start_u}`}
                  </div>
                  <div style={{ ...dataCellStyle(undefined, 2, 100), borderLeft: "2px solid rgba(0,0,0,0.15)", justifyContent: "flex-start" }}>
                    ⚠ {p.target_name ?? codeLabel}
                  </div>
                  <div style={dataCellStyle(undefined, 1, 80)}>—</div>
                  <div style={{ ...dataCellStyle(undefined, 1, 80), borderRight: "none" }}>{codeLabel}</div>
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
                        const valid = canDropAt(activeOcc.units, startU, payloadH, excludeId);
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
                    borderRight: "1px solid #ccc",
                    fontSize: "0.68rem",
                  }}
                >
                  {`U${startU}`}
                </div>
                <div style={{ ...dataCellStyle(undefined, 2, 100), borderLeft: "2px solid #bbb" }} />
                <div style={dataCellStyle(undefined, 1, 80)} />
                <div style={{ ...dataCellStyle(undefined, 1, 80), borderRight: "none" }} />
              </div>
            );
          })}
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div
          style={{
            marginTop: "0.5rem",
            paddingTop: 6,
            paddingBottom: 6,
            paddingLeft: 10,
            paddingRight: 10,
            background: "#fffbe6",
            border: "1px solid #e6c000",
            borderRadius: 3,
            fontSize: "0.78rem",
          }}
        >
          <strong>Diagram warnings:</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem", paddingLeft: 0 }}>
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
