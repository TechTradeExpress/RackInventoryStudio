import { common } from "../../lib/styles";
import type { RepositorySummaryDto } from "../../api/tauriClient";

interface Props {
  repoPath: string;
  onRepoPathChange: (v: string) => void;
  onOpen: () => void;
  onBrowse: () => void;
  onClose: () => void;
  working: boolean;
  summary: RepositorySummaryDto | null;
}

const EXAMPLE_HINT = "examples/example-repository";

function SummaryTable({ summary }: { summary: RepositorySummaryDto }) {
  const rows: [string, string | number][] = [
    ["Path", summary.repo_path],
    ["Code", summary.repository_code],
    ["Name", summary.repository_name],
    ["Locations", summary.locations_count],
    ["Racks", summary.racks_count],
    ["Device Models", summary.device_models_count],
    ["Devices", summary.devices_count],
    ["Placement Files", summary.placement_files_count],
    ["Placements", summary.placements_count],
    ["Unplaced Devices", summary.unplaced_devices_count],
  ];
  return (
    <table style={common.table}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={common.th}>{label}</td>
            <td style={common.td}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RepositoryPanel({
  repoPath,
  onRepoPathChange,
  onOpen,
  onBrowse,
  onClose,
  working,
  summary,
}: Props) {
  return (
    <>
      <section style={common.section}>
        <h2 style={common.h2}>Open Repository</h2>
        <p style={common.hint}>Example path: {EXAMPLE_HINT}</p>
        <div style={common.row}>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => onRepoPathChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onOpen()}
            placeholder="Repository path…"
            style={common.input}
            disabled={working}
          />
          <button onClick={onBrowse} disabled={working} style={common.btn}>
            Browse…
          </button>
          <button
            onClick={onOpen}
            disabled={working || !repoPath.trim()}
            style={common.btn}
          >
            Open
          </button>
          {summary && (
            <button onClick={onClose} disabled={working} style={common.btn}>
              Close
            </button>
          )}
        </div>
      </section>

      {summary && (
        <section style={common.section}>
          <h2 style={common.h2}>Repository Summary</h2>
          <SummaryTable summary={summary} />
        </section>
      )}
    </>
  );
}
