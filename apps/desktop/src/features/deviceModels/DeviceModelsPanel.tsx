import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import {
  listDeviceModels,
  addDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { parseTags } from "../../lib/tags";
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
  onRepositoryMutated: () => void;
}

export function DeviceModelsPanel({ repoPath, onRepositoryMutated }: Props) {
  const [models, setModels] = useState<DeviceModelDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    }
    setLoading(true);
    listDeviceModels()
      .then(setModels)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!form.deviceType) {
      setFormError("Device type is required.");
      return;
    }
    if (!form.code.trim()) {
      setFormError("Code is required.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    const heightU = parsePositiveInt(form.heightU);
    if (heightU === null) {
      setFormError("Height (U) must be a positive integer.");
      return;
    }

    setSubmitting(true);
    try {
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
      const updated = await listDeviceModels();
      setModels(updated);
      onRepositoryMutated();
      setFormSuccess(`Device model "${form.code.trim()}" added.`);
      setForm({ ...EMPTY_FORM, deviceType: form.deviceType });
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

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
              {["Code", "Type", "Name", "Vendor", "Model Number", "Height (U)"].map(
                (h) => (
                  <th key={h} style={common.th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {m.code}
                </td>
                <td style={common.td}>{m.device_type}</td>
                <td style={common.td}>{m.name}</td>
                <td style={common.td}>{m.vendor ?? ""}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {m.model_number ?? ""}
                </td>
                <td style={common.td}>{m.default_height_u}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={styles.formSection}>
        <h3 style={common.h3}>Add Device Model</h3>

        <form onSubmit={handleAdd} style={styles.form}>
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
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {form.deviceType === "rack_object" && (
            <p style={styles.rackObjectHint}>
              Rack objects can be placed directly in racks without creating a Device.
            </p>
          )}

          <div style={styles.fieldRow}>
            <label style={styles.label}>
              Code<span style={styles.required}> *</span>
            </label>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>
              Name<span style={styles.required}> *</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Vendor</label>
            <input
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Model Number</label>
            <input
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>
              Height (U)<span style={styles.required}> *</span>
            </label>
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
            <input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              style={common.input}
              disabled={submitting}
            />
          </div>

          {formError && <div style={common.errorBox}>{formError}</div>}
          {formSuccess && <div style={styles.successBox}>{formSuccess}</div>}

          <div>
            <button type="submit" disabled={submitting} style={common.btn}>
              {submitting ? "Adding…" : "Add device model"}
            </button>
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
};
