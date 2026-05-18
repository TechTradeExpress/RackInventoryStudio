import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import {
  getRackDetail,
  type PlacementDto,
  type RackDetailDto,
  type RackSummaryDto,
} from "../../api/tauriClient";

interface Props {
  rack: RackSummaryDto;
}

function PlacementTable({ placements }: { placements: PlacementDto[] }) {
  if (placements.length === 0) {
    return <p style={common.hint}>No placements.</p>;
  }
  return (
    <table style={{ ...common.table, fontSize: "0.82rem" }}>
      <thead>
        <tr>
          {["U", "End U", "Code", "Kind", "Target", "Name", "Type", "Note"].map(
            (h) => (
              <th key={h} style={common.th}>
                {h}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {placements.map((p) => (
          <tr key={p.id}>
            <td style={common.td}>{p.start_u}</td>
            <td style={common.td}>{p.end_u ?? ""}</td>
            <td style={{ ...common.td, fontFamily: "monospace" }}>{p.code}</td>
            <td style={common.td}>{p.target_kind}</td>
            <td style={{ ...common.td, fontFamily: "monospace" }}>
              {p.target_code ?? p.target_id}
            </td>
            <td style={common.td}>{p.target_name ?? ""}</td>
            <td style={common.td}>{p.device_type ?? ""}</td>
            <td style={common.td}>{p.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RackDetailPanel({ rack }: Props) {
  const [detail, setDetail] = useState<RackDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    getRackDetail(rack.id)
      .then(setDetail)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [rack.id]);

  return (
    <section style={{ ...common.section, borderTop: "2px solid #ccc" }}>
      <h2 style={common.h2}>
        Rack Detail —{" "}
        <span style={{ fontFamily: "monospace" }}>{rack.code}</span>
      </h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {detail && (
        <>
          <table style={{ ...common.table, marginBottom: "1rem" }}>
            <tbody>
              {(
                [
                  ["Code", detail.code],
                  ["Name", detail.name],
                  ["Location", detail.location_code],
                  ["Height (U)", detail.height_u],
                  ["Row", detail.row ?? "—"],
                  ["Front placements", detail.front.length],
                  ["Rear placements", detail.rear.length],
                ] as [string, string | number][]
              ).map(([label, value]) => (
                <tr key={label}>
                  <td style={common.th}>{label}</td>
                  <td style={common.td}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={common.h3}>Front</h3>
          <PlacementTable placements={detail.front} />

          <h3 style={{ ...common.h3, marginTop: "0.75rem" }}>Rear</h3>
          <PlacementTable placements={detail.rear} />
        </>
      )}
    </section>
  );
}
