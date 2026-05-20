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

interface NavigationRequest {
  placementId: string;
  message: string;
}

interface Props {
  rack: RackSummaryDto;
  mutationToken: number;
  onRepositoryMutated: () => void;
  onNavigateToRackPlacement: (rackId: string, placementId: string) => boolean;
  initialNavigation: NavigationRequest | null;
  onNavigationConsumed?: () => void;
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
  useEffect(() => {
    if (!selectedPlacementId) return;
    const el = document.querySelector(`[data-placement-id="${CSS.escape(selectedPlacementId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [selectedPlacementId]);

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
              data-placement-id={p.id}
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

export function RackDetailPanel({
  rack,
  mutationToken,
  onRepositoryMutated,
  onNavigateToRackPlacement,
  initialNavigation,
  onNavigationConsumed,
}: Props) {
  const [detail, setDetail] = useState<RackDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlacement, setSelectedPlacement] =
    useState<PlacementDto | null>(null);
  const [targetReloadToken, setTargetReloadToken] = useState(0);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedPlacement(null);
    setMutationMessage(null);
    getRackDetail(rack.id)
      .then((newDetail) => {
        setDetail(newDetail);
        if (initialNavigation) {
          const found =
            newDetail.front.find(
              (p) => p.id === initialNavigation.placementId,
            ) ??
            newDetail.rear.find(
              (p) => p.id === initialNavigation.placementId,
            ) ??
            null;
          if (found) {
            setSelectedPlacement(found);
            setMutationMessage(initialNavigation.message);
          } else {
            setMutationMessage(
              "Placement not found in destination rack.",
            );
          }
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoading(false);
        if (initialNavigation) onNavigationConsumed?.();
      });
  }, [rack.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectPlacement(p: PlacementDto | null) {
    setMutationMessage(null);
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

  function handleMoveSuccess(
    movedPlacementId: string,
    options?: { movedToAnotherRack?: boolean; destRackId?: string },
  ) {
    if (options?.movedToAnotherRack && options.destRackId) {
      const navigated = onNavigateToRackPlacement(
        options.destRackId,
        movedPlacementId,
      );
      if (navigated) {
        onRepositoryMutated();
      } else {
        setMutationMessage(
          "Moved to another rack in memory. Use Save to persist changes.",
        );
        refreshAfterMutation({ selectId: null }); // calls onRepositoryMutated internally
      }
    } else {
      setMutationMessage(null);
      refreshAfterMutation({ selectId: movedPlacementId });
    }
  }

  function handleAddSuccess(newPlacementId: string) {
    setMutationMessage(null);
    refreshAfterMutation({ selectId: newPlacementId, bumpTargets: true });
  }

  function handleRemoveSuccess() {
    setMutationMessage(null);
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
            mutationToken={mutationToken}
          />

          <h3 style={{ ...common.h3, marginTop: "1.25rem" }}>
            Placement Inspector
          </h3>
          {mutationMessage && (
            <p
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.82rem",
                color: "#2a7a2a",
              }}
            >
              {mutationMessage}
            </p>
          )}
          <PlacementInspectorPanel
            placement={selectedPlacement}
            side={selectedSide}
            currentRack={rack}
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
