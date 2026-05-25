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
import { encodeDndPayload, setActiveDragPayload } from "./dndHelpers";
import { DND_DATA_TYPE } from "./dndTypes";

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
}

export function PlacementPalettePanel({
  rack,
  reloadToken,
  mutationToken,
  activeSide,
  onPlaceDevice,
  onPlaceRackObject,
}: Props) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [deviceModels, setDeviceModels] = useState<DeviceModelDto[]>([]);
  const [allDeviceModels, setAllDeviceModels] = useState<DeviceModelDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  // Reset on rack change
  useEffect(() => {
    setLoadError(null);
    setDevices([]);
    setDeviceModels([]);
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

  const unplacedDevices = devices;
  const rackObjectModels = deviceModels;

  return (
    <Panel
      title="Placeable equipment"
      desc={`${activeSide === "front" ? "Front" : "Rear"} side · drag or click Place…`}
    >
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

      {!loading && !loadError && unplacedDevices.length === 0 && rackObjectModels.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--tx-3)", margin: 0 }}>
          No unplaced devices or rack objects available.
        </p>
      )}

      {!loading && !loadError && (unplacedDevices.length > 0 || rackObjectModels.length > 0) && (
        <div className="palette">
          {unplacedDevices.map((d) => {
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
                  e.dataTransfer.setData(DND_DATA_TYPE, encodeDndPayload(payload));
                }}
                onDragEnd={() => setActiveDragPayload(null)}
                title={`Drag to place ${d.code}${modelHeight ? ` (${modelHeight}U)` : ""}`}
              >
                <span className="pc-drag">⠿</span>
                <span className="pc-name">{d.code}</span>
                {modelHeight ? (
                  <span className="pc-meta">{modelHeight}U</span>
                ) : (
                  <span className="pc-meta" style={{ color: "var(--st-warn-tx)" }}>no model</span>
                )}
                <button
                  className="btn btn-sm"
                  type="button"
                  style={{ marginLeft: "auto" }}
                  title={`Place ${d.code}…`}
                  aria-label={`Place ${d.code}`}
                  data-testid={`place-btn-device-${d.id}`}
                  onClick={() => onPlaceDevice(d.id)}
                >
                  Place…
                </button>
              </div>
            );
          })}
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
                  e.dataTransfer.setData(DND_DATA_TYPE, encodeDndPayload(payload));
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
  );
}
