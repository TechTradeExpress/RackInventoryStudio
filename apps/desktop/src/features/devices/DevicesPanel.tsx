import { useEffect, useRef, useState } from "react";
import {
  listDevices,
  listDeviceModels,
  deleteDevice,
  type DeviceDto,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { DeviceFormModal } from "./DeviceFormModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  IcPlus,
  IcEdit,
  IcTrash,
  IcBox,
  IcServer,
  IcNetwork,
  IcStorage,
  IcUps,
} from "../../components/ui/Icon";
import type { ReactNode } from "react";

type DeviceFilter = "all" | "placed" | "unplaced" | "installed" | "unknown";

interface Props {
  repoPath: string;
  mutationToken: number;
  highlightedDeviceId?: string | null;
  onRepositoryMutated: () => void;
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
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [models, setModels]   = useState<DeviceModelDto[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<DeviceFilter>("all");
  const [reloadToken, setReloadToken] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceDto | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<DeviceDto | null>(null);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  // Success banner
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setDevices([]);
      setModels([]);
      setError(null);
      setSuccessMsg(null);
      setModalOpen(false);
      setEditingDevice(null);
      setPendingDelete(null);
    }
    setLoading(true);
    Promise.all([listDevices(), listDeviceModels()])
      .then(([devs, mods]) => {
        setDevices(devs);
        setModels(mods.filter((m) => m.device_type !== "rack_object"));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, mutationToken, reloadToken]);

  function openAdd() {
    setEditingDevice(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(dev: DeviceDto) {
    setEditingDevice(dev);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function handleSaved() {
    setReloadToken((t) => t + 1);
    onRepositoryMutated();
    const label = editingDevice ? editingDevice.code : "Device";
    setSuccessMsg(editingDevice ? `"${label}" updated.` : "Device added.");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteDevice(pendingDelete.id);
      setPendingDelete(null);
      setReloadToken((t) => t + 1);
      onRepositoryMutated();
    } catch (e) {
      setDeleteError(String(e));
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (!highlightedDeviceId || devices.length === 0) return;
    const el = document.querySelector(
      `[data-dev-id="${CSS.escape(highlightedDeviceId)}"]`,
    );
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

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Concrete device records — placed and unplaced."
        actions={
          <button className="btn btn-primary" onClick={openAdd}>
            <IcPlus size={12} /> Add device
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>
            Loading…
          </p>
        )}
        {error && <Banner tone="err">{error}</Banner>}
        {deleteError && <Banner tone="err">{deleteError}</Banner>}
        {successMsg && (
          <Banner tone="ok" onDismiss={() => setSuccessMsg(null)}>
            {successMsg}
          </Banner>
        )}

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
                  {f.label}{" "}
                  <span style={{ opacity: 0.7, marginLeft: 3 }}>{f.count}</span>
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
                    className={
                      dev.id === highlightedDeviceId ? "tbl-selected" : undefined
                    }
                  >
                    <td style={{ color: "var(--tx-3)" }}>
                      {typeIcon(dev.device_type)}
                    </td>
                    <td className="tbl-mono">
                      <strong>{dev.code}</strong>
                    </td>
                    <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>
                      {dev.device_type}
                    </td>
                    <td>
                      {dev.name ?? (
                        <span style={{ color: "var(--tx-4)" }}>—</span>
                      )}
                    </td>
                    <td>{deviceStatusBadge(dev.status)}</td>
                    <td>
                      {dev.is_placed ? (
                        <Badge tone="ok" dot>placed</Badge>
                      ) : (
                        <Badge tone="warn" dot>unplaced</Badge>
                      )}
                    </td>
                    <td
                      className="tbl-mono"
                      style={{
                        color: dev.device_model_code
                          ? undefined
                          : "var(--st-warn-tx)",
                      }}
                    >
                      {dev.device_model_code ?? "no model"}
                    </td>
                    <td className="tbl-mono">{dev.serial_number ?? "—"}</td>
                    <td className="tbl-mono">{dev.asset_tag ?? "—"}</td>
                    <td className="tbl-actions">
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Edit"
                        aria-label={`Edit ${dev.code}`}
                        onClick={() => openEdit(dev)}
                      >
                        <IcEdit size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        aria-label={`Delete ${dev.code}`}
                        onClick={() => setPendingDelete(dev)}
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
      </div>

      <DeviceFormModal
        open={modalOpen}
        editing={editingDevice}
        models={models}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.code}"?`}
        body="This will remove the device from the repository on the next save. Placed devices must be unplaced before they can be deleted."
        confirmLabel="Delete device"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
