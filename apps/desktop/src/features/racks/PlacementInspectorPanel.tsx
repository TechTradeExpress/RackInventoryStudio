import type { CSSProperties } from "react";
import type { PlacementDto } from "../../api/tauriClient";

interface Props {
  placement: PlacementDto | null;
  side: "Front" | "Rear" | null;
}

const NULL_DISPLAY = "—";

const tdLabel: CSSProperties = {
  padding: "0.2rem 0.5rem",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #eee",
  width: "45%",
  verticalAlign: "top",
};

const tdValue: CSSProperties = {
  padding: "0.2rem 0.5rem",
  fontFamily: "monospace",
  borderBottom: "1px solid #eee",
  wordBreak: "break-all",
};

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NULL_DISPLAY;
  return String(value);
}

export function PlacementInspectorPanel({ placement, side }: Props) {
  if (!placement) {
    return (
      <div
        style={{
          padding: "0.6rem 0.75rem",
          background: "#f8f8f8",
          border: "1px solid #e0e0e0",
          borderRadius: 3,
          fontSize: "0.82rem",
          color: "#888",
        }}
      >
        No placement selected. Click a cell in the diagram or a row in the tables below.
      </div>
    );
  }

  const rows: [string, string | number | null | undefined][] = [
    ["Code", placement.code],
    ["Side", side],
    ["Target kind", placement.target_kind],
    ["Target code", placement.target_code],
    ["Target name", placement.target_name],
    ["Target ID", placement.target_id],
    ["Device type", placement.device_type],
    ["Start U", placement.start_u],
    ["End U", placement.end_u],
    ["Height U (explicit)", placement.height_u],
    ["Height U (effective)", placement.effective_height_u],
    ["Note", placement.note],
    [
      "Tags",
      placement.tags.length > 0 ? placement.tags.join(", ") : null,
    ],
  ];

  return (
    <div
      style={{
        border: "1px solid #c5d5e8",
        borderRadius: 3,
        background: "#f0f5fb",
        fontSize: "0.82rem",
      }}
    >
      <div
        style={{
          padding: "0.35rem 0.6rem",
          background: "#d8e6f5",
          borderBottom: "1px solid #c5d5e8",
          fontWeight: "bold",
          fontSize: "0.8rem",
        }}
      >
        Placement Inspector —{" "}
        <span style={{ fontFamily: "monospace" }}>{placement.code}</span>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={tdLabel}>{label}</td>
              <td style={tdValue}>{display(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
