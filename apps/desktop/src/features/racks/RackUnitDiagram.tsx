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
import { derivePlacementLabel, type PlacementLabelData } from "./rackPlacementLabel";

interface Props {
  heightU: number;
  front: PlacementDto[];
  rear: PlacementDto[];
  /** Which side to display in the diagram. */
  side: "front" | "rear";
  selectedPlacementId: string | null;
  onSelectPlacement: (placement: PlacementDto | null) => void;
  onDropAtCell?: (side: "front" | "rear", startU: number, payload: DndPayload) => void;
  /** Called when an empty slot is clicked. Opens the place modal. */
  onEmptySlotClick?: (startU: number) => void;
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

function PlacementLabelContent({ label }: { label: PlacementLabelData }) {
  const { primary, model, serial, asset, effectiveHeightU } = label;

  if (effectiveHeightU === 1) {
    return (
      <span className="rpl-primary rpl-compact">
        {primary}{model ? ` · ${model}` : ""}
      </span>
    );
  }

  if (effectiveHeightU === 2) {
    const secondary = [model, serial, asset].filter(Boolean).join(" · ");
    return (
      <>
        <span className="rpl-primary">{primary}</span>
        {secondary && <span className="rpl-secondary">{secondary}</span>}
      </>
    );
  }

  // 3U+: full stacked label
  return (
    <>
      <span className="rpl-primary">{primary}</span>
      {model  && <span className="rpl-secondary">{model}</span>}
      {serial && <span className="rpl-meta">{serial}</span>}
      {asset  && <span className="rpl-meta">{asset}</span>}
    </>
  );
}

interface SideColumnProps {
  side: "front" | "rear";
  units: UnitState[];
  selectedPlacementId: string | null;
  onSelectPlacement: (placement: PlacementDto | null) => void;
  onDropAtCell?: (side: "front" | "rear", startU: number, payload: DndPayload) => void;
  onEmptySlotClick?: (startU: number) => void;
}

function SideColumn({
  side,
  units,
  selectedPlacementId,
  onSelectPlacement,
  onDropAtCell,
  onEmptySlotClick,
}: SideColumnProps) {
  const [hovered, setHovered] = useState<{
    startU: number;
    heightU: number;
    valid: boolean;
  } | null>(null);

  function isInRange(cellU: number): boolean {
    if (!hovered) return false;
    return cellU >= hovered.startU && cellU <= hovered.startU + hovered.heightU - 1;
  }

  // units[0] = U1 (bottom), render top-to-bottom so reverse
  const rows = [...units].reverse();
  return (
    <div style={{ width: SIDE_W, flexShrink: 0 }}>
      {rows.map((state, idx) => {
        const startU = units.length - idx;

        // Non-top continuation cells of a multi-U occupied block: invisible spacer.
        // Height stays 0 so the top cell can span the full block height without
        // pushing subsequent rows out of alignment with the U-number gutter.
        if (state.kind === "occupied" && !state.isTop) {
          return <div key={idx} style={{ height: 0, overflow: "hidden" }} />;
        }

        const isSelected =
          state.kind !== "empty" &&
          state.placement.id === selectedPlacementId;

        const baseStyle = cellStyle(
          state,
          state.kind === "occupied" && state.isTop,
          isSelected,
        );

        // ── Occupied top cell: span full U height, centered label ──────────────
        if (state.kind === "occupied" && state.isTop) {
          const label = derivePlacementLabel(state.placement);
          const hoveredInvalid = isInRange(startU) && hovered !== null && !hovered.valid;
          const style: CSSProperties = {
            ...baseStyle,
            height: label.effectiveHeightU * ROW_H,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 1,
            overflow: "hidden",
            ...(hoveredInvalid ? { outline: "2px dashed #cc4444" } : {}),
          };
          return (
            <div
              key={idx}
              data-testid={`placed-${side}-${state.placement.id}`}
              title={label.title}
              style={style}
              onClick={() => onSelectPlacement(state.placement)}
            >
              <PlacementLabelContent label={label} />
            </div>
          );
        }

        // ── Incomplete cell ─────────────────────────────────────────────────────
        if (state.kind === "incomplete") {
          const p = state.placement;
          const hoveredInvalid = isInRange(startU) && hovered !== null && !hovered.valid;
          return (
            <div
              key={idx}
              title={p.code}
              style={hoveredInvalid ? { ...baseStyle, outline: "2px dashed #cc4444" } : baseStyle}
              onClick={() => onSelectPlacement(p)}
            >
              {`⚠ ${p.target_code ?? p.code}`}
            </div>
          );
        }

        // ── Empty cell: drop target ─────────────────────────────────────────────
        // Highlight the full height-U preview range when dragging over this cell.
        let style: CSSProperties = {
          ...baseStyle,
          cursor: onEmptySlotClick ? "pointer" : "default",
        };
        if (isInRange(startU)) {
          style = hovered!.valid
            ? { ...style, background: "#c8e6c0", outline: "2px dashed #4a7c3f" }
            : { ...style, background: "#fde8e8", outline: "2px dashed #cc4444" };
        }

        return (
          <div
            key={idx}
            data-testid={`drop-cell-${side}-${startU}`}
            style={style}
            onClick={() => {
              onSelectPlacement(null);
              if (onEmptySlotClick) onEmptySlotClick(startU);
            }}
            onDragOver={
              onDropAtCell
                ? (e) => {
                    e.preventDefault();
                    const payload = getActiveDragPayload();
                    if (!payload) return;
                    const payloadH = getPayloadHeight(payload);
                    const valid = canDropAt(units, startU, payloadH);
                    e.dataTransfer.dropEffect = valid ? "copy" : "none";
                    setHovered({ startU, heightU: payloadH, valid });
                  }
                : undefined
            }
            onDragLeave={onDropAtCell ? () => setHovered(null) : undefined}
            onDrop={
              onDropAtCell
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
          />
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
  onEmptySlotClick,
}: Props) {
  const activePlacements = side === "front" ? front : rear;
  const activeOcc = buildOccupancy(heightU, activePlacements);

  const allWarnings = activeOcc.warnings.map((w) => ({ side: side === "front" ? "Front" : "Rear", ...w }));

  // U-number column: rendered top-to-bottom, so heightU down to 1
  const uNumbers = Array.from({ length: heightU }, (_, i) => heightU - i);

  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.78rem", color: "#666" }}>
        U{heightU} at top · U1 at bottom · Click an empty slot to place · Click an occupied block to inspect · Drag from palette
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
          Available — click to place
        </span>
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
          Occupied — click to inspect
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: colors.occupiedSelected,
              boxShadow: `inset 0 0 0 2px ${colors.selectionRing}`,
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          Selected
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
          Warning / incomplete
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              background: "#c8e6c0",
              border: "1px dashed #4a7c3f",
              verticalAlign: "middle",
              marginRight: 3,
            }}
          />
          Drop target (drag)
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
                onEmptySlotClick={onEmptySlotClick}
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
