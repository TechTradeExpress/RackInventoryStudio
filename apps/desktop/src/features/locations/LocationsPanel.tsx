import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import { listLocations, type LocationDto } from "../../api/tauriClient";

interface Props {
  repoPath: string;
}

export function LocationsPanel({ repoPath }: Props) {
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    setLocations([]);
    listLocations()
      .then(setLocations)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Locations</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && locations.length === 0 && (
        <p style={common.hint}>No locations found.</p>
      )}

      {locations.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {["Code", "Name", "Racks", "Address", "Description"].map((h) => (
                <th key={h} style={common.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {loc.code}
                </td>
                <td style={common.td}>{loc.name}</td>
                <td style={common.td}>{loc.rack_count}</td>
                <td style={common.td}>{loc.address ?? ""}</td>
                <td style={common.td}>{loc.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
