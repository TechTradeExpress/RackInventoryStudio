import { useState, useEffect } from "react";
import {
  placeDevice,
  placeRackObject,
  type DeviceDto,
  type DeviceModelDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { useBusy } from "../../lib/appBusy";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { parsePositiveInt } from "./positiveInt";

type TargetType = "device" | "rack_object";

export interface PlacePlacementModalProps {
  open: boolean;
  rack: RackSummaryDto;
  side: "front" | "rear";
  startU: number | null;
  availableDevices: DeviceDto[];
  availableRackObjects: DeviceModelDto[];
  onClose: () => void;
  onPlaced: (placementId: string) => void;
}

export function PlacePlacementModal({
  open,
  rack,
  side,
  startU,
  availableDevices,
  availableRackObjects,
  onClose,
  onPlaced,
}: PlacePlacementModalProps) {
  const { runBusy } = useBusy();

  const [targetType, setTargetType] = useState<TargetType>("device");
  const [deviceId, setDeviceId] = useState("");
  const [deviceModelId, setDeviceModelId] = useState("");
  const [startUStr, setStartUStr] = useState(startU !== null ? String(startU) : "");
  const [heightUStr, setHeightUStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTargetType("device");
      setDeviceId("");
      setDeviceModelId("");
      setStartUStr(startU !== null ? String(startU) : "");
      setHeightUStr("");
      setError(null);
    }
  }, [open, startU]);

  // Derive effective height display for selected rack object
  const selectedModel =
    targetType === "rack_object"
      ? availableRackObjects.find((m) => m.id === deviceModelId) ?? null
      : null;
  const effectiveHeight = selectedModel?.default_height_u ?? null;

  function validate(): string | null {
    if (parsePositiveInt(startUStr) === null) {
      return "Start U must be a positive integer.";
    }
    if (heightUStr.trim() !== "" && parsePositiveInt(heightUStr) === null) {
      return "Height U override must be a positive integer if provided.";
    }
    if (targetType === "device" && !deviceId) {
      return "Select a device.";
    }
    if (targetType === "rack_object" && !deviceModelId) {
      return "Select a rack object model.";
    }
    return null;
  }

  async function handlePlace() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const su = parsePositiveInt(startUStr)!;
    const hu = heightUStr.trim() !== "" ? parsePositiveInt(heightUStr) : null;
    setError(null);

    try {
      let newId: string;
      if (targetType === "device") {
        newId = await runBusy("Placing equipment…", () =>
          placeDevice({
            rack_id: rack.id,
            device_id: deviceId,
            side,
            start_u: su,
            height_u: hu,
          }),
        );
      } else {
        newId = await runBusy("Placing equipment…", () =>
          placeRackObject({
            rack_id: rack.id,
            device_model_id: deviceModelId,
            side,
            start_u: su,
            height_u: hu,
          }),
        );
      }
      onPlaced(newId);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }

  const canPlace = targetType === "device" ? !!deviceId : !!deviceModelId;

  return (
    <Modal
      open={open}
      title="Place equipment"
      subtitle={
        <>
          {rack.code} · {side === "front" ? "Front" : "Rear"} side
        </>
      }
      onClose={onClose}
      size="md"
      footerMessage={error ?? undefined}
      footerMessageTone={error ? "err" : undefined}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePlace}
            disabled={!canPlace}
            data-testid="place-btn"
          >
            Place
          </button>
        </>
      }
    >
      <div className="form-grid">
        {/* Target type selector */}
        <div className="field" style={{ gridColumn: "span 12" }}>
          <label>Type</label>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="target-type"
                value="device"
                checked={targetType === "device"}
                onChange={() => {
                  setTargetType("device");
                  setDeviceId("");
                  setDeviceModelId("");
                  setError(null);
                }}
              />
              Device
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                name="target-type"
                value="rack_object"
                checked={targetType === "rack_object"}
                onChange={() => {
                  setTargetType("rack_object");
                  setDeviceId("");
                  setDeviceModelId("");
                  setError(null);
                }}
              />
              Rack Object
            </label>
          </div>
        </div>

        {/* Device / rack object selector */}
        {targetType === "device" ? (
          <Field
            label={`Device (${availableDevices.length} unplaced)`}
            required
            className="col-12"
          >
            <select
              className="ri-input"
              value={deviceId}
              onChange={(e) => {
                setDeviceId(e.target.value);
                setError(null);
              }}
              data-testid="device-select"
            >
              <option value="">— select —</option>
              {availableDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                  {d.name ? ` — ${d.name}` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field
            label={`Rack object model (${availableRackObjects.length} available)`}
            required
            className="col-12"
          >
            <select
              className="ri-input"
              value={deviceModelId}
              onChange={(e) => {
                setDeviceModelId(e.target.value);
                setError(null);
              }}
              data-testid="rack-object-select"
            >
              <option value="">— select —</option>
              {availableRackObjects.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name} ({m.default_height_u}U)
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Start U */}
        <Field label="Start U" required className="col-6">
          <input
            className="ri-input"
            type="number"
            min={1}
            step={1}
            value={startUStr}
            onChange={(e) => {
              setStartUStr(e.target.value);
              setError(null);
            }}
            data-testid="start-u-input"
          />
        </Field>

        {/* Height U override */}
        <Field
          label="Height U override"
          help={
            effectiveHeight !== null
              ? `Default from model: ${effectiveHeight}U`
              : "Leave blank to use model default"
          }
          className="col-6"
        >
          <input
            className="ri-input"
            type="number"
            min={1}
            step={1}
            placeholder="—"
            value={heightUStr}
            onChange={(e) => {
              setHeightUStr(e.target.value);
              setError(null);
            }}
            data-testid="height-u-input"
          />
        </Field>
      </div>
    </Modal>
  );
}
