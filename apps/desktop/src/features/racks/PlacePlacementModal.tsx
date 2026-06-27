import { useState, useEffect } from "react";
import {
  placeDevice,
  placeRackObject,
  listDevices,
  listDeviceModels,
  type DeviceDto,
  type DeviceModelDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { useBusy } from "../../lib/appBusy";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { parsePositiveInt } from "./positiveInt";
import { DeviceFormModal } from "../devices/DeviceFormModal";
import { DeviceModelFormModal } from "../deviceModels/DeviceModelFormModal";

type TargetType = "device" | "rack_object";

export interface PlacePlacementModalProps {
  open: boolean;
  rack: RackSummaryDto;
  side: "front" | "rear";
  startU: number | null;
  availableDevices: DeviceDto[];
  availableRackObjects: DeviceModelDto[];
  /** Preselect a target type when opened from the palette "Place…" button. */
  initialTargetKind?: "device" | "rack_object" | null;
  /** Preselect a specific device/model ID when opened from the palette "Place…" button. */
  initialTargetId?: string | null;
  /** Default status for inline-created devices. Derived from work mode by the caller. */
  defaultDeviceStatus?: string;
  onClose: () => void;
  onPlaced: (placementId: string) => void;
  /**
   * Called after a device is successfully created from the inline device form,
   * allowing the parent to refresh its own device/palette state.
   */
  onDeviceCreated?: () => void;
  /**
   * Called after a rack object model is successfully created from the inline form,
   * allowing the parent to refresh its own rack object/palette state.
   */
  onRackObjectCreated?: () => void;
}

export function PlacePlacementModal({
  open,
  rack,
  side,
  startU,
  availableDevices,
  availableRackObjects,
  initialTargetKind,
  initialTargetId,
  defaultDeviceStatus,
  onClose,
  onPlaced,
  onDeviceCreated,
  onRackObjectCreated,
}: PlacePlacementModalProps) {
  const { runBusy } = useBusy();

  const [targetType, setTargetType] = useState<TargetType>("device");
  const [deviceId, setDeviceId] = useState("");
  const [deviceModelId, setDeviceModelId] = useState("");
  const [startUStr, setStartUStr] = useState(startU !== null ? String(startU) : "");
  const [heightUStr, setHeightUStr] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Local device list — synced from prop on open, then managed internally
  // (refreshed after inline device creation so new device appears immediately).
  const [localDevices, setLocalDevices] = useState<DeviceDto[]>(availableDevices);

  // Local rack object list — synced from prop on open, refreshed after inline model creation.
  const [localRackObjects, setLocalRackObjects] = useState<DeviceModelDto[]>(availableRackObjects);

  // Inline device creation state
  const [createDeviceOpen, setCreateDeviceOpen] = useState(false);
  const [allModels, setAllModels] = useState<DeviceModelDto[]>([]);

  // Inline rack object creation state
  const [createRackObjectOpen, setCreateRackObjectOpen] = useState(false);

  // Inline device edit state
  const [editDeviceOpen, setEditDeviceOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceDto | null>(null);

  // Inline rack object edit state
  const [editRackObjectOpen, setEditRackObjectOpen] = useState(false);
  const [editingRackObject, setEditingRackObject] = useState<DeviceModelDto | null>(null);

  // Reset form when modal opens; apply initial preselection if provided
  useEffect(() => {
    if (open) {
      const kind: TargetType =
        initialTargetKind === "rack_object" ? "rack_object" : "device";
      setTargetType(kind);
      if (kind === "device") {
        setDeviceId(initialTargetId ?? "");
        setDeviceModelId("");
      } else {
        setDeviceModelId(initialTargetId ?? "");
        setDeviceId("");
      }
      setStartUStr(startU !== null ? String(startU) : "");
      setHeightUStr("");
      setError(null);
      setCreateDeviceOpen(false);
      setCreateRackObjectOpen(false);
      setEditDeviceOpen(false);
      setEditingDevice(null);
      setEditRackObjectOpen(false);
      setEditingRackObject(null);
      setLocalDevices(availableDevices);
      setLocalRackObjects(availableRackObjects);
    }
  }, [open, startU, initialTargetKind, initialTargetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive effective height display for selected rack object
  const selectedModel =
    targetType === "rack_object"
      ? localRackObjects.find((m) => m.id === deviceModelId) ?? null
      : null;
  const effectiveHeight = selectedModel?.default_height_u ?? null;

  function validate(): string | null {
    if (parsePositiveInt(startUStr) === null) {
      return "Start U must be a positive integer.";
    }
    if (heightUStr.trim() !== "" && parsePositiveInt(heightUStr) === null) {
      return "Height override must be a positive integer if provided.";
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

  async function handleOpenCreateDevice() {
    try {
      const models = await listDeviceModels();
      setAllModels(models.filter((m) => m.device_type !== "rack_object"));
    } catch {
      setAllModels([]);
    }
    setCreateDeviceOpen(true);
  }

  async function handleDeviceSaved(newDeviceId?: string) {
    setCreateDeviceOpen(false);
    // Preselect immediately so Place button enables without waiting for the list refresh
    if (newDeviceId) {
      setDeviceId(newDeviceId);
      setError(null);
    }
    // Refresh device list so the new device option appears in the selector
    try {
      const devs = await listDevices();
      setLocalDevices(devs.filter((d) => !d.is_placed));
    } catch {
      // ignore — user can still place the selected device
    }
    onDeviceCreated?.();
  }

  async function handleOpenEditDevice() {
    const device = localDevices.find((d) => d.id === deviceId);
    if (!device) return;
    try {
      const models = await listDeviceModels();
      setAllModels(models.filter((m) => m.device_type !== "rack_object"));
    } catch {
      setAllModels([]);
    }
    setEditingDevice(device);
    setEditDeviceOpen(true);
  }

  async function handleEditDeviceSaved() {
    setEditDeviceOpen(false);
    setEditingDevice(null);
    try {
      const devs = await listDevices();
      setLocalDevices(devs.filter((d) => !d.is_placed));
    } catch {
      // ignore
    }
  }

  function handleOpenEditRackObject() {
    const model = localRackObjects.find((m) => m.id === deviceModelId);
    if (!model) return;
    setEditingRackObject(model);
    setEditRackObjectOpen(true);
  }

  async function handleEditRackObjectSaved() {
    setEditRackObjectOpen(false);
    setEditingRackObject(null);
    try {
      const models = await listDeviceModels();
      setLocalRackObjects(models.filter((m) => m.device_type === "rack_object"));
    } catch {
      // ignore
    }
  }

  async function handleRackObjectSaved(newModelId?: string) {
    setCreateRackObjectOpen(false);
    if (newModelId) {
      setDeviceModelId(newModelId);
      setError(null);
    }
    try {
      const models = await listDeviceModels();
      setLocalRackObjects(models.filter((m) => m.device_type === "rack_object"));
    } catch {
      // ignore — user can still place with the preselected model
    }
    onRackObjectCreated?.();
  }

  const canPlace = targetType === "device" ? !!deviceId : !!deviceModelId;

  return (
    <>
      {/* Place equipment modal — onClose blocked while sub-forms are layered on top */}
      <Modal
        open={open}
        title="Place equipment"
        subtitle={
          <>
            {rack.name?.trim() || "Unnamed rack"} · {side === "front" ? "Front" : "Rear"} side
          </>
        }
        onClose={createDeviceOpen || createRackObjectOpen || editDeviceOpen || editRackObjectOpen ? undefined : onClose}
        size="md"
        footerMessage={error ?? undefined}
        footerMessageTone={error ? "err" : undefined}
        footer={
          <>
            <button className="btn" onClick={onClose} disabled={createDeviceOpen || createRackObjectOpen || editDeviceOpen || editRackObjectOpen}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handlePlace}
              disabled={!canPlace || createDeviceOpen || createRackObjectOpen || editDeviceOpen || editRackObjectOpen}
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
            <>
              <Field
                label={`Device (${localDevices.length} unplaced)`}
                required
                className="col-12"
              >
                <SearchableSelect
                  options={localDevices.map((d) => ({
                    value: d.id,
                    label: d.name?.trim() || "Unnamed device",
                    keywords: [
                      d.device_type,
                      d.status,
                      d.serial_number,
                      d.asset_tag,
                      d.external_ref,
                      d.device_model_code,
                    ]
                      .filter(Boolean)
                      .join(" "),
                    meta:
                      [
                        d.device_type,
                        d.status,
                        d.serial_number ? `S/N: ${d.serial_number}` : null,
                        d.asset_tag ? `AT: ${d.asset_tag}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined,
                  }))}
                  value={deviceId}
                  onChange={(val) => {
                    setDeviceId(val);
                    setError(null);
                  }}
                  placeholder="— select device —"
                  data-testid="device-select"
                />
              </Field>
              <div className="col-12" style={{ marginTop: -4, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={handleOpenCreateDevice}
                  data-testid="create-device-btn"
                >
                  Create new device…
                </button>
                {deviceId && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleOpenEditDevice}
                    data-testid="edit-device-btn"
                  >
                    Edit device…
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <Field
                label={`Rack object model (${localRackObjects.length} available)`}
                required
                className="col-12"
              >
                <SearchableSelect
                  options={localRackObjects.map((m) => ({
                    value: m.id,
                    label: m.name?.trim() || "Unnamed model",
                    keywords: [m.vendor, m.model_number, m.device_type]
                      .filter(Boolean)
                      .join(" "),
                    meta:
                      [
                        m.vendor,
                        m.model_number,
                        `${m.default_height_u}U`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined,
                  }))}
                  value={deviceModelId}
                  onChange={(val) => {
                    setDeviceModelId(val);
                    setError(null);
                  }}
                  placeholder="— select rack object —"
                  data-testid="rack-object-select"
                />
              </Field>
              <div className="col-12" style={{ marginTop: -4, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setCreateRackObjectOpen(true)}
                  data-testid="create-rack-object-btn"
                >
                  Create new rack object…
                </button>
                {deviceModelId && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleOpenEditRackObject}
                    data-testid="edit-rack-object-btn"
                  >
                    Edit rack object…
                  </button>
                )}
              </div>
            </>
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

          {/* Height override */}
          <Field
            label="Height override"
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

      {/* Inline device creation — layered on top of the place modal */}
      <DeviceFormModal
        open={createDeviceOpen}
        editing={null}
        models={allModels}
        onClose={() => setCreateDeviceOpen(false)}
        onSaved={handleDeviceSaved}
        defaultStatus={defaultDeviceStatus}
      />

      {/* Inline rack object creation — layered on top of the place modal */}
      <DeviceModelFormModal
        open={createRackObjectOpen}
        editing={null}
        onClose={() => setCreateRackObjectOpen(false)}
        onSaved={handleRackObjectSaved}
        forcedDeviceType="rack_object"
        lockDeviceType
      />

      {/* Inline device edit — layered on top of the place modal */}
      <DeviceFormModal
        open={editDeviceOpen}
        editing={editingDevice}
        models={allModels}
        onClose={() => { setEditDeviceOpen(false); setEditingDevice(null); }}
        onSaved={handleEditDeviceSaved}
      />

      {/* Inline rack object edit — layered on top of the place modal */}
      <DeviceModelFormModal
        open={editRackObjectOpen}
        editing={editingRackObject}
        onClose={() => { setEditRackObjectOpen(false); setEditingRackObject(null); }}
        onSaved={handleEditRackObjectSaved}
      />
    </>
  );
}
