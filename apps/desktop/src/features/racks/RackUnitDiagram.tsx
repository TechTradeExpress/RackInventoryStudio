import type { CSSProperties } from "react";
import type { PlacementDto } from "../../api/tauriClient";
import { buildOccupancy, type UnitState } from "./rackOccupancy";

interface Props {
  heightU: number;
  front: PlacementDto[];
  rear: PlacementDto[];
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
  incomplete: "#e8a020",
  incompleteText: "#fff",
  labelBg: "#f0f0f0",
  headerBg: "#e8e8e8",
};

function cellStyle(state: UnitState, isTopOfStack: boolean): CSSProperties {
  if (state.kind === "empty") {
    return {
      background: colors.empty,
      borderBottom: `1px solid ${colors.emptyBorder}`,
      height: ROW_H,
    };
  }
  if (state.kind === "incomplete") {
    return {
      background: colors.incomplete,
      borderBottom: "1px solid rgba(0,0,0,0.15)",
      height: ROW_H,
      color: colors.incompleteText,
      fontSize: "0.72rem",
      overflow: "hidden",
      whiteSpace: "nowrap" as const,
      textOverflow: "ellipsis",
      padding: "0 4px",
    };
  }
  // occupied
  return {
    background: isTopOfStack ? colors.occupiedTop : colors.occupied,
    borderBottom: isTopOfStack ? "2px solid rgba(0,0,0,0.2)" : "1px solid rgba(0,0,0,0.1)",
    height: ROW_H,
    color: colors.occupiedText,
    fontSize: "0.72rem",
    overflow: "hidden",
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis",
    padding: "0 4px",
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

function SideColumn({ units }: { units: UnitState[] }) {
  // units[0] = U1 (bottom), render top-to-bottom so reverse
  const rows = [...units].reverse();
  return (
    <div style={{ width: SIDE_W, flexShrink: 0 }}>
      {rows.map((state, idx) => {
        // When reversed: idx 0 = highest U = visual top
        // isTop in occupancy means top of the physical stack = highest U = rendered first
        const label = cellLabel(state);
        return (
          <div
            key={idx}
            title={state.kind !== "empty" ? state.placement.code : undefined}
            style={cellStyle(state, state.kind === "occupied" && state.isTop)}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function RackUnitDiagram({ heightU, front, rear }: Props) {
  const frontOcc = buildOccupancy(heightU, front);
  const rearOcc = buildOccupancy(heightU, rear);

  const allWarnings = [
    ...frontOcc.warnings.map((w) => ({ side: "Front", ...w })),
    ...rearOcc.warnings.map((w) => ({ side: "Rear", ...w })),
  ];

  // U-number column: rendered top-to-bottom, so heightU down to 1
  const uNumbers = Array.from({ length: heightU }, (_, i) => heightU - i);

  return (
    <div>
      <p style={{ margin: "0 0 0.4rem", fontSize: "0.78rem", color: "#666" }}>
        U numbers shown top (U{heightU}) to bottom (U1). Hover a cell for placement code.
      </p>

      {/* Legend */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem", fontSize: "0.75rem" }}>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, background: colors.occupied, verticalAlign: "middle", marginRight: 3 }} />
          Occupied
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, background: colors.incomplete, verticalAlign: "middle", marginRight: 3 }} />
          Incomplete height
        </span>
        <span>
          <span style={{ display: "inline-block", width: 12, height: 12, background: colors.empty, border: `1px solid ${colors.emptyBorder}`, verticalAlign: "middle", marginRight: 3 }} />
          Empty
        </span>
      </div>

      <div style={{ display: "flex", fontFamily: "monospace", fontSize: "0.78rem", overflowX: "auto" }}>
        {/* U-number gutter */}
        <div style={{ width: LABEL_W, flexShrink: 0, background: colors.labelBg }}>
          <div style={{ height: ROW_H, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", background: colors.headerBg, borderBottom: "1px solid #ccc" }}>
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

        {/* Front column */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ height: ROW_H, width: SIDE_W, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", background: colors.headerBg, borderBottom: "1px solid #ccc", borderLeft: "2px solid #bbb" }}>
            Front
          </div>
          <div style={{ borderLeft: "2px solid #bbb" }}>
            <SideColumn units={frontOcc.units} />
          </div>
        </div>

        {/* Rear column */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ height: ROW_H, width: SIDE_W, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", background: colors.headerBg, borderBottom: "1px solid #ccc", borderLeft: "1px solid #bbb" }}>
            Rear
          </div>
          <div style={{ borderLeft: "1px solid #bbb" }}>
            <SideColumn units={rearOcc.units} />
          </div>
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.6rem", background: "#fffbe6", border: "1px solid #e6c000", borderRadius: 3, fontSize: "0.78rem" }}>
          <strong>Diagram warnings:</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0 }}>
            {allWarnings.map((w, i) => (
              <li key={i}>[{w.side}] {w.placementCode}: {w.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
