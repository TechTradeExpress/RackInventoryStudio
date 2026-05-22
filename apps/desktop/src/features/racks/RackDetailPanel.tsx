import { useEffect, useState } from "react";
import {
  getRackDetail,
  placeDevice,
  placeRackObject,
  type PlacementDto,
  type RackDetailDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { RackUnitDiagram } from "./RackUnitDiagram";
import { PlacementInspectorPanel } from "./PlacementInspectorPanel";
import { AddPlacementPanel } from "./AddPlacementPanel";
import type { DndPayload } from "./dndTypes";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import { Segmented } from "../../components/ui/Segmented";
import { IcServer } from "../../components/ui/Icon";

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
  onBack?: () => void;
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
  onBack,
}: Props) {
  const [detail, setDetail] = useState<RackDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSide, setActiveSide] = useState<"front" | "rear">("front");
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementDto | null>(null);
  const [targetReloadToken, setTargetReloadToken] = useState(0);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [dndError, setDndError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedPlacement(null);
    setActiveSide("front");
    setMutationMessage(null);
    getRackDetail(rack.id)
      .then((newDetail) => {
        setDetail(newDetail);
        if (initialNavigation) {
          const found =
            newDetail.front.find((p) => p.id === initialNavigation.placementId) ??
            newDetail.rear.find((p) => p.id === initialNavigation.placementId) ??
            null;
          if (found) {
            setSelectedPlacement(found);
            setMutationMessage(initialNavigation.message);
            // Switch to the side where the navigated placement lives
            setActiveSide(newDetail.rear.some((p) => p.id === found.id) ? "rear" : "front");
          } else {
            setMutationMessage("Placement not found in destination rack.");
          }
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoading(false);
        if (initialNavigation) onNavigationConsumed?.();
      });
  }, [rack.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSideChange(side: "front" | "rear") {
    setActiveSide(side);
    setSelectedPlacement(null);
  }

  function handleSelectPlacement(p: PlacementDto | null) {
    setMutationMessage(null);
    setSelectedPlacement((prev) => (p === null ? null : prev?.id === p.id ? null : p));
  }

  function refreshAfterMutation(opts: { selectId?: string | null; bumpTargets?: boolean }) {
    onRepositoryMutated();
    if (opts.bumpTargets) setTargetReloadToken((t) => t + 1);
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
          if (found) {
            // Switch diagram to the side where the placement now lives
            setActiveSide(newDetail.rear.some((p) => p.id === found.id) ? "rear" : "front");
          }
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
      const navigated = onNavigateToRackPlacement(options.destRackId, movedPlacementId);
      if (navigated) {
        onRepositoryMutated();
      } else {
        setMutationMessage("Moved to another rack in memory. Use Save to persist changes.");
        refreshAfterMutation({ selectId: null });
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

  async function handleDropAtCell(side: "front" | "rear", startU: number, payload: DndPayload) {
    setDndError(null);
    try {
      let newId: string;
      if (payload.kind === "device") {
        newId = await placeDevice({
          rack_id: rack.id,
          device_id: payload.deviceId,
          side,
          start_u: startU,
          height_u: payload.defaultHeightU,
        });
      } else {
        newId = await placeRackObject({
          rack_id: rack.id,
          device_model_id: payload.deviceModelId,
          side,
          start_u: startU,
          height_u: payload.defaultHeightU,
        });
      }
      setMutationMessage(null);
      refreshAfterMutation({ selectId: newId, bumpTargets: true });
    } catch (e) {
      setDndError(String(e));
    }
  }

  function handleRemoveSuccess() {
    setMutationMessage(null);
    refreshAfterMutation({ selectId: null, bumpTargets: true });
  }

  const selectedSide = deriveSide(selectedPlacement, detail);

  const frontUsed = detail?.front.reduce((s, p) => s + (p.effective_height_u ?? 1), 0) ?? 0;
  const rearUsed  = detail?.rear.reduce((s, p)  => s + (p.effective_height_u ?? 1), 0) ?? 0;

  return (
    <>
      <PageHeader
        title={
          <span>
            <span style={{ color: "var(--tx-3)", fontWeight: 400 }}>Racks / </span>
            {rack.name}
          </span>
        }
        subtitle={
          <span>
            <span className="mono">{rack.code}</span>
            {rack.location_code && <> · <span className="mono">{rack.location_code}</span></>}
            {rack.row && <> · Row {rack.row}</>}
            {" · "}{rack.height_u}U
          </span>
        }
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Segmented<"front" | "rear">
              value={activeSide}
              onChange={handleSideChange}
              options={[
                { value: "front", label: "Front" },
                { value: "rear", label: "Rear" },
              ]}
              ariaLabel="Rack side"
            />
            {onBack && (
              <button className="btn" onClick={onBack}>
                ← Back to racks
              </button>
            )}
          </div>
        }
      />

      <div className="page-content">
        {loading && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>
        )}
        {error && <Banner tone="err">{error}</Banner>}

        {detail && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 16, minHeight: 0 }}>
            {/* Left — palette (add placement) */}
            <div className="stack-4" style={{ minWidth: 0 }}>
              <AddPlacementPanel
                rack={rack}
                onAddSuccess={handleAddSuccess}
                reloadToken={targetReloadToken}
                mutationToken={mutationToken}
                activeSide={activeSide}
              />
            </div>

            {/* Center — rack diagram */}
            <div style={{ minWidth: 0 }}>
              <Panel
                title="Rack diagram"
                desc={`${activeSide === "front" ? "Front" : "Rear"} · top (U${detail.height_u}) at top · click to inspect or drag from palette`}
                actions={
                  <div className="row" style={{ gap: 12, fontSize: 11 }}>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="status-dot info" /> Device
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="status-dot warn" /> Reserved
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="status-dot muted" /> Blank/organizer
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <span className="status-dot err" /> Unknown
                    </span>
                  </div>
                }
              >
                <RackUnitDiagram
                  heightU={detail.height_u}
                  front={detail.front}
                  rear={detail.rear}
                  side={activeSide}
                  selectedPlacementId={selectedPlacement?.id ?? null}
                  onSelectPlacement={handleSelectPlacement}
                  onDropAtCell={handleDropAtCell}
                />
                {dndError && (
                  <div style={{ marginTop: 8 }}>
                    <Banner tone="err">Drop failed: {dndError}</Banner>
                  </div>
                )}
                <div className="row-between" style={{ marginTop: 10, fontSize: 11, color: "var(--tx-3)" }}>
                  <span style={{ fontWeight: activeSide === "front" ? 600 : undefined }}>
                    Front: {frontUsed}U used · {detail.height_u - frontUsed}U free
                  </span>
                  <span style={{ fontWeight: activeSide === "rear" ? 600 : undefined }}>
                    Rear: {rearUsed}U used · {detail.height_u - rearUsed}U free
                  </span>
                </div>
              </Panel>
            </div>

            {/* Right — inspector + placement tables */}
            <div className="stack-4" style={{ minWidth: 0 }}>
              <Panel
                title="Placement inspector"
                desc={
                  selectedPlacement
                    ? `${selectedSide} side · ${selectedPlacement.code}`
                    : "Nothing selected"
                }
              >
                {mutationMessage && (
                  <div style={{ marginBottom: 8 }}>
                    <Banner tone="ok">{mutationMessage}</Banner>
                  </div>
                )}
                <PlacementInspectorPanel
                  placement={selectedPlacement}
                  side={selectedSide}
                  currentRack={rack}
                  onMoveSuccess={handleMoveSuccess}
                  onRemoveSuccess={handleRemoveSuccess}
                />
              </Panel>

              {(() => {
                const activePlacements = activeSide === "front" ? detail.front : detail.rear;
                const tableTitle = activeSide === "front" ? "Front placements" : "Rear placements";
                const emptyMsg   = activeSide === "front" ? "No front placements." : "No rear placements.";
                return (
                  <Panel
                    title={tableTitle}
                    desc={activePlacements.length > 0 ? `${activePlacements.length} placement${activePlacements.length !== 1 ? "s" : ""}` : undefined}
                    flush
                  >
                    {activePlacements.length === 0 ? (
                      <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--tx-3)" }}>
                        {emptyMsg}
                      </div>
                    ) : (
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th className="tbl-mono">U</th>
                            <th>Name</th>
                            <th>Model</th>
                            <th className="tbl-mono">Serial</th>
                            <th className="tbl-mono">Asset tag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePlacements.map((p) => (
                            <tr
                              key={p.id}
                              data-placement-id={p.id}
                              className={`tbl-clickable${p.id === selectedPlacement?.id ? " tbl-selected" : ""}`}
                              onClick={() => handleSelectPlacement(p.id === selectedPlacement?.id ? null : p)}
                            >
                              <td className="tbl-mono" style={{ whiteSpace: "nowrap" }}>
                                U{p.start_u}{p.end_u && p.end_u !== p.start_u ? `–${p.end_u}` : ""}
                              </td>
                              <td style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.target_name ?? p.target_code ?? p.code}
                              </td>
                              <td className="tbl-mono" style={{ color: "var(--tx-3)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.model_name ?? p.model_code ?? "—"}
                              </td>
                              <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>
                                {p.target_serial ?? "—"}
                              </td>
                              <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>
                                {p.target_asset_tag ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Panel>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
