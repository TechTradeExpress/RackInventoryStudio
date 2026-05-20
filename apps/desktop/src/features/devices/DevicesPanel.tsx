import { FormEvent, useEffect, useRef, useState } from "react";
import { parseTags, joinTags } from "../../lib/tags";
import {
  listDevices,
  listDeviceModels,
  addDevice,
  updateDevice,
  deleteDevice,
  type DeviceDto,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  IcPlus, IcEdit, IcTrash, IcBox,
  IcServer, IcNetwork, IcStorage, IcUps,
} from "../../components/ui/Icon";
import type { ReactNode } from "react";

const DEVICE_TYPES = ["server", "network", "storage", "ups", "appliance", "other"] as const;
const DEVICE_STATUSES = ["planned", "in_stock", "installed", "to_remove", "removed", "disposed", "unknown"] as const;

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

type DeviceFilter = "all" | "placed" | "unplaced" | "installed" | "unknown";

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

function typeIcon(type: string): ReactNode {
  const s = 13;
  switch (type) {
    case "server":  return <IcServer size={s} />;
    case "network": return <IcNetwork size={s} />;
    case "storage": return <IcStorage size={s} />;
    case "ups":     return <IcUps size={s} />;
    default:        return <IcBox size={s} />;
  }
}

function deviceStatusBadge(status: string) {
  switch (status) {
    case "installed": return <Badge tone="ok"   dot>installed</Badge>;
    case "in_stock":  return <Badge tone="info" dot>in stock</Badge>;
    case "planned":   return <Badge tone="muted" dot>planned</Badge>;
    case "unknown":   return <Badge tone="warn" dot>unknown</Badge>;
    default:          return <Badge tone="err"  dot>{status}</Badge>;
  }
}

