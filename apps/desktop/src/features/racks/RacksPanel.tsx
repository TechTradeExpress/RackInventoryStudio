import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import { listRacks, type RackSummaryDto } from "../../api/tauriClient";

interface Props {
  repoPath: string;
}

export function RacksPanel({ repoPath }: Props) {
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Racks</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && racks.length === 0 && (
        <p style={common.hint}>No racks found.</p>
      )}

      {racks.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {[
                "Code",
                "Name",
                "Location",
                "Height (U)",
                "Row",
                "Placements",
              ].map((h) => (
                <th key={h} style={common.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {racks.map((rack) => (
              <tr key={rack.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {rack.code}
                </td>
                <td style={common.td}>{rack.name}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {rack.location_code}
                </td>
                <td style={common.td}>{rack.height_u}</td>
                <td style={common.td}>{rack.row ?? ""}</td>
                <td style={common.td}>{rack.placement_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
