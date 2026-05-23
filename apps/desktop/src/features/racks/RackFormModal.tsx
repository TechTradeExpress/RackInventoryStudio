import { useState, useEffect, type ChangeEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { parseTags, joinTags } from "../../lib/tags";
import { parsePositiveInt } from "./positiveInt";
import {
  addRack,
  updateRack,
  type RackSummaryDto,
} from "../../api/tauriClient";

const DEFAULT_RACK_HEIGHT_U = 42;

interface FormState {
  code: string;
  name: string;
  heightU: string;
  row: string;
  description: string;
  tags: string;
}

const EMPTY: FormState = {
  code: "",
  name: "",
  heightU: String(DEFAULT_RACK_HEIGHT_U),
  row: "",
  description: "",
  tags: "",
};

function rackToForm(rack: RackSummaryDto): FormState {
  return {
    code: rack.code,
    name: rack.name,
    heightU: String(rack.height_u),
    row: rack.row ?? "",
    description: rack.description ?? "",
    tags: joinTags(rack.tags),
  };
}

function isDirty(form: FormState, editing: RackSummaryDto | null): boolean {
  if (!editing) {
    return (Object.keys(EMPTY) as (keyof FormState)[]).some(
      (k) => form[k] !== EMPTY[k],
    );
  }
  const orig = rackToForm(editing);
  return (
    form.name !== orig.name ||
    form.heightU !== orig.heightU ||
    form.row !== orig.row ||
    form.description !== orig.description ||
    form.tags !== orig.tags
  );
}

export interface RackFormModalProps {
  open: boolean;
  /** null → add mode, RackSummaryDto → edit mode */
  editing: RackSummaryDto | null;
  locationId: string;
  locationLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RackFormModal({
  open,
  editing,
  locationId,
  locationLabel,
  onClose,
  onSaved,
}: RackFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      setForm(editing ? rackToForm(editing) : EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open, editing]);

  const set =
    (k: keyof FormState) =>
    (
      e: ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const codeVal = form.code.trim();
  const codeFormatErr =
    !isEdit && codeVal !== "" && !/^[a-z0-9._-]+$/.test(codeVal)
      ? "Use lowercase letters, digits, hyphens, underscores or dots."
      : null;

  const missingCode = !codeVal;
  const missingName = !form.name.trim();
  const missingHeight = !form.heightU.trim();
  const invalidHeight =
    !missingHeight && parsePositiveInt(form.heightU) === null;

  const canSave =
    !missingCode &&
    !missingName &&
    !missingHeight &&
    !invalidHeight &&
    !codeFormatErr &&
    !submitting;

  const footerMsg: string | null = (() => {
    if (error) return error;
    const missing = [
      ...(missingCode ? ["code"] : []),
      ...(missingName ? ["name"] : []),
      ...(missingHeight ? ["height"] : []),
    ];
    if (missing.length) return `Required: ${missing.join(", ")}`;
    if (invalidHeight) return "Height (U) must be a positive integer.";
    if (codeFormatErr) return codeFormatErr;
    return null;
  })();

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      const heightU = parsePositiveInt(form.heightU)!;
      if (isEdit) {
        await updateRack({
          id: editing.id,
          location_id: locationId,
          code: editing.code,
          name: form.name.trim(),
          height_u: heightU,
          row: form.row.trim() || undefined,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
      } else {
        await addRack({
          location_id: locationId,
          code: codeVal,
          name: form.name.trim(),
          height_u: heightU,
          row: form.row.trim() || undefined,
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
      title={isEdit ? "Edit rack" : "Add rack"}
      subtitle="A physical rack cabinet belonging to a location, with a fixed height in rack units."
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
              ? isEdit
                ? "Saving…"
                : "Adding…"
              : isEdit
                ? "Save changes"
                : "Create rack"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="Location"
          help={isEdit ? "Location is fixed and cannot be changed." : undefined}
        >
          <input
            className="input"
            value={locationLabel}
            readOnly
            disabled
            data-testid="field-location"
          />
        </Field>
        <Field
          className="col-6"
          label="Code"
          required={!isEdit}
          help={
            !isEdit
              ? "Lowercase letters, digits, hyphens, underscores, dots. Immutable after creation."
              : undefined
          }
          error={codeFormatErr}
        >
          <input
            className="input mono"
            value={form.code}
            onChange={set("code")}
            placeholder="e.g. rack-a01"
            disabled={isEdit || submitting}
            autoFocus={!isEdit}
            data-testid="field-code"
          />
        </Field>
        <Field className="col-6" label="Name" required>
          <input
            className="input"
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. Rack A01"
            disabled={submitting}
            autoFocus={isEdit}
            data-testid="field-name"
          />
        </Field>
        <Field
          className="col-4"
          label="Height (U)"
          required
          help="Standard full-height racks are often 42U. Use the actual usable rack height."
        >
          <input
            className="input mono"
            value={form.heightU}
            onChange={set("heightU")}
            disabled={submitting}
            data-testid="field-height-u"
          />
        </Field>
        <Field
          className="col-8"
          label="Row / aisle"
          help="Optional physical row, aisle or zone label within the location."
        >
          <input
            className="input"
            value={form.row}
            onChange={set("row")}
            placeholder="optional"
            disabled={submitting}
            data-testid="field-row"
          />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            rows={2}
            value={form.description}
            onChange={set("description")}
            placeholder="optional"
            disabled={submitting}
          />
        </Field>
        <Field label="Tags" help="Comma-separated. e.g. production, critical">
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