export function DevicesPanel({
  repoPath,
  mutationToken,
  highlightedDeviceId,
  onRepositoryMutated,
}: Props) {
  const [devices, setDevices]     = useState<DeviceDto[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [models, setModels]       = useState<DeviceModelDto[]>([]);
  const [filter, setFilter]       = useState<DeviceFilter>("all");
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
      setDevices([]); setModels([]); setError(null);
      setForm(EMPTY_FORM); setFormError(null); setFormSuccess(null);
      setEditingId(null); setShowForm(false);
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
        if (selected && selected.device_type !== value) next.deviceModelId = "";
      }
      return next;
    });
  }

  const filteredModels = form.deviceType
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
    const [devs, mods] = await Promise.all([listDevices(), listDeviceModels()]);
    setDevices(devs);
    setModels(mods.filter((m) => m.device_type !== "rack_object"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null); setFormSuccess(null);
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
        setEditingId(null); setForm(EMPTY_FORM); setShowForm(false);
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
        setForm((f) => ({ ...EMPTY_FORM, deviceType: f.deviceType, status: f.status }));
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
    setEditingId(dev.id); setForm(deviceToForm(dev));
    setFormError(null); setFormSuccess(null); setShowForm(true);
  }

  function handleCancelEdit() {
    setEditingId(null); setForm(EMPTY_FORM);
    setFormError(null); setFormSuccess(null); setShowForm(false);
  }

  async function handleDelete(dev: DeviceDto) {
    if (!confirm(`Delete device "${dev.code}"? This cannot be undone.`)) return;
    setFormError(null); setFormSuccess(null);
    try {
      await deleteDevice(dev.id);
      if (editingId === dev.id) { setEditingId(null); setForm(EMPTY_FORM); setShowForm(false); }
      await reloadData();
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  useEffect(() => {
    if (!highlightedDeviceId || devices.length === 0) return;
    const el = document.querySelector(`[data-dev-id="${CSS.escape(highlightedDeviceId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedDeviceId, devices]);

  const filterPills: { k: DeviceFilter; label: string; count: number }[] = [
    { k: "all",       label: "All",       count: devices.length },
    { k: "placed",    label: "Placed",    count: devices.filter((d) => d.is_placed).length },
    { k: "unplaced",  label: "Unplaced",  count: devices.filter((d) => !d.is_placed).length },
    { k: "installed", label: "Installed", count: devices.filter((d) => d.status === "installed").length },
    { k: "unknown",   label: "Unknown",   count: devices.filter((d) => d.status === "unknown").length },
  ];

  const filtered =
    filter === "all"       ? devices :
    filter === "placed"    ? devices.filter((d) => d.is_placed) :
    filter === "unplaced"  ? devices.filter((d) => !d.is_placed) :
    filter === "installed" ? devices.filter((d) => d.status === "installed") :
                             devices.filter((d) => d.status === "unknown");

  const isEditing = editingId !== null;

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Concrete device records — placed and unplaced."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingId(null); setForm(EMPTY_FORM);
              setFormError(null); setFormSuccess(null); setShowForm(true);
            }}
          >
            <IcPlus size={12} /> Add device
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>}
        {error && <Banner tone="err">{error}</Banner>}

        <Panel
          flush
          title="All devices"
          desc={`${filtered.length} of ${devices.length}`}
          actions={
            <div className="row" style={{ gap: 2 }}>
              {filterPills.map((f) => (
                <button
                  key={f.k}
                  className={`btn btn-sm${filter === f.k ? " btn-primary" : ""}`}
                  onClick={() => setFilter(f.k)}
                >
                  {f.label} <span style={{ opacity: 0.7, marginLeft: 3 }}>{f.count}</span>
                </button>
              ))}
            </div>
          }
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={<IcBox size={28} />}
              title="No devices match this filter"
              body="Try another tab or add a device."
            />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 20 }} />
                  <th className="tbl-mono">Code</th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Placed</th>
                  <th>Model</th>
                  <th className="tbl-mono">Serial</th>
                  <th className="tbl-mono">Asset</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((dev) => (
                  <tr
                    key={dev.id}
                    data-dev-id={dev.id}
                    className={dev.id === highlightedDeviceId ? "tbl-selected" : undefined}
                  >
                    <td style={{ color: "var(--tx-3)" }}>{typeIcon(dev.device_type)}</td>
                    <td className="tbl-mono"><strong>{dev.code}</strong></td>
                    <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>{dev.device_type}</td>
                    <td>{dev.name ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                    <td>{deviceStatusBadge(dev.status)}</td>
                    <td>
                      {dev.is_placed
                        ? <Badge tone="ok" dot>placed</Badge>
                        : <Badge tone="warn" dot>unplaced</Badge>}
                    </td>
                    <td className="tbl-mono" style={{ color: dev.device_model_code ? undefined : "var(--st-warn-tx)" }}>
                      {dev.device_model_code ?? "no model"}
                    </td>
                    <td className="tbl-mono">{dev.serial_number ?? "—"}</td>
                    <td className="tbl-mono">{dev.asset_tag ?? "—"}</td>
                    <td className="tbl-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => handleEdit(dev)}>
                        <IcEdit size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        onClick={() => handleDelete(dev)}
                        style={{ color: "var(--st-err-tx)" }}
                      >
                        <IcTrash size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {showForm && (
          <Panel title={isEditing ? "Edit Device" : "Add Device"}>
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

              {([
                ["Code", "code", true],
                ["Name", "name", false],
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
                <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>Device Model</label>
                <select
                  className="ri-input"
                  style={{ width: "100%", background: "var(--bg-surface)" }}
                  value={form.deviceModelId}
                  onChange={(e) => set("deviceModelId", e.target.value)}
                  disabled={submitting}
                >
                  <option value="">— none —</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} — {m.name}</option>
                  ))}
                </select>
              </div>

              {([
                ["Serial Number", "serialNumber"],
                ["Asset Tag", "assetTag"],
                ["External Ref", "externalRef"],
                ["Description", "description"],
                ["Tags (comma-separated)", "tags"],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>{label}</label>
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
                  Status <span style={{ color: "var(--st-err-tx)" }}>*</span>
                </label>
                <select
                  className="ri-input"
                  style={{ width: "100%", background: "var(--bg-surface)" }}
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  disabled={submitting}
                >
                  {DEVICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <p style={{ margin: 0, fontSize: 11, color: "var(--tx-3)" }}>
                * At least one of Name, Serial Number, or Asset Tag is required.
              </p>

              {formError && <Banner tone="err">{formError}</Banner>}
              {formSuccess && <Banner tone="ok">{formSuccess}</Banner>}

              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? isEditing ? "Saving…" : "Adding…"
                    : isEditing ? "Save changes" : "Add device"}
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
