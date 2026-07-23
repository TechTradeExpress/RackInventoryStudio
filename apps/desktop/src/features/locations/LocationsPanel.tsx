import { useEffect, useRef, useState } from "react";
import {
  deleteLocation,
  listLocations,
  type LocationDto,
} from "../../api/tauriClient";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { IcPlus, IcEdit, IcTrash, IcMapPin } from "../../components/ui/Icon";
import { LocationFormModal } from "./LocationFormModal";

interface Props {
  repoPath: string;
  highlightedLocationId?: string | null;
  onRepositoryMutated: () => void;
  onManageRacks: (location: LocationDto) => void;
}

export function LocationsPanel({
  repoPath,
  highlightedLocationId,
  onRepositoryMutated,
  onManageRacks,
}: Props) {
  const [locations, setLocations]     = useState<LocationDto[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [successMsg, setSuccessMsg]   = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen]           = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationDto | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<LocationDto | null>(null);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setLocations([]); setError(null); setSuccessMsg(null);
      setModalOpen(false); setEditingLocation(null); setPendingDelete(null);
    }
    setLoading(true);
    listLocations()
      .then(setLocations)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  function openAdd() {
    setEditingLocation(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(loc: LocationDto) {
    setEditingLocation(loc);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  async function handleSaved() {
    try {
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
      const label = editingLocation ? editingLocation.name : "Location";
      setSuccessMsg(editingLocation ? `"${label}" updated.` : "Location added.");
    } catch (e) {
      setError(String(e));
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteLocation(pendingDelete.id);
      setPendingDelete(null);
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
    } catch (e) {
      setDeleteError(String(e));
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (!highlightedLocationId || locations.length === 0) return;
    const el = document.querySelector(`[data-loc-id="${CSS.escape(highlightedLocationId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedLocationId, locations]);

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Physical sites that contain racks."
        actions={
          <button className="btn btn-primary" data-testid="location-add-btn" onClick={openAdd}>
            <IcPlus size={12} /> Add location
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>
        )}
        {error && <Banner tone="err">{error}</Banner>}
        {deleteError && (
          <div data-testid="location-delete-error">
            <Banner tone="err">{deleteError}</Banner>
          </div>
        )}
        {successMsg && (
          <Banner tone="ok" onDismiss={() => setSuccessMsg(null)}>{successMsg}</Banner>
        )}

        {!loading && !error && locations.length === 0 && (
          <EmptyState
            icon={<IcMapPin size={32} />}
            title="No locations yet"
            body="Add a physical location to start building your inventory."
          />
        )}

        {locations.length > 0 && (
          <Panel flush title={`${locations.length} location${locations.length !== 1 ? "s" : ""}`}>
            <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Description</th>
                  <th className="tbl-num">Racks</th>
                  <th>Tags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr
                    key={loc.id}
                    data-loc-id={loc.id}
                    data-location-code={loc.code}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open racks for ${loc.name}`}
                    className={`tbl-clickable${loc.id === highlightedLocationId ? " tbl-selected" : ""}`}
                    onClick={() => onManageRacks?.(loc)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      const target = e.target as HTMLElement;
                      if (
                        target !== e.currentTarget &&
                        target.closest('button, a, input, select, textarea, [role="button"]')
                      ) return;
                      e.preventDefault();
                      onManageRacks?.(loc);
                    }}
                  >
                    <td><strong>{loc.name}</strong></td>
                    <td>{loc.address ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                    <td style={{ color: "var(--tx-3)" }}>{loc.description ?? "—"}</td>
                    <td className="tbl-num tbl-mono">{loc.rack_count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {loc.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                      </div>
                    </td>
                    <td
                      className="tbl-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Edit"
                        aria-label={`Edit ${loc.name}`}
                        onClick={() => openEdit(loc)}
                      >
                        <IcEdit size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        aria-label={`Delete ${loc.name}`}
                        onClick={() => setPendingDelete(loc)}
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
          </Panel>
        )}
      </div>

      <LocationFormModal
        open={modalOpen}
        editing={editingLocation}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        body="This will remove the location record from the repository on the next save. Locations with racks cannot be deleted."
        confirmLabel="Delete location"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
