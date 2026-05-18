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

interface Props {
  rack: RackSummaryDto;
  onAddSuccess: (newPlacementId: string) => void;
  reloadToken: number;
}

type Mode = "device" | "rack_object";

function parsePositiveInt(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n < 1 || String(n) !== trimmed) return null;
  return n;
}

export function AddPlacementPanel({ rack, onAddSuccess, reloadToken }: Props) {
  const [mode, setMode] = useState<Mode>("device");
  const [side, setSide] = useState<"front" | "rear">("front");
  const [deviceId, setDeviceId] = useState("");
  const [deviceModelId, setDeviceModelId] = useState("");
  const [startU, setStartU] = useState("");
  const [heightU, setHeightU] = useState("");
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [deviceModels, setDeviceModels] = useState<DeviceModelDto[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  function loadTargets() {
    Promise.all([listDevices(), listDeviceModels()])
      .then(([devs, models]) => {
        setDevices(devs.filter((d) => !d.is_placed));
        setDeviceModels(models.filter((m) => m.device_type === "rack_object"));
      })
      .catch((e) => setError(String(e)));
  }

  // Reset form state when the rack changes.
  useEffect(() => {
    setError(null);
    setSuccessId(null);
    setDeviceId("");
    setDeviceModelId("");
    setStartU("");
    setHeightU("");
  }, [rack.id]);

  // Reload target lists when the rack changes or when explicitly requested via reloadToken.
  // Runs independently of form state so success messages survive target-list reloads.
  useEffect(() => {
    loadTargets();
  }, [rack.id, reloadToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetInputs() {
    setDeviceId("");
    setDeviceModelId("");
    setStartU("");
    setHeightU("");
  }

  function handleModeChange(next: Mode) {
    setMode(next);
    resetInputs();
    setError(null);
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
      setError(err);
      return;
    }
    const su = parsePositiveInt(startU)!;
    const hu = heightU.trim() !== "" ? parsePositiveInt(heightU) : null;

    // Capture before inputs are reset
    const placedDeviceId = deviceId;

    setWorking(true);
    setError(null);
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
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  const unplacedDevices = devices;
  const rackObjectModels = deviceModels;

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
          {/* Side */}
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>Side</span>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "front" | "rear")}
              disabled={working}
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
                  setError(null);
                  setSuccessId(null);
                }}
                disabled={working}
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
                  setError(null);
                  setSuccessId(null);
                }}
                disabled={working}
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
                setError(null);
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
                setError(null);
                setSuccessId(null);
              }}
              disabled={working}
              style={{ ...common.input, width: "80px" }}
            />
          </label>

          <button
            type="submit"
            disabled={working}
            style={{ ...common.btn, alignSelf: "flex-end", background: "#4a7c3f", color: "#fff" }}
          >
            {working ? "Adding…" : "Add"}
          </button>
        </div>

        {error && (
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
            {error}
          </div>
        )}
        {successId && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "#2a7a2a" }}>
            Added in memory. Use Save to persist changes.
          </p>
        )}
      </form>
    </div>
  );
}
