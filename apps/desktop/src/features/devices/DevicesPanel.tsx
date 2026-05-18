import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import { listDevices, type DeviceDto } from "../../api/tauriClient";

interface Props {
  repoPath: string;
}

export function DevicesPanel({ repoPath }: Props) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    listDevices()
      .then(setDevices)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Devices</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && devices.length === 0 && (
        <p style={common.hint}>No devices found.</p>
      )}

      {devices.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {[
                "Code",
                "Type",
                "Name",
                "Status",
                "Serial",
                "Asset Tag",
                "Model",
                "Placed",
              ].map((h) => (
                <th key={h} style={common.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((dev) => (
              <tr key={dev.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {dev.code}
                </td>
                <td style={common.td}>{dev.device_type}</td>
                <td style={common.td}>{dev.name ?? ""}</td>
                <td style={common.td}>{dev.status}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {dev.serial_number ?? ""}
                </td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {dev.asset_tag ?? ""}
                </td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {dev.device_model_code ?? ""}
                </td>
                <td style={common.td}>{dev.is_placed ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
