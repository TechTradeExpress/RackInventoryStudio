import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import {
  listDeviceModels,
  addDeviceModel,
  updateDeviceModel,
  deleteDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { parseTags, joinTags } from "../../lib/tags";
import { parsePositiveInt } from "../racks/positiveInt";

const DEVICE_TYPES = [
  "server",
  "network",
  "storage",
  "ups",
  "appliance",
  "rack_object",
  "other",
] as const;

const EMPTY_FORM = {
  deviceType: "",
  code: "",
  name: "",
  vendor: "",
  model: "",
  heightU: "",
  description: "",
  tags: "",
};

interface Props {
  repoPath: string;
  mutationToken: number;
  highlightedDeviceModelId?: string | null;
  onRepositoryMutated: () => void;
}

function modelToForm(m: DeviceModelDto) {
  return {
    deviceType: m.device_type,
    code: m.code,
    name: m.name,
    vendor: m.vendor ?? "",
    model: m.model_number ?? "",
    heightU: String(m.default_height_u),
    description: "",
    tags: joinTags(m.tags),
  };
}

export function DeviceModelsPanel({
  repoPath,
  mutationToken,
  highlightedDeviceModelId,
  onRepositoryMutated,
}: Props) {
  const [models, setModels] = useState<DeviceModelDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // null = add mode; string = edit mode (id being edited)
  const [editingId, setEditingId] = useState<string | null>(null);

  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setModels([]);
      setError(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      setFormSuccess(null);
      setEditingId(null);
    }
    setLoading(true);
    listDeviceModels()
      .then(setModels)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, mutationToken]);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    if (!form.deviceType) return "Device type is required.";
    if (!form.code.trim()) return "Code is required.";
    if (!form.name.trim()) return "Name is required.";
    const heightU = parsePositiveInt(form.heightU);
    if (heightU === null) return "Height (U) must be a positive integer.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const err = validate();
    if (err) { setFormError(err); return; }

    const heightU = parsePositiveInt(form.heightU)!;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateDeviceModel({
          id: editingId,
          device_type: form.deviceType,
          code: form.code.trim(),
          name: form.name.trim(),
          vendor: form.vendor.trim() || undefined,
          model: form.model.trim() || undefined,
          default_height_u: heightU,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Device model "${form.code.trim()}" updated.`);
        setEditingId(null);
        setForm(EMPTY_FORM);
      } else {
        await addDeviceModel({
          device_type: form.deviceType,
          code: form.code.trim(),
          name: form.name.trim(),
          vendor: form.vendor.trim() || undefined,
          model: form.model.trim() || undefined,
          default_height_u: heightU,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Device model "${form.code.trim()}" added.`);
        setForm({ ...EMPTY_FORM, deviceType: form.deviceType });
      }
      const updated = await listDeviceModels();
      setModels(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(m: DeviceModelDto) {
    setEditingId(m.id);
    setForm(modelToForm(m));
    setFormError(null);
    setFormSuccess(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleDelete(m: DeviceModelDto) {
    if (!confirm(`Delete device model "${m.name}"? This cannot be undone.`)) return;
    setFormError(null);
    setFormSuccess(null);
    try {
      await deleteDeviceModel(m.id);
      if (editingId === m.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      const updated = await listDeviceModels();
      setModels(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  const isEditing = editingId !== null;

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Device Models</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && models.length === 0 && (
        <p style={common.hint}>No device models found.</p>
      )}

      {models.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {["Code", "Type", "Name", "Vendor", "Model Number", "Height (U)", "Actions"].map(
                (h) => <th key={h} style={common.th}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr
                key={m.id}
                style={
                  m.id === highlightedDeviceModelId
                    ? { background: "#fff8c5" }
                    : undefined
                }
              >
                <td style={{ ...common.td, fontFamily: "monospace" }}>{m.code}</td>
                <td style={common.td}>{m.device_type}</td>
                <td style={common.td}>{m.name}</td>
                <td style={common.td}>{m.vendor ?? ""}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>{m.model_number ?? ""}</td>
                <td style={common.td}>{m.default_height_u}</td>
                <td style={{ ...common.td, whiteSpace: "nowrap" }}>
                  <button style={styles.actionBtn} onClick={() => handleEdit(m)}>Edit</button>
                  <button
                    style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    onClick={() => handleDelete(m)}
                  >Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={styles.formSection}>
        <h3 style={common.h3}>{isEditing ? "Edit Device Model" : "Add Device Model"}</h3>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldRow}>
            <label style={styles.label}>
              Device Type<span style={styles.required}> *</span>
            </label>
            <select
              value={form.deviceType}
              onChange={(e) => set("deviceType", e.target.value)}
              style={common.input}
              disabled={submitting}
            >
              <option value="">— select —</option>
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {form.deviceType === "rack_object" && (
            <p style={styles.rackObjectHint}>
              Rack objects can be placed directly in racks without creating a Device.
            </p>
          )}

          <div style={styles.fieldRow}>
            <label style={styles.label}>Code<span style={styles.required}> *</span></label>
            <input value={form.code} onChange={(e) => set("code", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Name<span style={styles.required}> *</span></label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Vendor</label>
            <input value={form.vendor} onChange={(e) => set("vendor", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Model Number</label>
            <input value={form.model} onChange={(e) => set("model", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Height (U)<span style={styles.required}> *</span></label>
            <input
              type="number"
              min={1}
              value={form.heightU}
              onChange={(e) => set("heightU", e.target.value)}
              style={{ ...common.input, flex: "none", width: "6rem" }}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Description</label>
            <input value={form.description} onChange={(e) => set("description", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => set("tags", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          {formError && <div style={common.errorBox}>{formError}</div>}
          {formSuccess && <div style={styles.successBox}>{formSuccess}</div>}

          <div style={styles.btnRow}>
            <button type="submit" disabled={submitting} style={common.btn}>
              {submitting
                ? isEditing ? "Saving…" : "Adding…"
                : isEditing ? "Save changes" : "Add device model"}
            </button>
            {isEditing && (
              <button
                type="button"
                style={{ ...common.btn, ...styles.cancelBtn }}
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </section>
  );
}

const styles = {
  formSection: {
    marginTop: "1.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    maxWidth: "400px",
  },
  fieldRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
  },
  label: {
    fontSize: "0.82rem",
    color: "#555",
  },
  required: {
    color: "#b00",
  },
  rackObjectHint: {
    margin: "0",
    padding: "0.3rem 0.6rem",
    background: "#f0f4ff",
    border: "1px solid #c5d3f0",
    borderRadius: 3,
    fontSize: "0.8rem",
    color: "#3a4a7a",
  },
  successBox: {
    padding: "0.4rem 0.75rem",
    background: "#f0fff4",
    border: "1px solid #5cb85c",
    color: "#2d6a2d",
    borderRadius: "3px",
    fontSize: "0.85rem",
  },
  btnRow: {
    display: "flex",
    gap: "0.5rem",
  },
  actionBtn: {
    fontSize: "0.78rem",
    padding: "0.2rem 0.5rem",
    marginRight: "0.25rem",
    cursor: "pointer",
    border: "1px solid #bbb",
    borderRadius: "3px",
    background: "#f5f5f5",
  },
  deleteBtn: {
    borderColor: "#d9534f",
    color: "#b52b27",
    background: "#fff5f5",
  },
  cancelBtn: {
    background: "#f5f5f5",
    color: "#555",
    border: "1px solid #bbb",
  },
};
