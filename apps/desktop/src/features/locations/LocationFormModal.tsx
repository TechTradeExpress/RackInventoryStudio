import { useState, useEffect, type ChangeEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { parseTags, joinTags } from "../../lib/tags";
import {
  addLocation,
  updateLocation,
  type LocationDto,
} from "../../api/tauriClient";

interface FormState {
  code: string;
  name: string;
  description: string;
  address: string;
  tags: string;
}

const EMPTY: FormState = { code: "", name: "", description: "", address: "", tags: "" };

function locationToForm(loc: LocationDto): FormState {
  return {
    code: loc.code,
    name: loc.name,
    description: loc.description ?? "",
    address: loc.address ?? "",
    tags: joinTags(loc.tags),
  };
}

function isDirtyForm(form: FormState, editing: LocationDto | null): boolean {
  if (!editing) {
    return form.code !== "" || form.name !== "" || form.description !== "" ||
      form.address !== "" || form.tags !== "";
  }
  return (
    form.name !== editing.name ||
    form.description !== (editing.description ?? "") ||
    form.address !== (editing.address ?? "") ||
    form.tags !== joinTags(editing.tags)
  );
}

export interface LocationFormModalProps {
  open: boolean;
  /** null → add mode, LocationDto → edit mode */
  editing: LocationDto | null;
  onClose: () => void;
  onSaved: () => void;
}

export function LocationFormModal({ open, editing, onClose, onSaved }: LocationFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      setForm(editing ? locationToForm(editing) : EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open, editing]);

  const set = (k: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const codeVal = form.code.trim();
  const codeFormatErr =
    !isEdit && codeVal !== "" && !/^[a-z0-9._-]+$/.test(codeVal)
      ? "Use lowercase letters, digits, hyphens, underscores or dots."
      : null;
  const missingCode = !codeVal;
  const missingName = !form.name.trim();
  const canSave = !missingCode && !missingName && !codeFormatErr && !submitting;

  const footerMsg: string | null = (() => {
    if (error) return error;
    const missing = [
      ...(missingCode ? ["code"] : []),
      ...(missingName ? ["name"] : []),
    ];
    return missing.length ? `Required: ${missing.join(", ")}` : null;
  })();

  async function handleSave() {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await updateLocation({
          id: editing.id,
          code: editing.code,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
          tags: parseTags(form.tags),
        });
      } else {
        await addLocation({
          code: codeVal,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
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

  const dirty = isDirtyForm(form, editing);

  return (
    <Modal
      open={open}
      title={isEdit ? "Edit location" : "Add location"}
      subtitle="A physical site that contains racks and organises your inventory."
      onClose={onClose}
      width={520}
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
              ? isEdit ? "Saving…" : "Adding…"
              : isEdit ? "Save changes" : "Create location"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          className="col-6"
          label="Code"
          required={!isEdit}
          help={!isEdit ? "Lowercase letters, digits, hyphens, underscores, dots." : undefined}
          error={codeFormatErr}
        >
          <input
            className="input mono"
            value={form.code}
            onChange={set("code")}
            placeholder="e.g. warsaw-serverroom-a"
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
            placeholder="e.g. Warsaw — Server Room A"
            disabled={submitting}
            autoFocus={isEdit}
            data-testid="field-name"
          />
        </Field>
        <Field label="Address">
          <input
            className="input"
            value={form.address}
            onChange={set("address")}
            placeholder="optional"
            disabled={submitting}
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
        <Field label="Tags" help="Comma-separated. e.g. production, warsaw">
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
