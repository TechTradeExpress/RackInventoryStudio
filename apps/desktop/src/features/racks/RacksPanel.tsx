import { useEffect, useRef, useState } from "react";
import {
  deleteRack,
  listRacks,
  type LocationDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { RackDetailPanel } from "./RackDetailPanel";
import { RackFormModal } from "./RackFormModal";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { EmptyState } from "../../components/ui/EmptyState";
import { Banner } from "../../components/ui/Banner";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { IcPlus, IcEdit, IcTrash, IcServer } from "../../components/ui/Icon";

interface RackNavTarget {
  rackId: string;
  placementId?: string;
}

interface Props {
  repoPath: string;
  selectedRackId: string | null;
  onSelectRack: (rack: RackSummaryDto | null) => void;
  mutationToken: number;
  pendingRackNavTarget?: RackNavTarget | null;
  onRackNavTargetConsumed?: () => void;
  onRepositoryMutated: () => void;
  selectedLocation?: LocationDto | null;
}

interface PendingNavigation {
  placementId: string;
  message: string;
}

function UtilBar({ value }: { value: number }) {
  const pct = Math.min(Math.round(value * 100), 100);
  const tone =
    pct >= 90
      ? "var(--st-err-tx)"
      : pct >= 70
        ? "var(--st-warn-tx)"
        : "var(--ac)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div
        style={{
          flex: 1,
          height: 5,
          background: "var(--bg-sunken)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: pct ? tone : "transparent",
            transition: "width 0.2s",
          }}
        />
      </div>
      <span
        className="mono"
        style={{
          minWidth: 32,
          textAlign: "right",
          color: "var(--tx-3)",
          fontSize: 11,
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

export function RacksPanel({
  repoPath,
  selectedRackId,
  onSelectRack,
  mutationToken,
  pendingRackNavTarget,
  onRackNavTargetConsumed,
  onRepositoryMutated,
  selectedLocation = null,
}: Props) {
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [recentlyNavigatedRackId, setRecentlyNavigatedRackId] = useState<
    string | null
  >(null);
  const [racksReloadToken, setRacksReloadToken] = useState(0);
  const prevRepoPathRef = useRef<string>("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRack, setEditingRack] = useState<RackSummaryDto | null>(null);

  // Delete confirm state
  const [pendingDelete, setPendingDelete] = useState<RackSummaryDto | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Success banner
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setRacks([]);
      setError(null);
      setRecentlyNavigatedRackId(null);
      setPendingNavigation(null);
      setModalOpen(false);
      setEditingRack(null);
      setPendingDelete(null);
      setSuccessMsg(null);
    }
    setLoading(true);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, racksReloadToken]);

  useEffect(() => {
    if (!pendingRackNavTarget || racks.length === 0) return;
    const rack = racks.find((r) => r.id === pendingRackNavTarget.rackId);
    if (rack) {
      onSelectRack(rack);
      setRecentlyNavigatedRackId(rack.id);
      if (pendingRackNavTarget.placementId) {
        setPendingNavigation({
          placementId: pendingRackNavTarget.placementId,
          message: "Placement highlighted from navigation.",
        });
      }
    }
    onRackNavTargetConsumed?.();
  }, [racks, pendingRackNavTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRepositoryMutated() {
    setRacksReloadToken((t) => t + 1);
    onRepositoryMutated();
  }

  const selectedRack = racks.find((r) => r.id === selectedRackId) ?? null;

  function handleRowClick(rack: RackSummaryDto) {
    setPendingNavigation(null);
    setRecentlyNavigatedRackId(null);
    onSelectRack(selectedRackId === rack.id ? null : rack);
  }

  function handleNavigateToRackPlacement(
    rackId: string,
    placementId: string,
  ): boolean {
    const destRack = racks.find((r) => r.id === rackId);
    if (!destRack) return false;
    setPendingNavigation({
      placementId,
      message: `Moved to rack ${destRack.code} in memory. Use Save to persist changes.`,
    });
    setRecentlyNavigatedRackId(destRack.id);
    onSelectRack(destRack);
    return true;
  }

  function openAdd() {
    setEditingRack(null);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function openEdit(rack: RackSummaryDto) {
    setEditingRack(rack);
    setSuccessMsg(null);
    setModalOpen(true);
  }

  function handleSaved() {
    handleRepositoryMutated();
    const label = editingRack ? editingRack.code : "Rack";
    setSuccessMsg(editingRack ? `"${label}" updated.` : "Rack added.");
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteRack(pendingDelete.id);
      if (selectedRackId === pendingDelete.id) onSelectRack(null);
      setPendingDelete(null);
      handleRepositoryMutated();
    } catch (e) {
      setDeleteError(String(e));
      setPendingDelete(null);
    }
  }

  // Detail view — when a rack is selected, show only the detail
  if (selectedRack) {
    return (
      <RackDetailPanel
        rack={selectedRack}
        mutationToken={mutationToken}
        onRepositoryMutated={handleRepositoryMutated}
        onNavigateToRackPlacement={handleNavigateToRackPlacement}
        initialNavigation={pendingNavigation}
        onNavigationConsumed={() => setPendingNavigation(null)}
        onBack={() => {
          setPendingNavigation(null);
          setRecentlyNavigatedRackId(null);
          onSelectRack(null);
        }}
      />
    );
  }

  // No location context — guide user to select one from Locations
  if (!selectedLocation) {
    return (
      <>
        <PageHeader
          title="Racks"
          subtitle="Physical rack cabinets, managed per location."
        />
        <div className="page-content">
          <EmptyState
            icon={<IcServer size={32} />}
            title="Select a location to manage its racks"
            body="Go to Locations and click the Manage racks button for the location you want to work with."
          />
        </div>
      </>
    );
  }

  // Location-scoped list view
  const visibleRacks = racks.filter((r) => r.location_id === selectedLocation.id);

  const locationLabel = `${selectedLocation.code} — ${selectedLocation.name}`;

  return (
    <>
      <PageHeader
        title="Racks"
        subtitle={`Racks in ${selectedLocation.name} (${selectedLocation.code})`}
        actions={
          <button className="btn btn-primary" onClick={openAdd}>
            <IcPlus size={12} /> Add rack
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

        {!loading && !error && visibleRacks.length === 0 && (
          <EmptyState
            icon={<IcServer size={32} />}
            title="No racks in this location"
            body="Add a rack cabinet to start building the inventory for this location."
          />
        )}

        {visibleRacks.length > 0 && (
          <Panel
            flush
            title={`${visibleRacks.length} rack${visibleRacks.length !== 1 ? "s" : ""}`}
          >
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl-mono">Code</th>
                  <th>Name</th>
                  <th className="tbl-mono">Row</th>
                  <th className="tbl-num">Height</th>
                  <th>Front</th>
                  <th>Rear</th>
                  <th>Utilization</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleRacks.map((rack) => {
                  const isNavHighlight = rack.id === recentlyNavigatedRackId;
                  const util =
                    rack.height_u > 0
                      ? rack.placement_count / (rack.height_u * 2)
                      : 0;
                  return (
                    <tr
                      key={rack.id}
                      className={`tbl-clickable${isNavHighlight ? " tbl-selected" : ""}`}
                      onClick={() => handleRowClick(rack)}
                    >
                      <td className="tbl-mono">
                        <strong>{rack.code}</strong>
                      </td>
                      <td>{rack.name}</td>
                      <td className="tbl-mono">{rack.row ?? "—"}</td>
                      <td className="tbl-num tbl-mono">{rack.height_u}U</td>
                      <td>
                        <Badge tone={rack.front_placement_count === 0 ? "muted" : "info"}>
                          {rack.front_placement_count} placed
                        </Badge>
                      </td>
                      <td>
                        <Badge tone={rack.rear_placement_count === 0 ? "muted" : "info"}>
                          {rack.rear_placement_count} placed
                        </Badge>
                      </td>
                      <td>
                        <UtilBar value={util} />
                      </td>
                      <td
                        className="tbl-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Edit"
                          aria-label={`Edit ${rack.name}`}
                          onClick={() => openEdit(rack)}
                        >
                          <IcEdit size={12} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Delete"
                          aria-label={`Delete ${rack.name}`}
                          onClick={() => setPendingDelete(rack)}
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
          </Panel>
        )}
      </div>

      <RackFormModal
        open={modalOpen}
        editing={editingRack}
        locationId={editingRack?.location_id ?? selectedLocation.id}
        locationLabel={editingRack ? editingRack.location_code : locationLabel}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.name}"?`}
        body="This will remove the rack from the repository on the next save. Racks with placements cannot be deleted."
        confirmLabel="Delete rack"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
