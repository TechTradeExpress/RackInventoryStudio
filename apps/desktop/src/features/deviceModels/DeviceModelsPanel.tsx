import { useEffect, useRef, useState } from "react";
import {
  listDeviceModels,
  deleteDeviceModel,
  type DeviceModelDto,
} from "../../api/tauriClient";
import { DeviceModelFormModal } from "./DeviceModelFormModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { IcPlus, IcEdit, IcTrash, IcLayers } from "../../components/ui/Icon";

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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<DeviceModelDto | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<DeviceModelDto | null>(
    null,
  );
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
    }
    setLoading(true);
    listDeviceModels()
      .then(setModels)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, mutationToken, reloadToken]);

  function openAdd() {
    setEditingModel(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(m: DeviceModelDto) {
    setEditingModel(m);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function handleSaved() {
    setReloadToken((t) => t + 1);
    onRepositoryMutated();
    const label = editingModel ? editingModel.code : "Device model";
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
          <Panel
            flush
            title={`${models.length} model${models.length !== 1 ? "s" : ""}`}
          >
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl-mono">Code</th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Vendor</th>
                  <th className="tbl-mono">Model / SKU</th>
                  <th className="tbl-num">Height</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr
                    key={m.id}
                    data-model-id={m.id}
                    className={
                      m.id === highlightedDeviceModelId
                        ? "tbl-selected"
                        : undefined
                    }
                  >
                    <td className="tbl-mono">
                      <strong>{m.code}</strong>
                    </td>
                    <td>
                      <Badge
                        tone={m.device_type === "rack_object" ? "muted" : "info"}
                      >
                        {m.device_type}
                      </Badge>
                    </td>
                    <td>{m.name}</td>
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
          </Panel>
        )}
      </div>

      <DeviceModelFormModal
        open={modalOpen}
        editing={editingModel}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
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
