import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { parseTags, joinTags } from "../../lib/tags";
import { useBusy } from "../../lib/appBusy";
import {
  addDevice,
  updateDevice,
  type DeviceDto,
  type DeviceModelDto,
} from "../../api/tauriClient";

const DEVICE_TYPES = [
  "server",
  "network",
  "storage",
  "ups",
  "appliance",
  "other",
] as const;

const DEVICE_STATUSES = [
  "planned",
  "in_stock",
  "installed",
  "to_remove",
  "removed",
  "disposed",
  "unknown",
] as const;

interface FormState {
  deviceType: string;
  name: string;
  status: string;
  deviceModelId: string;
  serialNumber: string;
  assetTag: string;
  externalRef: string;
  description: string;
  tags: string;
}

const EMPTY: FormState = {
  deviceType: "",
  name: "",
  status: "planned",
  deviceModelId: "",
  serialNumber: "",
  assetTag: "",
  externalRef: "",
  description: "",
  tags: "",
};

function deviceToForm(dev: DeviceDto): FormState {
  return {
    deviceType: dev.device_type,
    name: dev.name ?? "",
    status: dev.status,
    deviceModelId: dev.device_model_id ?? "",
    serialNumber: dev.serial_number ?? "",
    assetTag: dev.asset_tag ?? "",
    externalRef: dev.external_ref ?? "",
    description: dev.description ?? "",
    tags: joinTags(dev.tags),
  };
}

function isDirty(form: FormState, editing: DeviceDto | null, initialForm: FormState = EMPTY): boolean {
  if (!editing) {
    return (
      form.deviceType !== initialForm.deviceType ||
      form.name !== initialForm.name ||
      form.status !== initialForm.status ||
      form.deviceModelId !== initialForm.deviceModelId ||
      form.serialNumber !== initialForm.serialNumber ||
      form.assetTag !== initialForm.assetTag ||
      form.externalRef !== initialForm.externalRef ||
      form.description !== initialForm.description ||
      form.tags !== initialForm.tags
    );
  }
  const orig = deviceToForm(editing);
  return (
    form.deviceType !== orig.deviceType ||
    form.name !== orig.name ||
    form.status !== orig.status ||
    form.deviceModelId !== orig.deviceModelId ||
    form.serialNumber !== orig.serialNumber ||
    form.assetTag !== orig.assetTag ||
    form.externalRef !== orig.externalRef ||
    form.description !== orig.description ||
    form.tags !== orig.tags
  );
}

export interface DevicePrefill {
  deviceType?: string;
  name?: string;
  status?: string;
  deviceModelId?: string;
  description?: string;
  tags?: string;
}

export interface DeviceFormModalProps {
  open: boolean;
  /** null → add mode, DeviceDto → edit mode */
  editing: DeviceDto | null;
  /** All non-rack_object device models; filtering by type is done internally. */
  models: DeviceModelDto[];
  onClose: () => void;
  /** In add mode the newly created device ID is passed; in edit mode no argument is passed. */
  onSaved: (newDeviceId?: string) => void;
  /** Default status for new devices (add mode only). Ignored in edit mode. */
  defaultStatus?: string;
  /** Pre-fill form fields in add mode (ignored in edit mode). Takes priority over defaultStatus for status. */
  prefill?: DevicePrefill;
}

