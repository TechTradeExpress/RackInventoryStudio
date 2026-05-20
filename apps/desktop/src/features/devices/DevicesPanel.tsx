import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import {
  listDevices,
  listDeviceModels,
  addDevice,
  updateDevice,
  deleteDevice,
  type DeviceDto,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { parseTags, joinTags } from "../../lib/tags";

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

const EMPTY_FORM = {
  deviceType: "",
  code: "",
  name: "",
  deviceModelId: "",
  serialNumber: "",
  assetTag: "",
  externalRef: "",
  status: "planned",
  description: "",
  tags: "",
};

interface Props {
  repoPath: string;
  mutationToken: number;
  highlightedDeviceId?: string | null;
  onRepositoryMutated: () => void;
}

function deviceToForm(dev: DeviceDto) {
  return {
    deviceType: dev.device_type,
    code: dev.code,
    name: dev.name ?? "",
    deviceModelId: dev.device_model_id ?? "",
    serialNumber: dev.serial_number ?? "",
    assetTag: dev.asset_tag ?? "",
    externalRef: dev.external_ref ?? "",
    status: dev.status,
    description: dev.description ?? "",
    tags: joinTags(dev.tags),
  };
}

export function DevicesPanel({
  repoPath,
  mutationToken,
  highlightedDeviceId,
  onRepositoryMutated,
}: Props) {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [models, setModels] = useState<DeviceModelDto[]>([]);

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
      setDevices([]);
      setModels([]);
      setError(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      setFormSuccess(null);
      setEditingId(null);
    }
    setLoading(true);
    Promise.all([listDevices(), listDeviceModels()])
      .then(([devs, mods]) => {
        setDevices(devs);
        setModels(mods.filter((m) => m.device_type !== "rack_object"));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, mutationToken]);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "deviceType" && next.deviceModelId) {
        const selected = models.find((m) => m.id === next.deviceModelId);
        if (selected && selected.device_type !== value) {
          next.deviceModelId = "";
        }
      }
      return next;
    });
  }

  const filteredModels =
    form.deviceType
      ? models.filter((m) => m.device_type === form.deviceType)
      : models;

  function validate() {
    if (!form.deviceType) return "Device type is required.";
    if (!form.code.trim()) return "Code is required.";
    if (!form.status) return "Status is required.";
    if (!form.name.trim() && !form.serialNumber.trim() && !form.assetTag.trim())
      return "At least one of Name, Serial Number, or Asset Tag is required.";
    return null;
  }

  async function reloadData() {
    const [updatedDevices, updatedModels] = await Promise.all([
      listDevices(),
      listDeviceModels(),
    ]);
    setDevices(updatedDevices);
    setModels(updatedModels.filter((m) => m.device_type !== "rack_object"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    const err = validate();
    if (err) { setFormError(err); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateDevice({
          id: editingId,
          device_type: form.deviceType,
          code: form.code.trim(),
          name: form.name.trim() || undefined,
          device_model_id: form.deviceModelId || undefined,
          serial_number: form.serialNumber.trim() || undefined,
          asset_tag: form.assetTag.trim() || undefined,
          external_ref: form.externalRef.trim() || undefined,
          status: form.status,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Device "${form.code.trim()}" updated.`);
        setEditingId(null);
        setForm(EMPTY_FORM);
      } else {
        await addDevice({
          device_type: form.deviceType,
          code: form.code.trim(),
          name: form.name.trim() || undefined,
          device_model_id: form.deviceModelId || undefined,
          serial_number: form.serialNumber.trim() || undefined,
          asset_tag: form.assetTag.trim() || undefined,
          external_ref: form.externalRef.trim() || undefined,
          status: form.status,
          description: form.description.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Device "${form.code.trim()}" added.`);
        setForm({
          ...EMPTY_FORM,
          deviceType: form.deviceType,
          status: form.status,
        });
      }
      await reloadData();
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(dev: DeviceDto) {
    setEditingId(dev.id);
    setForm(deviceToForm(dev));
    setFormError(null);
    setFormSuccess(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleDelete(dev: DeviceDto) {
    if (!confirm(`Delete device "${dev.code}"? This cannot be undone.`)) return;
    setFormError(null);
    setFormSuccess(null);
    try {
      await deleteDevice(dev.id);
      if (editingId === dev.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      await reloadData();
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  useEffect(() => {
    if (!highlightedDeviceId || devices.length === 0) return;
    const el = document.querySelector(`[data-dev-id="${highlightedDeviceId}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedDeviceId, devices]);

  const isEditing = editingId !== null;

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Devices</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && devices.length === 0 && (
        <p style={common.hint}>No devices found.</p>
      )}

      {devices.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {[
                "Code", "Type", "Name", "Status",
                "Serial", "Asset Tag", "Model", "Placed", "Actions",
              ].map((h) => (
                <th key={h} style={common.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((dev) => (
              <tr
                key={dev.id}
                data-dev-id={dev.id}
                style={
                  dev.id === highlightedDeviceId
                    ? { background: "#fff8c5" }
                    : undefined
                }
              >
                <td style={{ ...common.td, fontFamily: "monospace" }}>{dev.code}</td>
                <td style={common.td}>{dev.device_type}</td>
                <td style={common.td}>{dev.name ?? ""}</td>
                <td style={common.td}>{dev.status}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>{dev.serial_number ?? ""}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>{dev.asset_tag ?? ""}</td>
                <td style={{ ...common.td, fontFamily: "monospace" }}>{dev.device_model_code ?? ""}</td>
                <td style={common.td}>{dev.is_placed ? "yes" : "no"}</td>
                <td style={{ ...common.td, whiteSpace: "nowrap" }}>
                  <button style={styles.actionBtn} onClick={() => handleEdit(dev)}>Edit</button>
                  <button
                    style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    onClick={() => handleDelete(dev)}
                  >Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={styles.formSection}>
        <h3 style={common.h3}>{isEditing ? "Edit Device" : "Add Device"}</h3>

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

          <div style={styles.fieldRow}>
            <label style={styles.label}>Code<span style={styles.required}> *</span></label>
            <input value={form.code} onChange={(e) => set("code", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Device Model</label>
            <select
              value={form.deviceModelId}
              onChange={(e) => set("deviceModelId", e.target.value)}
              style={common.input}
              disabled={submitting}
            >
              <option value="">— none —</option>
              {filteredModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Serial Number</label>
            <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Asset Tag</label>
            <input value={form.assetTag} onChange={(e) => set("assetTag", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>External Ref</label>
            <input value={form.externalRef} onChange={(e) => set("externalRef", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Status<span style={styles.required}> *</span></label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              style={common.input}
              disabled={submitting}
            >
              {DEVICE_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Description</label>
            <input value={form.description} onChange={(e) => set("description", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={(e) => set("tags", e.target.value)} style={common.input} disabled={submitting} />
          </div>

          <p style={styles.requiredNote}>
            * At least one of Name, Serial Number, or Asset Tag is required.
          </p>

          {formError && <div style={common.errorBox}>{formError}</div>}
          {formSuccess && <div style={styles.successBox}>{formSuccess}</div>}

          <div style={styles.btnRow}>
            <button type="submit" disabled={submitting} style={common.btn}>
              {submitting
                ? isEditing ? "Saving…" : "Adding…"
                : isEditing ? "Save changes" : "Add device"}
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
  requiredNote: {
    margin: "0",
    fontSize: "0.78rem",
    color: "#666",
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
