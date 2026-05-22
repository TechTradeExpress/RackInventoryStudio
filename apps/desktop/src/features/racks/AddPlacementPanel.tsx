import { useEffect, useState } from "react";
import {
  listDevices,
  listDeviceModels,
  placeDevice,
  placeRackObject,
  type DeviceDto,
  type DeviceModelDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { common } from "../../lib/styles";
import { parsePositiveInt } from "./positiveInt";
import { encodeDndPayload, setActiveDragPayload } from "./dndHelpers";
import { DND_DATA_TYPE } from "./dndTypes";

interface Props {
  rack: RackSummaryDto;
  onAddSuccess: (newPlacementId: string) => void;
  reloadToken: number;
  mutationToken: number;
  /** Active side selected in Rack Detail — palette drops and form target this side. */
  activeSide: "front" | "rear";
}

type Mode = "device" | "rack_object";

export function AddPlacementPanel({ rack, onAddSuccess, reloadToken, mutationToken, activeSide }: Props) {
  const [mode, setMode] = useState<Mode>("device");
  const [side, setSide] = useState<"front" | "rear">(activeSide);

  // Sync side with active side when it changes in Rack Detail
  useEffect(() => {
    setSide(activeSide);
  }, [activeSide]);
  const [deviceId, setDeviceId] = useState("");
  const [deviceModelId, setDeviceModelId] = useState("");
  const [startU, setStartU] = useState("");
  const [heightU, setHeightU] = useState("");
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [deviceModels, setDeviceModels] = useState<DeviceModelDto[]>([]);
  // Full model list used to look up default_height_u for device drag cards.
  const [allDeviceModels, setAllDeviceModels] = useState<DeviceModelDto[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [manualRetryToken, setManualRetryToken] = useState(0);
  const [working, setWorking] = useState(false);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Reset form state when the rack changes (not on reloadToken changes).
  useEffect(() => {
    setTargetLoadError(null);
    setSubmitError(null);
    setSuccessId(null);
    setDeviceId("");
    setDeviceModelId("");
    setStartU("");
    setHeightU("");
  }, [rack.id]);

  // Reload target lists when the rack changes or when explicitly requested via reloadToken.
  // A cancellation flag discards stale responses from rapid rack/reload changes.
  useEffect(() => {
    let cancelled = false;
    setTargetsLoading(true);
    setTargetLoadError(null);

    async function load() {
      try {
        const [devs, models] = await Promise.all([listDevices(), listDeviceModels()]);
        if (!cancelled) {
          setDevices(devs.filter((d) => !d.is_placed));
          setAllDeviceModels(models);
          setDeviceModels(models.filter((m) => m.device_type === "rack_object"));
          setTargetsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setTargetLoadError(String(e));
          setTargetsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rack.id, reloadToken, mutationToken, manualRetryToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetInputs() {
    setDeviceId("");
    setDeviceModelId("");
    setStartU("");
    setHeightU("");
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    resetInputs();
    setSubmitError(null);
    setSuccessId(null);
  }

  function validate(): string | null {
    if (parsePositiveInt(startU) === null) {
      return "Start U must be a positive integer.";
    }
    if (heightU.trim() !== "" && parsePositiveInt(heightU) === null) {
      return "Height U override must be a positive integer if provided.";
    }
    if (mode === "device" && !deviceId) {
      return "Select a device.";
    }
    if (mode === "rack_object" && !deviceModelId) {
      return "Select a rack object model.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setSubmitError(err);
      return;
    }
    const su = parsePositiveInt(startU)!;
    const hu = heightU.trim() !== "" ? parsePositiveInt(heightU) : null;

    // Capture before inputs are reset
    const placedDeviceId = deviceId;

    setWorking(true);
    setSubmitError(null);
    setSuccessId(null);
    try {
      let newId: string;
      if (mode === "device") {
        newId = await placeDevice({
          rack_id: rack.id,
          device_id: placedDeviceId,
          side,
          start_u: su,
          height_u: hu,
        });
        // Remove the placed device from the local list so it can't be re-selected
        setDevices((prev) => prev.filter((d) => d.id !== placedDeviceId));
      } else {
        newId = await placeRackObject({
          rack_id: rack.id,
          device_model_id: deviceModelId,
          side,
          start_u: su,
          height_u: hu,
        });
      }
      resetInputs();
      setSuccessId(newId);
      onAddSuccess(newId);
    } catch (e) {
      setSubmitError(String(e));
    } finally {
      setWorking(false);
    }
  }

  const unplacedDevices = devices;
  const rackObjectModels = deviceModels;
  const addDisabled = working || targetsLoading;

  return (
    <div
      style={{
        border: "1px solid #b8d0a8",
        borderRadius: 3,
        background: "#f4fbf0",
        fontSize: "0.82rem",
      }}
    >
      <div
        style={{
          padding: "0.35rem 0.6rem",
          background: "#d4edcc",
          borderBottom: "1px solid #b8d0a8",
          fontWeight: "bold",
          fontSize: "0.8rem",
        }}
      >
        Add Placement — <span style={{ fontFamily: "monospace" }}>{rack.code}</span>
      </div>

      {/* Mode selector */}
      <div
        style={{
          padding: "0.4rem 0.6rem",
          borderBottom: "1px solid #b8d0a8",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        {(["device", "rack_object"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => handleModeChange(m)}
            style={{
              ...common.btn,
              background: mode === m ? "#4a7c3f" : "#e8f5e4",
              color: mode === m ? "#fff" : "#3a5f30",
              border: "1px solid #b8d0a8",
            }}
          >
            {m === "device" ? "Device" : "Rack Object"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: "0.6rem 0.75rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          {/* Side — locked to activeSide; change via the Front/Rear control in the rack header */}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>Side</span>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "front" | "rear")}
              disabled
              style={{ ...common.input, width: "80px" }}
            >
              <option value="front">Front</option>
              <option value="rear">Rear</option>
            </select>
          </label>

          {/* Target selector */}
          {mode === "device" ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: "160px" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>
                Device{" "}
                <span style={{ color: "#888" }}>
                  ({unplacedDevices.length} unplaced)
                </span>
              </span>
              <select
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  setSubmitError(null);
                  setSuccessId(null);
                }}
                disabled={working || targetsLoading}
                style={{ ...common.input, width: "100%" }}
              >
                <option value="">— select —</option>
                {unplacedDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                    {d.name ? ` — ${d.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: "160px" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>
                Rack object model{" "}
                <span style={{ color: "#888" }}>
                  ({rackObjectModels.length} available)
                </span>
              </span>
              <select
                value={deviceModelId}
                onChange={(e) => {
                  setDeviceModelId(e.target.value);
                  setSubmitError(null);
                  setSuccessId(null);
                }}
                disabled={working || targetsLoading}
                style={{ ...common.input, width: "100%" }}
              >
                <option value="">— select —</option>
                {rackObjectModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}{" "}
                    ({m.default_height_u}U)
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Start U */}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>Start U</span>
            <input
              type="number"
              min={1}
              step={1}
              value={startU}
              onChange={(e) => {
                setStartU(e.target.value);
                setSubmitError(null);
                setSuccessId(null);
              }}
              disabled={working}
              style={{ ...common.input, width: "80px" }}
            />
          </label>

          {/* Height U override */}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>
              Height U{" "}
              <span style={{ color: "#888" }}>(optional)</span>
            </span>
            <input
              type="number"
              min={1}
              step={1}
              placeholder="—"
              value={heightU}
              onChange={(e) => {
                setHeightU(e.target.value);
                setSubmitError(null);
                setSuccessId(null);
              }}
              disabled={working}
              style={{ ...common.input, width: "80px" }}
            />
          </label>

          <button
            type="submit"
            disabled={addDisabled}
            style={{ ...common.btn, alignSelf: "flex-end", background: "#4a7c3f", color: "#fff" }}
          >
            {working ? "Adding…" : "Add"}
          </button>
        </div>

        {targetsLoading && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#555" }}>
            Loading available targets…
          </p>
        )}
        {targetLoadError && (
          <div
            style={{
              marginTop: "0.4rem",
              padding: "0.3rem 0.5rem",
              background: "#fff0f0",
              border: "1px solid #f88",
              color: "#b00",
              borderRadius: 3,
              fontSize: "0.78rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ flex: 1 }}>Failed to load targets: {targetLoadError}</span>
            <button
              type="button"
              onClick={() => setManualRetryToken((t) => t + 1)}
              style={{ ...common.btn, flexShrink: 0 }}
            >
              Retry
            </button>
          </div>
        )}
        {submitError && (
          <div
            style={{
              marginTop: "0.4rem",
              padding: "0.3rem 0.5rem",
              background: "#fff0f0",
              border: "1px solid #f88",
              color: "#b00",
              borderRadius: 3,
              fontSize: "0.78rem",
            }}
          >
            {submitError}
          </div>
        )}
        {successId && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#2a7a2a" }}>
            Added in memory. Use Save to persist changes.
          </p>
        )}
      </form>

      {/* Drag palette */}
      {!targetsLoading && !targetLoadError && (unplacedDevices.length > 0 || rackObjectModels.length > 0) && (
        <div style={{ borderTop: "1px solid var(--bd-1)", padding: "8px 12px" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Drag to place · {activeSide === "front" ? "Front" : "Rear"}
          </div>
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
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(DND_DATA_TYPE, encodeDndPayload(payload));
                    setActiveDragPayload(payload);
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
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(DND_DATA_TYPE, encodeDndPayload(payload));
                    setActiveDragPayload(payload);
                  }}
                  onDragEnd={() => setActiveDragPayload(null)}
                  title={`Drag to place ${m.code} (${m.default_height_u}U)`}
                >
                  <span className="pc-drag">⠿</span>
                  <span className="pc-name">{m.code}</span>
                  <span className="pc-meta">{m.default_height_u}U</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
