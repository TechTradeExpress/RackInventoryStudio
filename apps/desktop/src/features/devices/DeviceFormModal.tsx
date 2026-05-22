import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { parseTags, joinTags } from "../../lib/tags";
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
  code: string;
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
  code: "",
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
    code: dev.code,
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

function isDirty(form: FormState, editing: DeviceDto | null): boolean {
  if (!editing) {
    return (
      form.deviceType !== "" ||
      form.code !== "" ||
      form.name !== "" ||
      form.status !== "planned" ||
      form.deviceModelId !== "" ||
      form.serialNumber !== "" ||
      form.assetTag !== "" ||
      form.externalRef !== "" ||
      form.description !== "" ||
      form.tags !== ""
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

export interface DeviceFormModalProps {
  open: boolean;
  /** null → add mode, DeviceDto → edit mode */
  editing: DeviceDto | null;
  /** All non-rack_object device models; filtering by type is done internally. */
  models: DeviceModelDto[];
  onClose: () => void;
  onSaved: () => void;
}

export function DeviceFormModal({
  open,
  editing,
  models,
  onClose,
  onSaved,
}: DeviceFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      setForm(editing ? deviceToForm(editing) : EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open, editing]);

  function set(
    k: keyof FormState,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const value = e.target.value;
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

  const filteredModels = form.deviceType
    ? models.filter((m) => m.device_type === form.deviceType)
    : models;

  const codeVal = form.code.trim();
  const codeFormatErr =
    !isEdit && codeVal !== "" && !/^[a-z0-9._-]+$/.test(codeVal)
      ? "Use lowercase letters, digits, hyphens, underscores or dots."
      : null;

  const missingType = !form.deviceType;
  const missingCode = !codeVal;
  const missingStatus = !form.status;
  const hasIdentifier =
    form.name.trim() !== "" ||
    form.serialNumber.trim() !== "" ||
    form.assetTag.trim() !== "";

  const canSave =
    !missingType &&
    !missingCode &&
    !missingStatus &&
    hasIdentifier &&
    !codeFormatErr &&
    !submitting;

  const footerMsg: string | null = (() => {
    if (error) return error;
    const missing = [
      ...(missingType ? ["device type"] : []),
      ...(missingCode ? ["code"] : []),
      ...(missingStatus ? ["status"] : []),
    ];
    if (missing.length) return `Required: ${missing.join(", ")}`;
    if (!hasIdentifier)
      return "Required: at least one of name, serial number, or asset tag.";
    if (codeFormatErr) return codeFormatErr;
    return null;
  })();

  async function handleSave(e?: FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await updateDevice({
          id: editing.id,
          device_type: form.deviceType,
          code: editing.code,
          name: form.name.trim() || undefined,
          device_model_id: form.deviceModelId || undefined,
          serial_number: form.serialNumber.trim() || undefined,
          asset_tag: form.assetTag.trim() || undefined,
          external_ref: form.externalRef.trim() || undefined,
          status: form.status,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
      } else {
        await addDevice({
          device_type: form.deviceType,
          code: codeVal,
          name: form.name.trim() || undefined,
          device_model_id: form.deviceModelId || undefined,
          serial_number: form.serialNumber.trim() || undefined,
          asset_tag: form.assetTag.trim() || undefined,
          external_ref: form.externalRef.trim() || undefined,
          status: form.status,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const dirty = isDirty(form, editing);

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

          <Field className="col-4" label="Device type" required>
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

          <Field
            className="col-4"
            label="Code"
            required={!isEdit}
            help={
              !isEdit
                ? "Lowercase letters, digits, hyphens, underscores, dots."
                : undefined
            }
            error={codeFormatErr}
          >
            <input
              className="input mono"
              value={form.code}
              onChange={(e) => set("code", e)}
              placeholder="e.g. srv-prod-01"
              disabled={isEdit || submitting}
              autoFocus={!isEdit}
              data-testid="field-code"
            />
          </Field>

          <Field className="col-4" label="Status" required>
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
              autoFocus={isEdit}
              data-testid="field-name"
            />
          </Field>

          {/* ── Hardware ─────────────────────────────────────────── */}
          <div className="form-section">
            <div className="form-section-title">Hardware</div>
          </div>

          <Field label="Device model">
            <select
              className="input"
              value={form.deviceModelId}
              onChange={(e) => set("deviceModelId", e)}
              disabled={submitting}
              data-testid="field-device-model"
            >
              <option value="">— none —</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
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
