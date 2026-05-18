import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import { listRacks, type RackSummaryDto } from "../../api/tauriClient";
import { RackDetailPanel } from "./RackDetailPanel";

interface Props {
  repoPath: string;
  selectedRackId: string | null;
  onSelectRack: (rack: RackSummaryDto | null) => void;
  onRepositoryMutated: () => void;
}

export function RacksPanel({ repoPath, selectedRackId, onSelectRack, onRepositoryMutated }: Props) {
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    setRacks([]);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  const selectedRack = racks.find((r) => r.id === selectedRackId) ?? null;

  function handleRowClick(rack: RackSummaryDto) {
    onSelectRack(selectedRackId === rack.id ? null : rack);
  }

  return (
    <>
      <section style={common.section}>
        <h2 style={common.h2}>Racks</h2>
        <p style={common.hint}>Click a row to view rack detail.</p>

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
              {racks.map((rack) => {
                const isSelected = rack.id === selectedRackId;
                return (
                  <tr
                    key={rack.id}
                    onClick={() => handleRowClick(rack)}
                    style={{
                      cursor: "pointer",
                      background: isSelected ? "#e8f0fe" : "inherit",
                    }}
                  >
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
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selectedRack && (
        <RackDetailPanel rack={selectedRack} onRepositoryMutated={onRepositoryMutated} />
      )}
    </>
  );
}
