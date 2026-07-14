import { useEffect, useRef, useState } from "react";
import {
  listDevices,
  listDeviceModels,
  deleteDevice,
  type DeviceDto,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { DeviceFormModal, type DevicePrefill } from "./DeviceFormModal";
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
  IcSearch,
  IcX,
  IcCopy,
} from "../../components/ui/Icon";
import { matchesSearch, cmpStr, toggleDir, type SortDir } from "../../lib/listHelpers";
import { joinTags } from "../../lib/tags";
import { useWorkMode, WORK_MODE_DEFAULT_STATUS } from "../../lib/workMode";
import type { ReactNode } from "react";

type DeviceFilter = "all" | "placed" | "unplaced" | "installed" | "unknown";
type DeviceSortCol = "name" | "type" | "status" | "placed";

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
  const { mode: workMode } = useWorkMode();
  const defaultDeviceStatus = WORK_MODE_DEFAULT_STATUS[workMode];

  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [models, setModels]   = useState<DeviceModelDto[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<DeviceFilter>("all");
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<DeviceSortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [reloadToken, setReloadToken] = useState(0);

  // Modal state
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceDto | null>(null);
  const [prefillDevice, setPrefillDevice] = useState<DevicePrefill | undefined>(undefined);

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
      setSearchQ("");
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
    setPrefillDevice(undefined);
    setEditingDevice(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(dev: DeviceDto) {
    setPrefillDevice(undefined);
    setEditingDevice(dev);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openSimilar(dev: DeviceDto) {
    setPrefillDevice({
      deviceType: dev.device_type,
      name: `Copy of ${dev.name || "unnamed device"}`,
      status: dev.status,
      deviceModelId: dev.device_model_id ?? "",
      description: dev.description ?? "",
      tags: joinTags(dev.tags),
    });
    setEditingDevice(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function handleSaved() {
    setReloadToken((t) => t + 1);
    onRepositoryMutated();
    const label = editingDevice ? (editingDevice.name ?? "Unnamed device") : "Device";
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

  function handleSortClick(col: DeviceSortCol) {
    if (sortCol === col) setSortDir((d) => toggleDir(d));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIc({ col }: { col: DeviceSortCol }) {
    if (sortCol !== col) return null;
    return <span className="sort-ic">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Filter pipeline ────────────────────────────────────────────────────────

  const filterPills: { k: DeviceFilter; label: string; count: number }[] = [
    { k: "all",       label: "All",       count: devices.length },
    { k: "placed",    label: "Placed",    count: devices.filter((d) => d.is_placed).length },
    { k: "unplaced",  label: "Unplaced",  count: devices.filter((d) => !d.is_placed).length },
    { k: "installed", label: "Installed", count: devices.filter((d) => d.status === "installed").length },
    { k: "unknown",   label: "Unknown",   count: devices.filter((d) => d.status === "unknown").length },
  ];

  const tabFiltered =
    filter === "all"       ? devices :
    filter === "placed"    ? devices.filter((d) => d.is_placed) :
    filter === "unplaced"  ? devices.filter((d) => !d.is_placed) :
    filter === "installed" ? devices.filter((d) => d.status === "installed") :
                             devices.filter((d) => d.status === "unknown");

  const searched = tabFiltered.filter((dev) => {
    const modelName = models.find((m) => m.id === dev.device_model_id)?.name;
    return matchesSearch(
      searchQ,
      dev.name,
      dev.device_type,
      dev.status,
      dev.serial_number,
      dev.asset_tag,
      dev.external_ref,
      modelName,
    );
  });

  const sorted = [...searched].sort((a, b) => {
    switch (sortCol) {
      case "name":   return cmpStr(a.name, b.name, sortDir);
      case "type":   return cmpStr(a.device_type, b.device_type, sortDir);
      case "status": return cmpStr(a.status, b.status, sortDir);
      case "placed": {
        if (a.is_placed === b.is_placed) return 0;
        return sortDir === "asc" ? (a.is_placed ? -1 : 1) : (a.is_placed ? 1 : -1);
      }
      default: return 0;
    }
  });

  const isFiltered = searchQ.trim() !== "" || filter !== "all";

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Concrete device records — placed and unplaced."
        actions={
          <button className="btn btn-primary" data-testid="device-add-btn" onClick={openAdd}>
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
          desc={`${sorted.length} of ${devices.length}`}
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
          <div className="panel-filter">
            <div className="pf-input-wrap">
              <span className="pf-icon"><IcSearch size={12} /></span>
              <input
                className="ri-input"
                placeholder="Search by name, type, status, serial…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                aria-label="Search devices"
              />
            </div>
            {searchQ && (
              <button
                className="btn btn-ghost btn-sm btn-icon"
                title="Clear search"
                aria-label="Clear search"
                onClick={() => setSearchQ("")}
              >
                <IcX size={11} />
              </button>
            )}
          </div>

          {sorted.length === 0 ? (
            <EmptyState
              icon={<IcBox size={28} />}
              title={isFiltered ? "No devices match" : "No devices yet"}
              body={
                isFiltered
                  ? "Try a different search term or filter tab."
                  : "Add a device to get started."
              }
            />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 20 }} />
                    <th
                      className="tbl-th-sort"
                      onClick={() => handleSortClick("name")}
                    >
                      Name<SortIc col="name" />
                    </th>
                    <th
                      className="tbl-th-sort"
                      onClick={() => handleSortClick("type")}
                    >
                      Type<SortIc col="type" />
                    </th>
                    <th
                      className="tbl-th-sort"
                      onClick={() => handleSortClick("status")}
                    >
                      Status<SortIc col="status" />
                    </th>
                    <th
                      className="tbl-th-sort"
                      onClick={() => handleSortClick("placed")}
                    >
                      Placed<SortIc col="placed" />
                    </th>
                    <th>Model</th>
                    <th className="tbl-mono">Serial</th>
                    <th className="tbl-mono">Asset</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((dev) => {
                    const devName = dev.name ?? "Unnamed device";
                    const modelName = models.find((m) => m.id === dev.device_model_id)?.name ?? null;
                    return (
                      <tr
                        key={dev.id}
                        data-dev-id={dev.id}
                        data-device-code={dev.code}
                        className={
                          dev.id === highlightedDeviceId ? "tbl-selected" : undefined
                        }
                      >
                        <td style={{ color: "var(--tx-3)" }}>
                          {typeIcon(dev.device_type)}
                        </td>
                        <td>
                          <strong>{devName}</strong>
                        </td>
                        <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>
                          {dev.device_type}
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
                          style={{
                            color: modelName ? undefined : "var(--st-warn-tx)",
                          }}
                        >
                          {modelName ?? "no model"}
                        </td>
                        <td className="tbl-mono">{dev.serial_number ?? "—"}</td>
                        <td className="tbl-mono">{dev.asset_tag ?? "—"}</td>
                        <td className="tbl-actions">
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Create similar"
                            aria-label={`Create similar to ${devName}`}
                            onClick={() => openSimilar(dev)}
                          >
                            <IcCopy size={12} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Edit"
                            aria-label={`Edit ${devName}`}
                            onClick={() => openEdit(dev)}
                          >
                            <IcEdit size={12} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Delete"
                            aria-label={`Delete ${devName}`}
                            onClick={() => setPendingDelete(dev)}
                            style={{ color: "var(--st-err-tx)" }}
                          >
                            <IcTrash size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <DeviceFormModal
        open={modalOpen}
        editing={editingDevice}
        models={models}
        onClose={() => { setModalOpen(false); setPrefillDevice(undefined); }}
        onSaved={handleSaved}
        defaultStatus={editingDevice ? undefined : defaultDeviceStatus}
        prefill={editingDevice ? undefined : prefillDevice}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name ?? "Unnamed device"}"?`}
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
