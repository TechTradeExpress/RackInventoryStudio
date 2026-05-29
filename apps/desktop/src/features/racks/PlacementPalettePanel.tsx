import { useEffect, useState } from "react";
import {
  listDevices,
  listDeviceModels,
  type DeviceDto,
  type DeviceModelDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import { encodeDndPayload, writeDragData, setActiveDragPayload, getDragPayload, getActiveDragPayload } from "./dndHelpers";

const PALETTE_VISIBLE_LIMIT = 6;

interface Props {
  rack: RackSummaryDto;
  reloadToken: number;
  mutationToken: number;
  /** Active side selected in Rack Detail — shown in header for orientation. */
  activeSide: "front" | "rear";
  /** Called when user clicks "Place…" on a palette device item. */
  onPlaceDevice: (deviceId: string) => void;
  /** Called when user clicks "Place…" on a palette rack object model item. */
  onPlaceRackObject: (modelId: string) => void;
  /** Called when an existing placement is dragged and dropped onto the palette to unplace it. */
  onUnplacePlacement?: (placementId: string) => void;
  /**
   * Device IDs that were unplaced during this session, in chronological order
   * (last entry = most recently unplaced). Used to sort the palette so recently
   * unplaced devices appear first in the visible 6. Frontend-only; cleared on
   * navigation to another rack.
   */
  recentlyUnplacedDeviceIds?: string[];
}

export function PlacementPalettePanel({
  rack,
  reloadToken,
  mutationToken,
  activeSide,
  onPlaceDevice,
  onPlaceRackObject,
  onUnplacePlacement,
  recentlyUnplacedDeviceIds = [],
}: Props) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [deviceModels, setDeviceModels] = useState<DeviceModelDto[]>([]);
  const [allDeviceModels, setAllDeviceModels] = useState<DeviceModelDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Reset on rack change
  useEffect(() => {
    setLoadError(null);
    setDevices([]);
    setDeviceModels([]);
    setShowAll(false);
  }, [rack.id]);

  // Load available targets whenever rack, reloadToken, mutationToken or retryToken changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    async function load() {
      try {
        const [devs, models] = await Promise.all([listDevices(), listDeviceModels()]);
        if (!cancelled) {
          setAllDeviceModels(models);
          setDevices(devs.filter((d) => !d.is_placed));
          setDeviceModels(models.filter((m) => m.device_type === "rack_object"));
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rack.id, reloadToken, mutationToken, retryToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort unplaced devices: recently unplaced (by session recency) first, then stable backend order.
  const sortedDevices: DeviceDto[] =
    recentlyUnplacedDeviceIds.length === 0
      ? devices
      : [...devices].sort((a, b) => {
          const idxA = recentlyUnplacedDeviceIds.lastIndexOf(a.id);
          const idxB = recentlyUnplacedDeviceIds.lastIndexOf(b.id);
          if (idxA !== idxB) return idxB - idxA; // higher index = more recently unplaced
          return 0;
        });

  const visibleDevices = showAll
    ? sortedDevices
    : sortedDevices.slice(0, PALETTE_VISIBLE_LIMIT);
  const hasOverflow = !showAll && sortedDevices.length > PALETTE_VISIBLE_LIMIT;
  const hiddenCount = sortedDevices.length - PALETTE_VISIBLE_LIMIT;

  const rackObjectModels = deviceModels;

  return (
    <div data-testid="palette-drop-zone">
      <Panel
        title="Placeable equipment"
        desc={`${activeSide === "front" ? "Front" : "Rear"} side · drag or click Place…`}
      >
        {/* Persistent unplace drop zone — always visible, gives a large reliable target
            for dragging placed items back to unplaced state. */}
        <div
          data-testid="unplace-drop-zone"
          style={{
            marginBottom: 12,
            minHeight: 56,
            padding: "10px 12px",
            border: dropZoneActive ? "2px dashed #e07000" : "2px dashed #ccc",
            borderRadius: 4,
            backgroundColor: dropZoneActive ? "rgba(255,200,80,0.10)" : "rgba(0,0,0,0.02)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: dropZoneActive ? "#a05000" : "#aaa",
            fontWeight: dropZoneActive ? 600 : 400,
            fontSize: "0.8rem",
            userSelect: "none",
          }}
          onDragOver={(e) => {
            const payload = getActiveDragPayload();
            if (payload?.kind !== "placement") return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            setDropZoneActive(true);
          }}
          onDragLeave={() => setDropZoneActive(false)}
          onDrop={(e) => {
            setDropZoneActive(false);
            const payload = getDragPayload(e) ?? getActiveDragPayload();
            if (payload?.kind !== "placement") return;
            e.preventDefault();
            onUnplacePlacement?.(payload.placementId);
          }}
        >
          ↩ Drop here to remove from rack
        </div>

        {loading && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>
            Loading available equipment…
          </p>
        )}

        {loadError && (
          <div style={{ marginBottom: 8 }}>
            <Banner tone="err">
              Failed to load targets: {loadError}{" "}
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => setRetryToken((t) => t + 1)}
              >
                Retry
              </button>
            </Banner>
          </div>
        )}

        {!loading && !loadError && sortedDevices.length === 0 && rackObjectModels.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", margin: 0 }}>
            No unplaced devices or rack objects available.
          </p>
        )}

        {!loading && !loadError && (sortedDevices.length > 0 || rackObjectModels.length > 0) && (
          <div className="palette">
            {visibleDevices.map((d) => {
              const modelHeight =
                allDeviceModels.find((m) => m.id === d.device_model_id)
                  ?.default_height_u ?? null;
              const payload = {
                kind: "device" as const,
                deviceId: d.id,
                deviceCode: d.code,
                defaultHeightU: modelHeight,
              };
              return (
                <div
                  key={d.id}
                  draggable
                  data-testid={`dnd-device-${d.id}`}
                  className="palette-card"
                  onDragStart={(e) => {
                    setActiveDragPayload(payload);
                    e.dataTransfer.effectAllowed = "copy";
                    writeDragData(e.dataTransfer, encodeDndPayload(payload));
                  }}
                  onDragEnd={() => setActiveDragPayload(null)}
                  title={`Drag to place ${d.name ?? d.code}${modelHeight ? ` (${modelHeight}U)` : ""}`}
                >
                  <span className="pc-drag">⠿</span>
                  <span className="pc-name">{d.name ?? "Unnamed device"}</span>
                  {modelHeight ? (
                    <span className="pc-meta">{modelHeight}U</span>
                  ) : (
                    <span className="pc-meta" style={{ color: "var(--st-warn-tx)" }}>no model</span>
                  )}
                  <button
                    className="btn btn-sm"
                    type="button"
                    style={{ marginLeft: "auto" }}
                    title={`Place ${d.name ?? d.code}…`}
                    aria-label={`Place ${d.name ?? d.code}`}
                    data-testid={`place-btn-device-${d.id}`}
                    onClick={() => onPlaceDevice(d.id)}
                  >
                    Place…
                  </button>
                </div>
              );
            })}

            {hasOverflow && (
              <div
                data-testid="palette-overflow-indicator"
                style={{
                  padding: "4px 8px",
                  fontSize: "0.78rem",
                  color: "var(--tx-3)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>
                  Showing {PALETTE_VISIBLE_LIMIT} of {sortedDevices.length} unplaced devices
                </span>
                <button
                  className="btn btn-sm"
                  type="button"
                  data-testid="show-all-devices-btn"
                  onClick={() => setShowAll(true)}
                >
                  Show all
                </button>
              </div>
            )}

            {rackObjectModels.map((m) => {
              const payload = {
                kind: "rack_object" as const,
                deviceModelId: m.id,
                modelCode: m.code,
                defaultHeightU: m.default_height_u,
              };
              return (
                <div
                  key={m.id}
                  draggable
                  data-testid={`dnd-model-${m.id}`}
                  className="palette-card"
                  onDragStart={(e) => {
                    setActiveDragPayload(payload);
                    e.dataTransfer.effectAllowed = "copy";
                    writeDragData(e.dataTransfer, encodeDndPayload(payload));
                  }}
                  onDragEnd={() => setActiveDragPayload(null)}
                  title={`Drag to place ${m.code} (${m.default_height_u}U)`}
                >
                  <span className="pc-drag">⠿</span>
                  <span className="pc-name">{m.code}</span>
                  <span className="pc-meta">{m.default_height_u}U</span>
                  <button
                    className="btn btn-sm"
                    type="button"
                    style={{ marginLeft: "auto" }}
                    title={`Place ${m.code}…`}
                    aria-label={`Place ${m.code}`}
                    data-testid={`place-btn-model-${m.id}`}
                    onClick={() => onPlaceRackObject(m.id)}
                  >
                    Place…
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
