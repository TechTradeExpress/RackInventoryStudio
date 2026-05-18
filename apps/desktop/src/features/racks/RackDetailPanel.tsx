import { useEffect, useState } from "react";
import { common } from "../../lib/styles";
import {
  getRackDetail,
  type PlacementDto,
  type RackDetailDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { RackUnitDiagram } from "./RackUnitDiagram";
import { PlacementInspectorPanel } from "./PlacementInspectorPanel";
import { AddPlacementPanel } from "./AddPlacementPanel";

interface Props {
  rack: RackSummaryDto;
  onRepositoryMutated: () => void;
}

interface PlacementTableProps {
  placements: PlacementDto[];
  selectedPlacementId: string | null;
  onSelectPlacement: (p: PlacementDto | null) => void;
}

function PlacementTable({
  placements,
  selectedPlacementId,
  onSelectPlacement,
}: PlacementTableProps) {
  if (placements.length === 0) {
    return <p style={common.hint}>No placements.</p>;
  }
  return (
    <table style={{ ...common.table, fontSize: "0.82rem" }}>
      <thead>
        <tr>
          {[
            "U",
            "End U",
            "Code",
            "Kind",
            "Target",
            "Name",
            "Type",
            "Note",
          ].map((h) => (
            <th key={h} style={common.th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {placements.map((p) => {
          const isSelected = p.id === selectedPlacementId;
          return (
            <tr
              key={p.id}
              title={p.code}
              onClick={() => onSelectPlacement(isSelected ? null : p)}
              style={{
                cursor: "pointer",
                background: isSelected ? "#dce8fc" : "inherit",
              }}
            >
              <td style={common.td}>{p.start_u}</td>
              <td style={common.td}>{p.end_u ?? ""}</td>
              <td style={{ ...common.td, fontFamily: "monospace" }}>
                {p.code}
              </td>
              <td style={common.td}>{p.target_kind}</td>
              <td style={{ ...common.td, fontFamily: "monospace" }}>
                {p.target_code ?? p.target_id}
              </td>
              <td style={common.td}>{p.target_name ?? ""}</td>
              <td style={common.td}>{p.device_type ?? ""}</td>
              <td style={common.td}>{p.note ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function deriveSide(
  placement: PlacementDto | null,
  detail: RackDetailDto | null,
): "Front" | "Rear" | null {
  if (!placement || !detail) return null;
  if (detail.front.some((p) => p.id === placement.id)) return "Front";
  if (detail.rear.some((p) => p.id === placement.id)) return "Rear";
  return null;
}

export function RackDetailPanel({ rack, onRepositoryMutated }: Props) {
  const [detail, setDetail] = useState<RackDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlacement, setSelectedPlacement] =
    useState<PlacementDto | null>(null);
  const [targetReloadToken, setTargetReloadToken] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedPlacement(null);
    getRackDetail(rack.id)
      .then(setDetail)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [rack.id]);

  function handleSelectPlacement(p: PlacementDto | null) {
    setSelectedPlacement((prev) =>
      p === null ? null : prev?.id === p.id ? null : p,
    );
  }

  /**
   * Central post-mutation refresh.
   *
   * selectId:
   *   string  — try to restore this placement as selected (clear if not found)
   *   null    — clear selected placement
   *   undefined — leave selection unchanged
   *
   * bumpTargets:
   *   true — increment reloadToken so AddPlacementPanel reloads target lists
   */
  function refreshAfterMutation(opts: {
    selectId?: string | null;
    bumpTargets?: boolean;
  }) {
    onRepositoryMutated();
    if (opts.bumpTargets) {
      setTargetReloadToken((t) => t + 1);
    }
    setLoading(true);
    setError(null);
    getRackDetail(rack.id)
      .then((newDetail) => {
        setDetail(newDetail);
        if (opts.selectId === null) {
          setSelectedPlacement(null);
        } else if (opts.selectId !== undefined) {
          const found =
            newDetail.front.find((p) => p.id === opts.selectId) ??
            newDetail.rear.find((p) => p.id === opts.selectId) ??
            null;
          setSelectedPlacement(found);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  function handleMoveSuccess(movedPlacementId: string) {
    refreshAfterMutation({ selectId: movedPlacementId });
  }

  function handleAddSuccess(newPlacementId: string) {
    refreshAfterMutation({ selectId: newPlacementId, bumpTargets: true });
  }

  function handleRemoveSuccess() {
    refreshAfterMutation({ selectId: null, bumpTargets: true });
  }

  const selectedSide = deriveSide(selectedPlacement, detail);

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

          <h3 style={common.h3}>Rack Diagram</h3>
          <RackUnitDiagram
            heightU={detail.height_u}
            front={detail.front}
            rear={detail.rear}
            selectedPlacementId={selectedPlacement?.id ?? null}
            onSelectPlacement={handleSelectPlacement}
          />

          <h3 style={{ ...common.h3, marginTop: "1.25rem" }}>
            Add Placement
          </h3>
          <AddPlacementPanel
            rack={rack}
            onAddSuccess={handleAddSuccess}
            reloadToken={targetReloadToken}
          />

          <h3 style={{ ...common.h3, marginTop: "1.25rem" }}>
            Placement Inspector
          </h3>
          <PlacementInspectorPanel
            placement={selectedPlacement}
            side={selectedSide}
            onMoveSuccess={handleMoveSuccess}
            onRemoveSuccess={handleRemoveSuccess}
          />

          <h3 style={{ ...common.h3, marginTop: "1.25rem" }}>
            Front — placement detail
          </h3>
          <PlacementTable
            placements={detail.front}
            selectedPlacementId={selectedPlacement?.id ?? null}
            onSelectPlacement={handleSelectPlacement}
          />

          <h3 style={{ ...common.h3, marginTop: "0.75rem" }}>
            Rear — placement detail
          </h3>
          <PlacementTable
            placements={detail.rear}
            selectedPlacementId={selectedPlacement?.id ?? null}
            onSelectPlacement={handleSelectPlacement}
          />
        </>
      )}
    </section>
  );
}