export function DeviceFormModal({
  open,
  editing,
  models,
  onClose,
  onSaved,
  defaultStatus,
  prefill,
}: DeviceFormModalProps) {
  const { runBusy } = useBusy();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFormRef = useRef<FormState>(EMPTY);
  // Tracks whether the user has manually changed device type.
  // When false, selecting a model auto-fills the device type field.
  // Set to true on edit mode open (existing type is intentional).
  const [deviceTypeTouched, setDeviceTypeTouched] = useState(false);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      const initial = editing
        ? deviceToForm(editing)
        : { ...EMPTY, status: defaultStatus ?? EMPTY.status, ...prefill };
      initialFormRef.current = initial;
      setForm(initial);
      setError(null);
      setSubmitting(false);
      // In edit mode the existing type is intentional; in add/create-similar it is not.
      setDeviceTypeTouched(editing !== null);
    }
  }, [open, editing, defaultStatus, prefill]);

  function set(
    k: keyof FormState,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const value = e.target.value;
    if (k === "deviceType") setDeviceTypeTouched(true);
    setForm((f) => {
      const next = { ...f, [k]: value };
      // Clear model selection when device type changes and model no longer matches
      if (k === "deviceType" && next.deviceModelId) {
        const selected = models.find((m) => m.id === next.deviceModelId);
        if (selected && selected.device_type !== value) next.deviceModelId = "";
      }
      return next;
    });
  }

  function handleModelChange(val: string) {
    setForm((f) => {
      const next = { ...f, deviceModelId: val };
      // Auto-fill device type from the selected model unless user has manually chosen a type.
      if (!deviceTypeTouched && val) {
        const selectedModel = models.find((m) => m.id === val);
        if (selectedModel) next.deviceType = selectedModel.device_type;
      }
      return next;
    });
  }

  const filteredModels =
    form.deviceType && deviceTypeTouched
      ? models.filter((m) => m.device_type === form.deviceType)
      : models;

  const missingType = !form.deviceType;
  const missingStatus = !form.status;
  const hasIdentifier =
    form.name.trim() !== "" ||
    form.serialNumber.trim() !== "" ||
    form.assetTag.trim() !== "" ||
    form.externalRef.trim() !== "";

  const canSave =
    !missingType &&
    !missingStatus &&
    hasIdentifier &&
    !submitting;

  const footerMsg: string | null = (() => {
    if (error) return error;
    const missing = [
      ...(missingType ? ["device type"] : []),
      ...(missingStatus ? ["status"] : []),
    ];
    if (missing.length) return `Required: ${missing.join(", ")}`;
    if (!hasIdentifier)
      return "Required: at least one of name, serial number, asset tag, or external reference.";
    return null;
  })();

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await runBusy("Saving device…", () =>
          updateDevice({
            id: editing.id,
            device_type: form.deviceType,
            name: form.name.trim() || undefined,
            device_model_id: form.deviceModelId || undefined,
            serial_number: form.serialNumber.trim() || undefined,
            asset_tag: form.assetTag.trim() || undefined,
            external_ref: form.externalRef.trim() || undefined,
            status: form.status,
            description: form.description.trim() || undefined,
            tags: parseTags(form.tags),
          }),
        );
        onSaved();
      } else {
        const newId = await runBusy("Creating device…", () =>
          addDevice({
            device_type: form.deviceType,
            name: form.name.trim() || undefined,
            device_model_id: form.deviceModelId || undefined,
            serial_number: form.serialNumber.trim() || undefined,
            asset_tag: form.assetTag.trim() || undefined,
            external_ref: form.externalRef.trim() || undefined,
            status: form.status,
            description: form.description.trim() || undefined,
            tags: parseTags(form.tags),
          }),
        );
        onSaved(newId);
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const dirty = isDirty(form, editing, initialFormRef.current);

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit device" : "Add device"}
      subtitle="A concrete hardware instance tracked in the inventory, independent of its rack placement."
      onClose={onClose}
      size="lg"
      disableBackdropClose={dirty}
      footerMessage={footerMsg}
      footerMessageTone={error ? "err" : "warn"}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="device-form"
            disabled={!canSave}
          >
            {submitting
              ? isEdit
                ? "Saving…"
                : "Adding…"
              : isEdit
                ? "Save changes"
                : "Create device"}
          </button>
        </>
      }
    >
      <form id="device-form" onSubmit={handleSave}>
        <div className="form-grid">
          {/* ── Identity ─────────────────────────────────────────── */}
          <div className="form-section">
            <div className="form-section-title">Identity</div>
          </div>

          <Field className="col-6" label="Device type" required>
            <select
              className="input"
              value={form.deviceType}
              onChange={(e) => set("deviceType", e)}
              disabled={submitting}
              data-testid="field-device-type"
            >
              <option value="">— select —</option>
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field className="col-6" label="Status" required>
            <select
              className="input"
              value={form.status}
              onChange={(e) => set("status", e)}
              disabled={submitting}
              data-testid="field-status"
            >
              {DEVICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e)}
              placeholder="e.g. Production Web Server 01"
              disabled={submitting}
              autoFocus
              data-testid="field-name"
            />
          </Field>

          {/* ── Hardware ─────────────────────────────────────────── */}
          <div className="form-section">
            <div className="form-section-title">Hardware</div>
          </div>

          <Field label="Device model">
            <SearchableSelect
              options={[
                { value: "", label: "— none —" },
                ...filteredModels.map((m) => ({
                  value: m.id,
                  label: m.name?.trim() || "Unnamed model",
                  keywords: [m.vendor, m.model_number, m.device_type]
                    .filter(Boolean)
                    .join(" "),
                  meta:
                    [
                      m.vendor,
                      m.model_number,
                      m.device_type,
                      m.default_height_u != null ? `${m.default_height_u}U` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined,
                })),
              ]}
              value={form.deviceModelId}
              onChange={handleModelChange}
              disabled={submitting}
              data-testid="field-device-model"
            />
          </Field>

          <Field className="col-6" label="Serial number">
            <input
              className="input mono"
              value={form.serialNumber}
              onChange={(e) => set("serialNumber", e)}
              placeholder="optional"
              disabled={submitting}
              data-testid="field-serial"
            />
          </Field>

          <Field className="col-6" label="Asset tag">
            <input
              className="input mono"
              value={form.assetTag}
              onChange={(e) => set("assetTag", e)}
              placeholder="optional"
              disabled={submitting}
              data-testid="field-asset-tag"
            />
          </Field>

          <Field label="External reference">
            <input
              className="input mono"
              value={form.externalRef}
              onChange={(e) => set("externalRef", e)}
              placeholder="optional — CMDB ID, ticket, URL"
              disabled={submitting}
            />
          </Field>

          {/* ── Metadata ─────────────────────────────────────────── */}
          <div className="form-section">
            <div className="form-section-title">Metadata</div>
          </div>

          <Field label="Description">
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e)}
              placeholder="optional"
              disabled={submitting}
            />
          </Field>

          <Field label="Tags" help="Comma-separated. e.g. production, web">
            <input
              className="input"
              value={form.tags}
              onChange={(e) => set("tags", e)}
              placeholder="optional"
              disabled={submitting}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
