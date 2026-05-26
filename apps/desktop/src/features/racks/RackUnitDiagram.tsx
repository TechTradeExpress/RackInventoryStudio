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

// ── Layout constants ───────────────────────────────────────────────────────────
const ROW_H = 22;    // px per rack unit row
const COL_U = 60;    // px — U gutter width
const HEADER_H = 28; // px — header row height

const colors = {
  empty: "#f8f8f8",
  emptyBorder: "#e0e0e0",
  occupiedBg: "#357abd",
  occupiedText: "#fff",
  occupiedSelected: "#1d4d8a",
  incomplete: "#e8a020",
  incompleteText: "#fff",
  incompleteSelected: "#9b6010",
  selectionRing: "#ffd700",
  gutterBg: "#f0f0f0",
  gutterText: "#888",
  headerBg: "#e8e8e8",
};

function contentCell(flex?: number, minWidth?: number, extra?: CSSProperties): CSSProperties {
  return {
    flex,
    minWidth,
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
    ...extra,
  };
}

function headerCell(flex?: number, minWidth?: number): CSSProperties {
  return {
    ...contentCell(flex, minWidth),
    fontWeight: "bold",
    fontSize: "0.70rem",
    color: "#444",
    borderBottom: "1px solid #ccc",
    paddingTop: 4,
    paddingBottom: 4,
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

  // units[0] = U1 (bottom of rack); render top-to-bottom → reverse
  const rows = [...activeOcc.units].reverse();
  const sideLabel = side === "front" ? "Front" : "Rear";

  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.78rem", color: "#666" }}>
        {sideLabel} side · U{heightU} at top · U1 at bottom · Click empty row to place · Click to inspect · Drag from palette · Drag card to move · Drag to palette to unplace
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

      {/* Rack grid */}
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
        <div style={{ display: "flex", minWidth: "fit-content" }}>

          {/* ── U gutter: independent rack-unit numbering ──────────────────
              One cell per rack unit. Always neutral — never carries selection
              styling, drag handles, or placement metadata.               */}
          <div style={{ width: COL_U, flexShrink: 0 }}>
            {/* U header */}
            <div
              style={{
                height: HEADER_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: colors.headerBg,
                borderRight: "1px solid #bbb",
                borderBottom: "1px solid #ccc",
                fontWeight: "bold",
                fontSize: "0.70rem",
                color: "#444",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}
            >
              U
            </div>

            {/* One cell per rack unit — always rendered regardless of occupancy */}
            {rows.map((_: UnitState, idx: number) => {
              const startU = heightU - idx;
              return (
                <div
                  key={idx}
                  data-testid={`u-cell-${side}-${startU}`}
                  style={{
                    height: ROW_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: colors.gutterBg,
                    color: colors.gutterText,
                    borderRight: "1px solid #ccc",
                    borderBottom: `1px solid ${colors.emptyBorder}`,
                    fontSize: "0.68rem",
                    fontWeight: 500,
                    userSelect: "none",
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingLeft: 4,
                    paddingRight: 4,
                  }}
                >
                  {`U${startU}`}
                </div>
              );
            })}
          </div>

          {/* ── Content area: placement cards ──────────────────────────────
              Multi-U placement cards span their full height here.
              Selection ring and drag handle live on the card, not the gutter. */}
          <div style={{ flex: 1, minWidth: 340 }}>
            {/* Content header */}
            <div
              aria-label="Rack diagram header"
              style={{
                display: "flex",
                height: HEADER_H,
                background: colors.headerBg,
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <div style={headerCell(2, 100)} data-testid="diagram-col-name">Name</div>
              <div style={headerCell(1, 80)} data-testid="diagram-col-model">Model</div>
              <div style={headerCell(1, 80)} data-testid="diagram-col-code">Code / SN</div>
              <div style={{ ...headerCell(1, 80), borderRight: "none" }} data-testid="diagram-col-asset">Asset tag</div>
            </div>

            {/* Content rows */}
            {rows.map((state: UnitState, idx: number) => {
              const startU = heightU - idx;

              // Non-top continuation cell: the card above already spans this height
              if (state.kind === "occupied" && !state.isTop) {
                return null;
              }

              // ── Occupied placement card ────────────────────────────────
              if (state.kind === "occupied" && state.isTop) {
                const p = state.placement;
                const label = derivePlacementLabel(p);
                const cardH = label.effectiveHeightU * ROW_H;
                const isSelected = p.id === selectedPlacementId;
                const hoveredInvalid = isInRange(startU) && hovered !== null && !hovered.valid;

                const modelLabel = label.model ?? "—";
                const codeLabel =
                  p.target_code ??
                  (p.target_serial ? `SN: ${p.target_serial}` : null) ??
                  "—";
                const assetLabel = p.target_asset_tag ?? "—";

                return (
                  <div
                    key={idx}
                    data-testid={`placed-${side}-${p.id}`}
                    title={label.title}
                    style={{
                      display: "flex",
                      height: cardH,
                      background: isSelected ? colors.occupiedSelected : colors.occupiedBg,
                      color: colors.occupiedText,
                      borderBottom: "2px solid rgba(0,0,0,0.18)",
                      cursor: onMovePlacement ? "grab" : "pointer",
                      userSelect: "none",
                      ...(isSelected ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {}),
                      ...(hoveredInvalid ? { outline: "2px dashed #cc4444" } : {}),
                    }}
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
                            // Custom drag image — palette-card shape with placed/occupied color.
                            // Created off-screen and cleaned up after the browser captures it.
                            try {
                              const img = document.createElement("div");
                              img.style.cssText =
                                "position:absolute;left:-9999px;top:0;" +
                                "display:flex;align-items:center;gap:6px;" +
                                "padding:4px 10px;background:#357abd;color:#fff;" +
                                "border-radius:4px;font-size:12px;font-weight:600;" +
                                "white-space:nowrap;overflow:hidden;";
                              img.textContent = `⠿ ${label.primary} · ${label.effectiveHeightU}U`;
                              document.body.appendChild(img);
                              e.dataTransfer.setDragImage(img, 14, 14);
                              requestAnimationFrame(() => { img.parentNode?.removeChild(img); });
                            } catch { /* no-op in test environments */ }
                          }
                        : undefined
                    }
                    onDragEnd={onMovePlacement ? () => setActiveDragPayload(null) : undefined}
                  >
                    <div style={contentCell(2, 100, { height: "100%", fontWeight: 600 })}>
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
                    <div style={contentCell(1, 80, { height: "100%" })}>{modelLabel}</div>
                    <div style={contentCell(1, 80, { height: "100%" })}>{codeLabel}</div>
                    <div style={contentCell(1, 80, { height: "100%", borderRight: "none" })}>{assetLabel}</div>
                  </div>
                );
              }

              // ── Incomplete row ─────────────────────────────────────────
              if (state.kind === "incomplete") {
                const p = state.placement;
                const isSelected = p.id === selectedPlacementId;
                const codeLabel = p.target_code ?? p.code;
                return (
                  <div
                    key={idx}
                    title={p.code}
                    style={{
                      display: "flex",
                      height: ROW_H,
                      background: isSelected ? colors.incompleteSelected : colors.incomplete,
                      color: colors.incompleteText,
                      borderBottom: "1px solid rgba(0,0,0,0.15)",
                      cursor: "pointer",
                      userSelect: "none",
                      ...(isSelected ? { boxShadow: `inset 0 0 0 2px ${colors.selectionRing}` } : {}),
                    }}
                    onClick={() => onSelectPlacement(p)}
                  >
                    <div style={{ ...contentCell(2, 100), justifyContent: "flex-start" }}>
                      ⚠ {p.target_name ?? codeLabel}
                    </div>
                    <div style={contentCell(1, 80)}>—</div>
                    <div style={contentCell(1, 80)}>{codeLabel}</div>
                    <div style={contentCell(1, 80, { borderRight: "none" })}>—</div>
                  </div>
                );
              }

              // ── Empty row: drop target ─────────────────────────────────
              let dropStyle: CSSProperties = {
                display: "flex",
                height: ROW_H,
                background: colors.empty,
                borderBottom: `1px solid ${colors.emptyBorder}`,
                cursor: onEmptySlotClick ? "pointer" : "default",
                userSelect: "none",
              };
              if (isInRange(startU)) {
                dropStyle = hovered!.valid
                  ? { ...dropStyle, background: "#c8e6c0", outline: "2px dashed #4a7c3f" }
                  : { ...dropStyle, background: "#fde8e8", outline: "2px dashed #cc4444" };
              }

              return (
                <div
                  key={idx}
                  data-testid={`drop-cell-${side}-${startU}`}
                  style={dropStyle}
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
                          const payload = getDragPayload(e) ?? getActiveDragPayload();
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
                  <div style={contentCell(2, 100)} />
                  <div style={contentCell(1, 80)} />
                  <div style={contentCell(1, 80)} />
                  <div style={contentCell(1, 80, { borderRight: "none" })} />
                </div>
              );
            })}
          </div>
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
