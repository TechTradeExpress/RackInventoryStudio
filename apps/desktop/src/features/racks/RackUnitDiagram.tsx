import { useState, type CSSProperties } from "react";
import type { PlacementDto } from "../../api/tauriClient";
import { buildOccupancy, type UnitState } from "./rackOccupancy";
import {
  getDragPayload,
  getActiveDragPayload,
  getPayloadHeight,
  canDropAt,
} from "./dndHelpers";
import type { DndPayload } from "./dndTypes";

interface Props {
  heightU: number;
  front: PlacementDto[];
  rear: PlacementDto[];
  /** Which side to display in the diagram. */
  side: "front" | "rear";
  selectedPlacementId: string | null;
  onSelectPlacement: (placement: PlacementDto | null) => void;
  onDropAtCell?: (side: "front" | "rear", startU: number, payload: DndPayload) => void;
}

const ROW_H = 22; // px per U row
const LABEL_W = 36; // px for U-number column
const SIDE_W = 200; // px per side column

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

function cellStyle(
  state: UnitState,
  isTopOfStack: boolean,
  isSelected: boolean,
): CSSProperties {
  if (state.kind === "empty") {
    return {
      background: colors.empty,
      borderBottom: `1px solid ${colors.emptyBorder}`,
      height: ROW_H,
      cursor: "default",
    };
  }

  const base: CSSProperties = {
    height: ROW_H,
    fontSize: "0.72rem",
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
    padding: "0 4px",
    cursor: "pointer",
  };

  if (isSelected) {
    base.boxShadow = `inset 0 0 0 2px ${colors.selectionRing}`;
  }

  if (state.kind === "incomplete") {
    return {
      ...base,
      background: isSelected ? colors.incompleteSelected : colors.incomplete,
      borderBottom: "1px solid rgba(0,0,0,0.15)",
      color: colors.incompleteText,
    };
  }

  // occupied
  return {
    ...base,
    background: isSelected
      ? colors.occupiedSelected
      : isTopOfStack
        ? colors.occupiedTop
        : colors.occupied,
    borderBottom: isTopOfStack
      ? "2px solid rgba(0,0,0,0.2)"
      : "1px solid rgba(0,0,0,0.1)",
    color: colors.occupiedText,
  };
}

function cellLabel(state: UnitState): string {
  if (state.kind === "empty") return "";
  if (state.kind === "incomplete") {
    const p = state.placement;
    return `⚠ ${p.target_code ?? p.code}`;
  }
  // Show label only at the top row of a grouped placement
  if (!state.isTop) return "";
  const p = state.placement;
  return p.target_code ?? p.target_name ?? p.code;
}

interface SideColumnProps {
  side: "front" | "rear";
  units: UnitState[];
  selectedPlacementId: string | null;
  onSelectPlacement: (placement: PlacementDto | null) => void;
  onDropAtCell?: (side: "front" | "rear", startU: number, payload: DndPayload) => void;
}

