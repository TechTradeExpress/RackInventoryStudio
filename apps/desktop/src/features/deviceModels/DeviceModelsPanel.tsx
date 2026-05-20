import { FormEvent, useEffect, useRef, useState } from "react";
import { parseTags, joinTags } from "../../lib/tags";
import {
  listDeviceModels,
  addDeviceModel,
  updateDeviceModel,
  deleteDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { parsePositiveInt } from "../racks/positiveInt";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { IcPlus, IcEdit, IcTrash, IcLayers } from "../../components/ui/Icon";

const DEVICE_TYPES = [
  "server", "network", "storage", "ups", "appliance", "rack_object", "other",
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
    description: m.description ?? "",
    tags: joinTags(m.tags),
  };
}

export function DeviceModelsPanel({
  repoPath,
  mutationToken,
  highlightedDeviceModelId,
  onRepositoryMutated,
}: Props) {
  const [models, setModels]       = useState<DeviceModelDto[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setModels([]); setError(null); setForm(EMPTY_FORM);
      setFormError(null); setFormSuccess(null); setEditingId(null); setShowForm(false);
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
    if (parsePositiveInt(form.heightU) === null) return "Height (U) must be a positive integer.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null); setFormSuccess(null);
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
        setEditingId(null); setForm(EMPTY_FORM); setShowForm(false);
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
        setForm((f) => ({ ...EMPTY_FORM, deviceType: f.deviceType }));
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
    setEditingId(m.id); setForm(modelToForm(m));
    setFormError(null); setFormSuccess(null); setShowForm(true);
  }

  function handleCancelEdit() {
    setEditingId(null); setForm(EMPTY_FORM);
    setFormError(null); setFormSuccess(null); setShowForm(false);
  }

  async function handleDelete(m: DeviceModelDto) {
    if (!confirm(`Delete device model "${m.name}"? This cannot be undone.`)) return;
    setFormError(null); setFormSuccess(null);
    try {
      await deleteDeviceModel(m.id);
      if (editingId === m.id) { setEditingId(null); setForm(EMPTY_FORM); setShowForm(false); }
      const updated = await listDeviceModels();
      setModels(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  useEffect(() => {
    if (!highlightedDeviceModelId || models.length === 0) return;
    const el = document.querySelector(`[data-model-id="${CSS.escape(highlightedDeviceModelId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedDeviceModelId, models]);

  const isEditing = editingId !== null;

  return (
    <>
      <PageHeader
        title="Device Models"
        subtitle="Hardware templates referenced by devices and placements."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingId(null); setForm(EMPTY_FORM);
              setFormError(null); setFormSuccess(null); setShowForm(true);
            }}
          >
            <IcPlus size={12} /> Add model
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>}
        {error && <Banner tone="err">{error}</Banner>}

        {!loading && !error && models.length === 0 && (
          <EmptyState
            icon={<IcLayers size={32} />}
            title="No device models yet"
            body="Add a model to define hardware templates for devices."
          />
        )}

        {models.length > 0 && (
          <Panel flush title={`${models.length} model${models.length !== 1 ? "s" : ""}`}>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl-mono">Code</th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Vendor</th>
                  <th className="tbl-mono">Model number</th>
                  <th className="tbl-num">Height</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr
                    key={m.id}
                    data-model-id={m.id}
                    className={m.id === highlightedDeviceModelId ? "tbl-selected" : undefined}
                  >
                    <td className="tbl-mono"><strong>{m.code}</strong></td>
                    <td>
                      <Badge tone={m.device_type === "rack_object" ? "muted" : "info"}>
                        {m.device_type}
                      </Badge>
                    </td>
                    <td>{m.name}</td>
                    <td>{m.vendor ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                    <td className="tbl-mono">{m.model_number ?? "—"}</td>
                    <td className="tbl-num tbl-mono">{m.default_height_u}U</td>
                    <td className="tbl-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => handleEdit(m)}>
                        <IcEdit size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        onClick={() => handleDelete(m)}
                        style={{ color: "var(--st-err-tx)" }}
                      >
                        <IcTrash size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {showForm && (
          <Panel title={isEditing ? "Edit Device Model" : "Add Device Model"}>
            <form onSubmit={handleSubmit} className="stack-3" style={{ maxWidth: 480 }}>
              <div>
                <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                  Device Type <span style={{ color: "var(--st-err-tx)" }}>*</span>
                </label>
                <select
                  className="ri-input"
                  style={{ width: "100%", background: "var(--bg-surface)" }}
                  value={form.deviceType}
                  onChange={(e) => set("deviceType", e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— select —</option>
                  {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {form.deviceType === "rack_object" && (
                <Banner tone="info">
                  Rack objects can be placed directly in racks without creating a Device.
                </Banner>
              )}

              {([
                ["Code", "code", true],
                ["Name", "name", true],
                ["Vendor", "vendor", false],
                ["Model Number", "model", false],
                ["Description", "description", false],
                ["Tags (comma-separated)", "tags", false],
              ] as [string, string, boolean][]).map(([label, key, req]) => (
                <div key={key}>
                  <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                    {label}{req && <span style={{ color: "var(--st-err-tx)" }}> *</span>}
                  </label>
                  <input
                    className="ri-input"
                    style={{ width: "100%" }}
                    value={form[key as keyof typeof EMPTY_FORM]}
                    onChange={(e) => set(key as keyof typeof EMPTY_FORM, e.target.value)}
                    disabled={submitting}
                  />
                </div>
              ))}

              <div>
                <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                  Height (U) <span style={{ color: "var(--st-err-tx)" }}>*</span>
                </label>
                <input
                  className="ri-input"
                  type="number" min={1}
                  style={{ width: 90 }}
                  value={form.heightU}
                  onChange={(e) => set("heightU", e.target.value)}
                  disabled={submitting}
                />
              </div>

              {formError && <Banner tone="err">{formError}</Banner>}
              {formSuccess && <Banner tone="ok">{formSuccess}</Banner>}

              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? isEditing ? "Saving…" : "Adding…"
                    : isEditing ? "Save changes" : "Add device model"}
                </button>
                <button type="button" className="btn" onClick={handleCancelEdit}>Cancel</button>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
