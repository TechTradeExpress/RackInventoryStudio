import { useEffect, useState } from "react";
import {
  getRackDetail,
  listDevices,
  listDeviceModels,
  movePlacement,
  removePlacement,
  saveRackViewSvgViaDialog,
  saveRackViewPngViaDialog,
  type DeviceDto,
  type DeviceModelDto,
  type PlacementDto,
  type RackDetailDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { buildRackViewSvg, sanitizeFilename } from "./rackExport";
import { rasterizeSvgToPng } from "./rackExportDom";
import { RackUnitDiagram } from "./RackUnitDiagram";
import { PlacementInspectorPanel } from "./PlacementInspectorPanel";
import { PlacementPalettePanel } from "./PlacementPalettePanel";
import { PlacePlacementModal } from "./PlacePlacementModal";
import { EditPlacementModal } from "./EditPlacementModal";
import { DeviceFormModal } from "../devices/DeviceFormModal";
import { DeviceModelFormModal } from "../deviceModels/DeviceModelFormModal";
import type { DndPayload } from "./dndTypes";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import { Segmented } from "../../components/ui/Segmented";
import { useWorkMode, WORK_MODE_DEFAULT_STATUS } from "../../lib/workMode";

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
  const { mode: workMode } = useWorkMode();
  const defaultDeviceStatus = WORK_MODE_DEFAULT_STATUS[workMode];

  const [detail, setDetail] = useState<RackDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSide, setActiveSide] = useState<"front" | "rear">("front");
  const [selectedPlacement, setSelectedPlacement] = useState<PlacementDto | null>(null);
  const [targetReloadToken, setTargetReloadToken] = useState(0);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  // Device IDs unplaced during this session (chronological, last = most recent).
  // Used to sort the palette so recently unplaced devices appear first.
  const [recentlyUnplacedDeviceIds, setRecentlyUnplacedDeviceIds] = useState<string[]>([]);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  // Available devices/models for the place modal (kept in sync via targetReloadToken)
  const [availableDevices, setAvailableDevices] = useState<DeviceDto[]>([]);
  const [availableRackObjects, setAvailableRackObjects] = useState<DeviceModelDto[]>([]);

  // Place placement modal state
  const [placePlacementOpen, setPlacePlacementOpen] = useState(false);
  const [placeModalStartU, setPlaceModalStartU] = useState<number | null>(null);
  const [placeModalTargetKind, setPlaceModalTargetKind] = useState<"device" | "rack_object" | null>(null);
  const [placeModalTargetId, setPlaceModalTargetId] = useState<string | null>(null);

  // Edit placement modal state
  const [editPlacementOpen, setEditPlacementOpen] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<PlacementDto | null>(null);

  // Edit target device/model state (from inspector "Edit target" buttons)
  const [editTargetDeviceOpen, setEditTargetDeviceOpen] = useState(false);
  const [editingTargetDevice, setEditingTargetDevice] = useState<DeviceDto | null>(null);
  const [editTargetDeviceModels, setEditTargetDeviceModels] = useState<DeviceModelDto[]>([]);
  const [editTargetModelOpen, setEditTargetModelOpen] = useState(false);
  const [editingTargetModel, setEditingTargetModel] = useState<DeviceModelDto | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSelectedPlacement(null);
    setActiveSide("front");
    setMutationMessage(null);
    setRecentlyUnplacedDeviceIds([]);
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

  // Reload available devices/models when targetReloadToken or mutationToken changes
  useEffect(() => {
    let cancelled = false;
    Promise.all([listDevices(), listDeviceModels()])
      .then(([devs, models]) => {
        if (cancelled) return;
        setAvailableDevices(devs.filter((d) => !d.is_placed));
        setAvailableRackObjects(models.filter((m) => m.device_type === "rack_object"));
      })
      .catch(() => {
        // silently ignore — PlacementPalettePanel shows its own load error
      });
    return () => { cancelled = true; };
  }, [rack.id, targetReloadToken, mutationToken]);

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

  function handleRemoveSuccess(placementId: string) {
    setMutationMessage(null);
    // Mirror the same recency update as the DnD unplace path.
    const p =
      detail?.front.find((d) => d.id === placementId) ??
      detail?.rear.find((d) => d.id === placementId);
    if (p?.target_kind === "device") {
      setRecentlyUnplacedDeviceIds((prev) => [...prev, p.target_id]);
    }
    refreshAfterMutation({ selectId: null, bumpTargets: true });
  }

  // Drop handler: open modal pre-filled with startU and target from DnD payload
  // Only called for "device" or "rack_object" payloads — "placement" is handled by onMovePlacement
  function handleDropAtCell(side: "front" | "rear", startU: number, payload: DndPayload) {
    if (payload.kind === "placement") return; // should not happen, but guard for safety
    setPlaceModalStartU(startU);
    if (payload.kind === "device") {
      setPlaceModalTargetKind("device");
      setPlaceModalTargetId(payload.deviceId);
    } else {
      setPlaceModalTargetKind("rack_object");
      setPlaceModalTargetId(payload.deviceModelId);
    }
    setPlacePlacementOpen(true);
    if (side !== activeSide) setActiveSide(side);
  }

  // Empty cell click handler: open place modal
  function handleEmptySlotClick(startU: number) {
    setPlaceModalStartU(startU);
    setPlaceModalTargetKind(null);
    setPlaceModalTargetId(null);
    setPlacePlacementOpen(true);
  }

  // Palette "Place…" button handlers — open modal with item preselected
  function handlePalettePlaceDevice(deviceId: string) {
    setPlaceModalStartU(null);
    setPlaceModalTargetKind("device");
    setPlaceModalTargetId(deviceId);
    setPlacePlacementOpen(true);
  }

  function handlePaletteRackObject(modelId: string) {
    setPlaceModalStartU(null);
    setPlaceModalTargetKind("rack_object");
    setPlaceModalTargetId(modelId);
    setPlacePlacementOpen(true);
  }

  function handleEditPlacement(p: PlacementDto) {
    setEditingPlacement(p);
    setEditPlacementOpen(true);
  }

  async function handleDiagramMovePlacement(
    side: "front" | "rear",
    placementId: string,
    newStartU: number,
  ) {
    if (!detail) return;
    const placement =
      detail.front.find((p) => p.id === placementId) ??
      detail.rear.find((p) => p.id === placementId);
    if (!placement) return;
    try {
      await movePlacement({
        placement_id: placementId,
        new_side: side,
        new_start_u: newStartU,
        new_height_u: placement.height_u ?? null,
      });
      refreshAfterMutation({ selectId: placementId });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUnplacePlacement(placementId: string) {
    try {
      // Look up device ID before removing so recency tracking works after refresh.
      const placement =
        detail?.front.find((p) => p.id === placementId) ??
        detail?.rear.find((p) => p.id === placementId);
      const deviceId =
        placement?.target_kind === "device" ? placement.target_id : null;

      await removePlacement({ placement_id: placementId });
      if (selectedPlacement?.id === placementId) {
        setSelectedPlacement(null);
      }
      if (deviceId) {
        setRecentlyUnplacedDeviceIds((prev) => [...prev, deviceId]);
      }
      refreshAfterMutation({ selectId: null, bumpTargets: true });
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleEditTargetDevice(deviceId: string) {
    try {
      const [devs, models] = await Promise.all([listDevices(), listDeviceModels()]);
      const device = devs.find((d) => d.id === deviceId) ?? null;
      if (!device) return;
      setEditTargetDeviceModels(models.filter((m) => m.device_type !== "rack_object"));
      setEditingTargetDevice(device);
      setEditTargetDeviceOpen(true);
    } catch {
      // ignore — user can try again
    }
  }

  async function handleEditTargetModel(modelId: string) {
    try {
      const models = await listDeviceModels();
      const model = models.find((m) => m.id === modelId) ?? null;
      if (!model) return;
      setEditingTargetModel(model);
      setEditTargetModelOpen(true);
    } catch {
      // ignore
    }
  }

  function buildExportSvg() {
    if (!detail) return null;
    return buildRackViewSvg({
      rackName: rack.name,
      rackCode: rack.code,
      heightU: detail.height_u,
      side: activeSide,
      placements: activeSide === "front" ? detail.front : detail.rear,
    });
  }

  async function handleExportSvg() {
    const svgContent = buildExportSvg();
    if (!svgContent) return;
    setExportError(null);
    setExportBusy(true);
    try {
      const safeName = sanitizeFilename(rack.code || rack.name);
      const filename = `rack-${safeName}-${activeSide}.svg`;
      const result = await saveRackViewSvgViaDialog(svgContent, filename);
      if (result === "cancelled") return;
    } catch (e) {
      setExportError(`SVG export failed: ${String(e)}`);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleExportPng() {
    const svgContent = buildExportSvg();
    if (!svgContent) return;
    setExportError(null);
    setExportBusy(true);
    try {
      const safeName = sanitizeFilename(rack.code || rack.name);
      const filename = `rack-${safeName}-${activeSide}.png`;
      const pngBytes = await rasterizeSvgToPng(svgContent);
      const result = await saveRackViewPngViaDialog(pngBytes, filename);
      if (result === "cancelled") return;
    } catch (e) {
      setExportError(`PNG export failed: ${String(e)}`);
    } finally {
      setExportBusy(false);
    }
  }

  const selectedSide = deriveSide(selectedPlacement, detail);

  const frontUsed = detail?.front.reduce((s, p) => s + (p.effective_height_u ?? 1), 0) ?? 0;
  const rearUsed  = detail?.rear.reduce((s, p)  => s + (p.effective_height_u ?? 1), 0) ?? 0;

  return (
    <>
      {/* Place placement modal */}
      <PlacePlacementModal
        open={placePlacementOpen}
        rack={rack}
        side={activeSide}
        startU={placeModalStartU}
        availableDevices={availableDevices}
        availableRackObjects={availableRackObjects}
        initialTargetKind={placeModalTargetKind}
        initialTargetId={placeModalTargetId}
        defaultDeviceStatus={defaultDeviceStatus}
        onClose={() => {
          setPlacePlacementOpen(false);
          setPlaceModalTargetKind(null);
          setPlaceModalTargetId(null);
        }}
        onDeviceCreated={() => setTargetReloadToken((t) => t + 1)}
        onRackObjectCreated={() => setTargetReloadToken((t) => t + 1)}
        onPlaced={(newId) => {
          setPlacePlacementOpen(false);
          setPlaceModalTargetKind(null);
          setPlaceModalTargetId(null);
          handleAddSuccess(newId);
        }}
      />

      {/* Edit target device modal (from inspector) */}
      {editingTargetDevice && (
        <DeviceFormModal
          open={editTargetDeviceOpen}
          editing={editingTargetDevice}
          models={editTargetDeviceModels}
          onClose={() => { setEditTargetDeviceOpen(false); setEditingTargetDevice(null); }}
          onSaved={() => {
            setEditTargetDeviceOpen(false);
            setEditingTargetDevice(null);
            refreshAfterMutation({ bumpTargets: true });
          }}
        />
      )}

      {/* Edit target rack object model modal (from inspector) */}
      {editingTargetModel && (
        <DeviceModelFormModal
          open={editTargetModelOpen}
          editing={editingTargetModel}
          onClose={() => { setEditTargetModelOpen(false); setEditingTargetModel(null); }}
          onSaved={() => {
            setEditTargetModelOpen(false);
            setEditingTargetModel(null);
            refreshAfterMutation({ bumpTargets: true });
          }}
        />
      )}

      {/* Edit placement modal */}
      {editingPlacement && (
        <EditPlacementModal
          open={editPlacementOpen}
          placement={editingPlacement}
          rack={rack}
          side={(deriveSide(editingPlacement, detail)?.toLowerCase() ?? activeSide) as "front" | "rear"}
          onClose={() => {
            setEditPlacementOpen(false);
            setEditingPlacement(null);
          }}
          onUpdated={(id) => {
            setEditPlacementOpen(false);
            setEditingPlacement(null);
            refreshAfterMutation({ selectId: id });
          }}
          onRemoved={() => {
            setEditPlacementOpen(false);
            setEditingPlacement(null);
            refreshAfterMutation({ selectId: null, bumpTargets: true });
          }}
        />
      )}

      <PageHeader
        title={
          <span>
            <span style={{ color: "var(--tx-3)", fontWeight: 400 }}>Racks / </span>
            {rack.name}
          </span>
        }
        subtitle={
          <span>
            {rack.row && <>Row {rack.row} · </>}{rack.height_u}U
          </span>
        }
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Segmented<"front" | "rear">
              value={activeSide}
              onChange={handleSideChange}
              options={[
                { value: "front", label: "Front", testId: "rack-side-front" },
                { value: "rear", label: "Rear", testId: "rack-side-rear" },
              ]}
              ariaLabel="Rack side"
              testId="rack-side-toggle"
            />
            {detail && (
              <>
                <button
                  className="btn"
                  onClick={handleExportSvg}
                  disabled={exportBusy}
                  data-testid="export-svg-btn"
                  aria-label="Export SVG"
                  title={`Export ${activeSide} side as SVG`}
                >
                  Export SVG
                </button>
                <button
                  className="btn"
                  onClick={handleExportPng}
                  disabled={exportBusy}
                  data-testid="export-png-btn"
                  aria-label="Export PNG"
                  title={`Export ${activeSide} side as PNG`}
                >
                  Export PNG
                </button>
              </>
            )}
            {onBack && (
              <button className="btn" data-testid="rack-detail-back-btn" onClick={onBack}>
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
        {exportError && (
          <div data-testid="export-error-banner">
            <Banner tone="err">{exportError}</Banner>
          </div>
        )}

        {detail && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, minHeight: 0 }}>
            {/* Left — diagram only (primary placement surface) */}
            <div className="stack-4" style={{ minWidth: 0 }}>
              <Panel
                title="Rack diagram"
                desc={`${activeSide === "front" ? "Front" : "Rear"} · U${detail.height_u} at top · click empty slot to place · drag from palette`}
              >
                <RackUnitDiagram
                  heightU={detail.height_u}
                  front={detail.front}
                  rear={detail.rear}
                  side={activeSide}
                  selectedPlacementId={selectedPlacement?.id ?? null}
                  onSelectPlacement={handleSelectPlacement}
                  onDropAtCell={handleDropAtCell}
                  onEmptySlotClick={handleEmptySlotClick}
                  onMovePlacement={handleDiagramMovePlacement}
                />
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

            {/* Right — palette + inspector */}
            <div className="stack-4" style={{ minWidth: 0 }}>
              <PlacementPalettePanel
                rack={rack}
                reloadToken={targetReloadToken}
                mutationToken={mutationToken}
                activeSide={activeSide}
                onPlaceDevice={handlePalettePlaceDevice}
                onPlaceRackObject={handlePaletteRackObject}
                onUnplacePlacement={handleUnplacePlacement}
                recentlyUnplacedDeviceIds={recentlyUnplacedDeviceIds}
              />

              <Panel
                title="Placement inspector"
                desc={
                  selectedPlacement
                    ? `${selectedSide} side · ${selectedPlacement.target_name?.trim() || (selectedPlacement.target_kind === "device" ? "Unnamed device" : "Unnamed object")}`
                    : "Select a placement in the diagram"
                }
              >
                {mutationMessage && selectedPlacement && (
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
                  onOpenEditModal={selectedPlacement ? () => handleEditPlacement(selectedPlacement) : undefined}
                  onEditTargetDevice={handleEditTargetDevice}
                  onEditTargetModel={handleEditTargetModel}
                />
              </Panel>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