function SideColumn({
  side,
  units,
  selectedPlacementId,
  onSelectPlacement,
  onDropAtCell,
}: SideColumnProps) {
  const [hovered, setHovered] = useState<{ idx: number; valid: boolean } | null>(null);

  // units[0] = U1 (bottom), render top-to-bottom so reverse
  const rows = [...units].reverse();
  return (
    <div style={{ width: SIDE_W, flexShrink: 0 }}>
      {rows.map((state, idx) => {
        // When reversed: idx 0 = highest U = visual top
        // rows[idx] = units[units.length - 1 - idx] which is U(units.length - idx)
        const startU = units.length - idx;
        const isSelected =
          state.kind !== "empty" &&
          state.placement.id === selectedPlacementId;
        const label = cellLabel(state);

        const baseStyle = cellStyle(
          state,
          state.kind === "occupied" && state.isTop,
          isSelected,
        );

        let style: CSSProperties = baseStyle;
        if (state.kind === "empty" && hovered?.idx === idx) {
          style = hovered.valid
            ? { ...baseStyle, background: "#c8e6c0", outline: "2px dashed #4a7c3f" }
            : { ...baseStyle, background: "#fde8e8", outline: "2px dashed #cc4444" };
        }

        return (
          <div
            key={idx}
            title={state.kind !== "empty" ? state.placement.code : undefined}
            data-testid={state.kind === "empty" ? `drop-cell-${side}-${startU}` : undefined}
            style={style}
            onClick={() => {
              if (state.kind === "empty") {
                onSelectPlacement(null);
              } else {
                onSelectPlacement(state.placement);
              }
            }}
            onDragOver={
              state.kind === "empty" && onDropAtCell
                ? (e) => {
                    e.preventDefault();
                    const payload = getActiveDragPayload();
                    const valid =
                      payload !== null &&
                      canDropAt(units, startU, getPayloadHeight(payload));
                    e.dataTransfer.dropEffect = valid ? "copy" : "none";
                    setHovered({ idx, valid });
                  }
                : undefined
            }
            onDragLeave={
              state.kind === "empty" && onDropAtCell
                ? () => setHovered(null)
                : undefined
            }
            onDrop={
              state.kind === "empty" && onDropAtCell
                ? (e) => {
                    e.preventDefault();
                    setHovered(null);
                    const payload = getDragPayload(e);
                    if (!payload) return;
                    if (!canDropAt(units, startU, getPayloadHeight(payload))) return;
                    onDropAtCell(side, startU, payload);
                  }
                : undefined
            }
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function RackUnitDiagram({
  heightU,
  front,
  rear,
  side,
  selectedPlacementId,
  onSelectPlacement,
  onDropAtCell,
}: Props) {
  const activePlacements = side === "front" ? front : rear;
  const activeOcc = buildOccupancy(heightU, activePlacements);

  const allWarnings = activeOcc.warnings.map((w) => ({ side: side === "front" ? "Front" : "Rear", ...w }));

  // U-number column: rendered top-to-bottom, so heightU down to 1
  const uNumbers = Array.from({ length: heightU }, (_, i) => heightU - i);

  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.78rem", color: "#666" }}>
        U numbers shown top (U{heightU}) to bottom (U1). Click a cell to
        inspect the placement.
      </p>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "0.5rem",
          fontSize: "0.75rem",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: colors.occupied,
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          Occupied
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: colors.incomplete,
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          Incomplete height
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: colors.empty,
              border: `1px solid ${colors.emptyBorder}`,
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          Empty
        </span>
      </div>

      <div
        style={{
          maxHeight: "60vh",
          overflowY: "auto",
          overflowX: "auto",
          border: "1px solid #ddd",
          borderRadius: 3,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: "0.78rem",
          }}
        >
          {/* U-number gutter */}
          <div
            style={{ width: LABEL_W, flexShrink: 0, background: colors.labelBg }}
          >
            <div
              style={{
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                background: colors.headerBg,
                borderBottom: "1px solid #ccc",
              }}
            >
              U
            </div>
            {uNumbers.map((u) => (
              <div
                key={u}
                style={{
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderBottom: "1px solid #e0e0e0",
                  color: "#555",
                  fontSize: "0.72rem",
                }}
              >
                {u}
              </div>
            ))}
          </div>

          {/* Active side column */}
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                height: ROW_H,
                width: SIDE_W,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                background: colors.headerBg,
                borderBottom: "1px solid #ccc",
                borderLeft: "2px solid #bbb",
              }}
            >
              {side === "front" ? "Front" : "Rear"}
            </div>
            <div style={{ borderLeft: "2px solid #bbb" }}>
              <SideColumn
                side={side}
                units={activeOcc.units}
                selectedPlacementId={selectedPlacementId}
                onSelectPlacement={onSelectPlacement}
                onDropAtCell={onDropAtCell}
              />
            </div>
          </div>
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
