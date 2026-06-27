import { useEffect, useRef, useState } from "react";
import {
  listDeviceModels,
  deleteDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { IcPlus, IcEdit, IcTrash, IcLayers, IcSearch, IcX, IcCopy } from "../../components/ui/Icon";
import { matchesSearch, cmpStr, cmpNum, toggleDir, type SortDir } from "../../lib/listHelpers";
import { joinTags } from "../../lib/tags";
import { DeviceModelFormModal, type DeviceModelPrefill } from "./DeviceModelFormModal";

type ModelSortCol = "name" | "type" | "vendor" | "sku" | "height";

interface Props {
  repoPath: string;
  mutationToken: number;
  highlightedDeviceModelId?: string | null;
  onRepositoryMutated: () => void;
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
  const [reloadToken, setReloadToken] = useState(0);
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<ModelSortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<DeviceModelDto | null>(null);
  const [prefillModel, setPrefillModel] = useState<DeviceModelPrefill | undefined>(undefined);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<DeviceModelDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Success banner
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setModels([]);
      setError(null);
      setSuccessMsg(null);
      setModalOpen(false);
      setEditingModel(null);
      setPendingDelete(null);
      setSearchQ("");
    }
    setLoading(true);
    listDeviceModels()
      .then(setModels)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, mutationToken, reloadToken]);

  function openAdd() {
    setPrefillModel(undefined);
    setEditingModel(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(m: DeviceModelDto) {
    setPrefillModel(undefined);
    setEditingModel(m);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openSimilar(m: DeviceModelDto) {
    setPrefillModel({
      deviceType: m.device_type,
      name: `Copy of ${m.name || "unnamed model"}`,
      vendor: m.vendor ?? "",
      modelNumber: m.model_number ?? "",
      heightU: String(m.default_height_u),
      description: m.description ?? "",
      tags: joinTags(m.tags),
    });
    setEditingModel(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function handleSaved() {
    setReloadToken((t) => t + 1);
    onRepositoryMutated();
    const label = editingModel ? editingModel.name : "Device model";
    setSuccessMsg(editingModel ? `"${label}" updated.` : "Device model added.");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteDeviceModel(pendingDelete.id);
      setPendingDelete(null);
      setReloadToken((t) => t + 1);
      onRepositoryMutated();
    } catch (e) {
      setDeleteError(String(e));
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (!highlightedDeviceModelId || models.length === 0) return;
    const el = document.querySelector(
      `[data-model-id="${CSS.escape(highlightedDeviceModelId)}"]`,
    );
    el?.scrollIntoView({ block: "center" });
  }, [highlightedDeviceModelId, models]);

  function handleSortClick(col: ModelSortCol) {
    if (sortCol === col) setSortDir((d) => toggleDir(d));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIc({ col }: { col: ModelSortCol }) {
    if (sortCol !== col) return null;
    return <span className="sort-ic">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Filter pipeline ────────────────────────────────────────────────────────

  const searched = models.filter((m) =>
    matchesSearch(searchQ, m.name, m.device_type, m.vendor, m.model_number),
  );

  const sorted = [...searched].sort((a, b) => {
    switch (sortCol) {
      case "name":   return cmpStr(a.name, b.name, sortDir);
      case "type":   return cmpStr(a.device_type, b.device_type, sortDir);
      case "vendor": return cmpStr(a.vendor, b.vendor, sortDir);
      case "sku":    return cmpStr(a.model_number, b.model_number, sortDir);
      case "height": return cmpNum(a.default_height_u, b.default_height_u, sortDir);
      default: return 0;
    }
  });

  const isSearching = searchQ.trim() !== "";
  const panelTitle = isSearching
    ? `${sorted.length} of ${models.length} model${models.length !== 1 ? "s" : ""}`
    : `${models.length} model${models.length !== 1 ? "s" : ""}`;

  return (
    <>
      <PageHeader
        title="Device Models"
        subtitle="Hardware templates referenced by devices and placements."
        actions={
          <button className="btn btn-primary" onClick={openAdd}>
            <IcPlus size={12} /> Add model
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

        {!loading && !error && models.length === 0 && (
          <EmptyState
            icon={<IcLayers size={32} />}
            title="No device models yet"
            body="Add a model to define hardware templates for devices."
          />
        )}

        {models.length > 0 && (
          <Panel flush title={panelTitle}>
            <div className="panel-filter">
              <div className="pf-input-wrap">
                <span className="pf-icon"><IcSearch size={12} /></span>
                <input
                  className="ri-input"
                  placeholder="Search by name, type, vendor, SKU…"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  aria-label="Search device models"
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
                icon={<IcLayers size={28} />}
                title="No models match"
                body="Try a different search term."
              />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
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
                        onClick={() => handleSortClick("vendor")}
                      >
                        Vendor<SortIc col="vendor" />
                      </th>
                      <th
                        className="tbl-th-sort tbl-mono"
                        onClick={() => handleSortClick("sku")}
                      >
                        Model / SKU<SortIc col="sku" />
                      </th>
                      <th
                        className="tbl-th-sort tbl-num"
                        onClick={() => handleSortClick("height")}
                      >
                        Height<SortIc col="height" />
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => (
                      <tr
                        key={m.id}
                        data-model-id={m.id}
                        className={
                          m.id === highlightedDeviceModelId
                            ? "tbl-selected"
                            : undefined
                        }
                      >
                        <td>
                          <strong>{m.name}</strong>
                        </td>
                        <td>
                          <Badge
                            tone={m.device_type === "rack_object" ? "muted" : "info"}
                          >
                            {m.device_type}
                          </Badge>
                        </td>
                        <td>
                          {m.vendor ?? (
                            <span style={{ color: "var(--tx-4)" }}>—</span>
                          )}
                        </td>
                        <td className="tbl-mono">{m.model_number ?? "—"}</td>
                        <td className="tbl-num tbl-mono">{m.default_height_u}U</td>
                        <td className="tbl-actions">
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Create similar"
                            aria-label={`Create similar to ${m.name}`}
                            onClick={() => openSimilar(m)}
                          >
                            <IcCopy size={12} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Edit"
                            aria-label={`Edit ${m.name}`}
                            onClick={() => openEdit(m)}
                          >
                            <IcEdit size={12} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Delete"
                            aria-label={`Delete ${m.name}`}
                            onClick={() => setPendingDelete(m)}
                            style={{ color: "var(--st-err-tx)" }}
                          >
                            <IcTrash size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>

      <DeviceModelFormModal
        open={modalOpen}
        editing={editingModel}
        onClose={() => { setModalOpen(false); setPrefillModel(undefined); }}
        onSaved={handleSaved}
        prefill={prefillModel}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        body="This will remove the device model from the repository on the next save. Models in use by devices cannot be deleted."
        confirmLabel="Delete model"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
