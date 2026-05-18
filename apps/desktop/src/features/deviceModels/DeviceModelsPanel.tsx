import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import { listDeviceModels, type DeviceModelDto } from "../../api/tauriClient";

interface Props {
  repoPath: string;
}

export function DeviceModelsPanel({ repoPath }: Props) {
  const [models, setModels] = useState<DeviceModelDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    listDeviceModels()
      .then(setModels)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Device Models</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && models.length === 0 && (
        <p style={common.hint}>No device models found.</p>
      )}

      {models.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {["Code", "Type", "Name", "Vendor", "Model Number", "Height (U)"].map(
                (h) => (
                  <th key={h} style={common.th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {m.code}
                </td>
                <td style={common.td}>{m.device_type}</td>
                <td style={common.td}>{m.name}</td>
                <td style={common.td}>{m.vendor ?? ""}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {m.model_number ?? ""}
                </td>
                <td style={common.td}>{m.default_height_u}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
