import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { parseTags, joinTags } from "../../lib/tags";
import { parsePositiveInt } from "../racks/positiveInt";
import {
  addDeviceModel,
  updateDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";

const DEVICE_TYPES = [
  "server",
  "network",
  "storage",
  "ups",
  "appliance",
  "rack_object",
  "other",
] as const;

interface FormState {
  deviceType: string;
  name: string;
  vendor: string;
  modelNumber: string;
  heightU: string;
  description: string;
  tags: string;
}

const EMPTY: FormState = {
  deviceType: "",
  name: "",
  vendor: "",
  modelNumber: "",
  heightU: "",
  description: "",
  tags: "",
};

function modelToForm(m: DeviceModelDto): FormState {
  return {
    deviceType: m.device_type,
    name: m.name,
    vendor: m.vendor ?? "",
    modelNumber: m.model_number ?? "",
    heightU: String(m.default_height_u),
    description: m.description ?? "",
    tags: joinTags(m.tags),
  };
}

function isDirty(form: FormState, editing: DeviceModelDto | null, initialForm: FormState = EMPTY): boolean {
  if (!editing) {
    return (
      form.deviceType !== initialForm.deviceType ||
      form.name !== initialForm.name ||
      form.vendor !== initialForm.vendor ||
      form.modelNumber !== initialForm.modelNumber ||
      form.heightU !== initialForm.heightU ||
      form.description !== initialForm.description ||
      form.tags !== initialForm.tags
    );
  }
  const orig = modelToForm(editing);
  return (
    form.deviceType !== orig.deviceType ||
    form.name !== orig.name ||
    form.vendor !== orig.vendor ||
    form.modelNumber !== orig.modelNumber ||
    form.heightU !== orig.heightU ||
    form.description !== orig.description ||
    form.tags !== orig.tags
  );
}

export interface DeviceModelPrefill {
  deviceType?: string;
  name?: string;
  vendor?: string;
  modelNumber?: string;
  heightU?: string;
  description?: string;
  tags?: string;
}

export interface DeviceModelFormModalProps {
  open: boolean;
  /** null → add mode, DeviceModelDto → edit mode */
  editing: DeviceModelDto | null;
  onClose: () => void;
  /** In add mode, called with the new model's ID. In edit mode, called with no argument. */
  onSaved: (newModelId?: string) => void;
  /** Pre-initialise device type to this value on open (add mode only). */
  forcedDeviceType?: string;
  /** When true, hides the device type selector and locks the type to forcedDeviceType. */
  lockDeviceType?: boolean;
  /** Pre-fill form fields in add mode (ignored in edit mode). */
  prefill?: DeviceModelPrefill;
}

export function DeviceModelFormModal({
  open,
  editing,
  onClose,
  onSaved,
  forcedDeviceType,
  lockDeviceType,
  prefill,
}: DeviceModelFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialFormRef = useRef<FormState>(EMPTY);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      const initial = editing
        ? modelToForm(editing)
        : { ...EMPTY, deviceType: forcedDeviceType ?? "", ...prefill };
      initialFormRef.current = initial;
      setForm(initial);
      setError(null);
      setSubmitting(false);
    }
  }, [open, editing, forcedDeviceType, prefill]);

  const set =
    (k: keyof FormState) =>
    (
      e: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const missingType = !form.deviceType;
  const missingName = !form.name.trim();
  const missingHeight = !form.heightU.trim();
  const invalidHeight =
    !missingHeight && parsePositiveInt(form.heightU) === null;

  const canSave =
    !missingType &&
    !missingName &&
    !missingHeight &&
    !invalidHeight &&
    !submitting;

  const footerMsg: string | null = (() => {
    if (error) return error;
    const missing = [
      ...(missingType ? ["device type"] : []),
      ...(missingName ? ["name"] : []),
      ...(missingHeight ? ["height"] : []),
    ];
    if (missing.length) return `Required: ${missing.join(", ")}`;
    if (invalidHeight) return "Height (U) must be a positive integer.";
    return null;
  })();

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      const heightU = parsePositiveInt(form.heightU)!;
      if (isEdit) {
        await updateDeviceModel({
          id: editing.id,
          device_type: form.deviceType,
          name: form.name.trim(),
          vendor: form.vendor.trim() || undefined,
          model: form.modelNumber.trim() || undefined,
          default_height_u: heightU,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        onSaved();
      } else {
        const newModelId = await addDeviceModel({
          device_type: form.deviceType,
          name: form.name.trim(),
          vendor: form.vendor.trim() || undefined,
          model: form.modelNumber.trim() || undefined,
          default_height_u: heightU,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        onSaved(newModelId);
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const dirty = isDirty(form, editing, initialFormRef.current);
  const isLockedRackObject = !!lockDeviceType && !isEdit && forcedDeviceType === "rack_object";

  const title = isLockedRackObject
    ? "Create rack object"
    : isEdit
    ? "Edit device model"
    : "Add device model";

  return (
    <Modal
      open={open}
      title={title}
      subtitle="A hardware template that describes a device type and its physical parameters."
      onClose={onClose}
      size="md"
      disableBackdropClose={dirty}
      footerMessage={footerMsg}
      footerMessageTone={error ? "err" : "warn"}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {submitting
              ? isLockedRackObject
                ? "Creating…"
                : isEdit
                ? "Saving…"
                : "Adding…"
              : isLockedRackObject
              ? "Create rack object"
              : isEdit
              ? "Save changes"
              : "Create model"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {lockDeviceType ? (
          <Field label="Device type" required>
            <div
              className="input"
              style={{ color: "var(--tx-3)", pointerEvents: "none", userSelect: "none" }}
              data-testid="field-device-type-locked"
            >
              {forcedDeviceType ?? ""}
            </div>
          </Field>
        ) : (
          <Field label="Device type" required>
            <select
              className="input"
              value={form.deviceType}
              onChange={set("deviceType")}
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
        )}
        {form.deviceType === "rack_object" && (
          <Field>
            <p
              style={{
                fontSize: 12,
                color: "var(--tx-3)",
                margin: 0,
                padding: "4px 0",
              }}
            >
              Rack objects can be placed directly in racks without creating a
              Device.
            </p>
          </Field>
        )}
        <Field label="Name" required>
          <input
            className="input"
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. PowerEdge R750"
            disabled={submitting}
            autoFocus
            data-testid="field-name"
          />
        </Field>
        <Field className="col-6" label="Vendor">
          <input
            className="input"
            value={form.vendor}
            onChange={set("vendor")}
            placeholder="e.g. Dell"
            disabled={submitting}
          />
        </Field>
        <Field
          className="col-6"
          label="Manufacturer model / SKU"
          help="Vendor or catalog model identifier, for example PowerEdge R640, ICX 7150, or another SKU printed by the manufacturer."
        >
          <input
            className="input mono"
            value={form.modelNumber}
            onChange={set("modelNumber")}
            placeholder="e.g. PowerEdge R640"
            disabled={submitting}
            data-testid="field-model-sku"
          />
        </Field>
        <Field className="col-4" label="Height (U)" required>
          <input
            className="input mono"
            value={form.heightU}
            onChange={set("heightU")}
            placeholder="e.g. 2"
            disabled={submitting}
            data-testid="field-height-u"
          />
        </Field>
        <Field label="Description" className="col-8">
          <input
            className="input"
            value={form.description}
            onChange={set("description")}
            placeholder="optional"
            disabled={submitting}
          />
        </Field>
        <Field label="Tags" help="Comma-separated. e.g. server, rack">
          <input
            className="input"
            value={form.tags}
            onChange={set("tags")}
            placeholder="optional"
            disabled={submitting}
          />
        </Field>
      </div>
    </Modal>
  );
}
