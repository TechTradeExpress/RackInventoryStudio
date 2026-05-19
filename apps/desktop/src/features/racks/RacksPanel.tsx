import { useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import { listRacks, type RackSummaryDto } from "../../api/tauriClient";
import { RackDetailPanel } from "./RackDetailPanel";

interface Props {
  repoPath: string;
  selectedRackId: string | null;
  onSelectRack: (rack: RackSummaryDto | null) => void;
  onRepositoryMutated: () => void;
}

interface PendingNavigation {
  placementId: string;
  message: string;
}

export function RacksPanel({ repoPath, selectedRackId, onSelectRack, onRepositoryMutated }: Props) {
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [recentlyNavigatedRackId, setRecentlyNavigatedRackId] = useState<
    string | null
  >(null);
  const [racksReloadToken, setRacksReloadToken] = useState(0);
  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setRacks([]);
      setError(null);
      setRecentlyNavigatedRackId(null);
      setPendingNavigation(null);
    }
    setLoading(true);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, racksReloadToken]);

  function handleRepositoryMutated() {
    setRacksReloadToken((t) => t + 1);
    onRepositoryMutated();
  }

  const selectedRack = racks.find((r) => r.id === selectedRackId) ?? null;

  function handleRowClick(rack: RackSummaryDto) {
    setPendingNavigation(null);
    setRecentlyNavigatedRackId(null);
    onSelectRack(selectedRackId === rack.id ? null : rack);
  }

  function handleNavigateToRackPlacement(
    rackId: string,
    placementId: string,
  ): boolean {
    const destRack = racks.find((r) => r.id === rackId);
    if (!destRack) return false;
    setPendingNavigation({
      placementId,
      message: `Moved to rack ${destRack.code} in memory. Use Save to persist changes.`,
    });
    setRecentlyNavigatedRackId(destRack.id);
    onSelectRack(destRack);
    return true;
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
                  "Front",
                  "Rear",
                  "Total",
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
                const isRecentNav = rack.id === recentlyNavigatedRackId;
                return (
                  <tr
                    key={rack.id}
                    onClick={() => handleRowClick(rack)}
                    style={{
                      cursor: "pointer",
                      background:
                        isSelected && isRecentNav
                          ? "#d5ebd5"
                          : isSelected
                            ? "#e8f0fe"
                            : "inherit",
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
                    <td style={common.td}>{rack.front_placement_count}</td>
                    <td style={common.td}>{rack.rear_placement_count}</td>
                    <td style={common.td}>{rack.placement_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {selectedRack && (
        <RackDetailPanel
          rack={selectedRack}
          onRepositoryMutated={handleRepositoryMutated}
          onNavigateToRackPlacement={handleNavigateToRackPlacement}
          initialNavigation={pendingNavigation}
          onNavigationConsumed={() => setPendingNavigation(null)}
        />
      )}
    </>
  );
}
