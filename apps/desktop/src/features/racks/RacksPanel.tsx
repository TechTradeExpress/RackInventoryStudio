import { FormEvent, useEffect, useRef, useState } from "react";
import { parseTags, joinTags } from "../../lib/tags";
import {
  addRack,
  deleteRack,
  listLocations,
  listRacks,
  updateRack,
  type LocationDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { RackDetailPanel } from "./RackDetailPanel";
import { parsePositiveInt } from "./positiveInt";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { EmptyState } from "../../components/ui/EmptyState";
import { Banner } from "../../components/ui/Banner";
import { Badge } from "../../components/ui/Badge";
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
}

interface PendingNavigation {
  placementId: string;
  message: string;
}

const EMPTY_RACK_FORM = {
  locationId: "",
  code: "",
  name: "",
  heightU: "",
  row: "",
  description: "",
  tags: "",
};

function rackToForm(rack: RackSummaryDto) {
  return {
    locationId: rack.location_id,
    code: rack.code,
    name: rack.name,
    heightU: String(rack.height_u),
    row: rack.row ?? "",
    description: rack.description ?? "",
    tags: joinTags(rack.tags),
  };
}

function UtilBar({ value }: { value: number }) {
  const pct = Math.min(Math.round(value * 100), 100);
  const tone = pct >= 90 ? "var(--st-err-tx)" : pct >= 70 ? "var(--st-warn-tx)" : "var(--ac)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 5, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: pct ? tone : "transparent", transition: "width 0.2s" }} />
      </div>
      <span className="mono" style={{ minWidth: 32, textAlign: "right", color: "var(--tx-3)", fontSize: 11 }}>{pct}%</span>
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
}: Props) {
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [recentlyNavigatedRackId, setRecentlyNavigatedRackId] = useState<string | null>(null);
  const [racksReloadToken, setRacksReloadToken] = useState(0);
  const prevRepoPathRef = useRef<string>("");

  const [locations, setLocations] = useState<LocationDto[]>([]);

  const [rackForm, setRackForm] = useState(EMPTY_RACK_FORM);
  const [rackFormError, setRackFormError] = useState<string | null>(null);
  const [rackFormSuccess, setRackFormSuccess] = useState<string | null>(null);
  const [rackFormSubmitting, setRackFormSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // null = add mode; string = edit mode (id being edited)
  const [editingRackId, setEditingRackId] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setRacks([]);
      setError(null);
      setRecentlyNavigatedRackId(null);
      setPendingNavigation(null);
      setEditingRackId(null);
      setRackForm(EMPTY_RACK_FORM);
      setShowAddForm(false);
    }
    setLoading(true);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, racksReloadToken]);

  useEffect(() => {
    if (!repoPath) return;
    listLocations()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [repoPath]);

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

  function handleNavigateToRackPlacement(rackId: string, placementId: string): boolean {
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

  function validateForm() {
    if (!rackForm.locationId) return "Location is required.";
    if (!rackForm.code.trim()) return "Code is required.";
    if (!rackForm.name.trim()) return "Name is required.";
    if (parsePositiveInt(rackForm.heightU) === null) return "Height (U) must be a positive integer.";
    return null;
  }

  async function handleSubmitRack(e: FormEvent) {
    e.preventDefault();
    setRackFormError(null);
    setRackFormSuccess(null);
    const err = validateForm();
    if (err) { setRackFormError(err); return; }

    const code = rackForm.code.trim();
    const name = rackForm.name.trim();
    const heightU = parsePositiveInt(rackForm.heightU)!;

    setRackFormSubmitting(true);
    try {
      if (editingRackId) {
        await updateRack({
          id: editingRackId,
          location_id: rackForm.locationId,
          code,
          name,
          height_u: heightU,
          row: rackForm.row.trim() || undefined,
          description: rackForm.description.trim() || undefined,
          tags: parseTags(rackForm.tags),
        });
        setRackFormSuccess(`Rack "${code}" updated.`);
        setEditingRackId(null);
        setRackForm(EMPTY_RACK_FORM);
        setShowAddForm(false);
      } else {
        await addRack({
          location_id: rackForm.locationId,
          code,
          name,
          height_u: heightU,
          row: rackForm.row.trim() || undefined,
          description: rackForm.description.trim() || undefined,
          tags: parseTags(rackForm.tags),
        });
        setRackFormSuccess(`Rack "${code}" added.`);
        setRackForm((f) => ({ ...EMPTY_RACK_FORM, locationId: f.locationId }));
      }
      handleRepositoryMutated();
    } catch (e) {
      setRackFormError(String(e));
    } finally {
      setRackFormSubmitting(false);
    }
  }

  function handleEditRack(rack: RackSummaryDto) {
    setEditingRackId(rack.id);
    setRackForm(rackToForm(rack));
    setRackFormError(null);
    setRackFormSuccess(null);
    setShowAddForm(true);
  }

  function handleCancelEdit() {
    setEditingRackId(null);
    setRackForm(EMPTY_RACK_FORM);
    setRackFormError(null);
    setRackFormSuccess(null);
    setShowAddForm(false);
  }

  async function handleDeleteRack(rack: RackSummaryDto) {
    if (!confirm(`Delete rack "${rack.name}"? This cannot be undone.`)) return;
    setRackFormError(null);
    setRackFormSuccess(null);
    try {
      await deleteRack(rack.id);
      if (editingRackId === rack.id) {
        setEditingRackId(null);
        setRackForm(EMPTY_RACK_FORM);
        setShowAddForm(false);
      }
      if (selectedRackId === rack.id) onSelectRack(null);
      handleRepositoryMutated();
    } catch (e) {
      setRackFormError(String(e));
    }
  }

  const isEditing = editingRackId !== null;

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

  // List view
  return (
    <>
      <PageHeader
        title="Racks"
        subtitle="Physical rack cabinets, grouped by location."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingRackId(null);
              setRackForm(EMPTY_RACK_FORM);
              setRackFormError(null);
              setRackFormSuccess(null);
              setShowAddForm(true);
            }}
          >
            <IcPlus size={12} /> Add rack
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && (
          <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>
        )}
        {error && <Banner tone="err">{error}</Banner>}

        {!loading && !error && racks.length === 0 && (
          <EmptyState
            icon={<IcServer size={32} />}
            title="No racks yet"
            body="Add a rack cabinet to start building your inventory."
          />
        )}

        {racks.length > 0 && (
          <Panel flush>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl-mono">Code</th>
                  <th>Name</th>
                  <th className="tbl-mono">Location</th>
                  <th className="tbl-mono">Row</th>
                  <th className="tbl-num">Height</th>
                  <th>Front</th>
                  <th>Rear</th>
                  <th>Utilization</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {racks.map((rack) => {
                  const isNavHighlight = rack.id === recentlyNavigatedRackId;
                  const util = rack.height_u > 0 ? rack.placement_count / (rack.height_u * 2) : 0;
                  return (
                    <tr
                      key={rack.id}
                      className={`tbl-clickable${isNavHighlight ? " tbl-selected" : ""}`}
                      onClick={() => handleRowClick(rack)}
                    >
                      <td className="tbl-mono"><strong>{rack.code}</strong></td>
                      <td>{rack.name}</td>
                      <td className="tbl-mono">{rack.location_code}</td>
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
                      <td><UtilBar value={util} /></td>
                      <td className="tbl-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Edit"
                          onClick={() => handleEditRack(rack)}
                        >
                          <IcEdit size={12} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Delete"
                          onClick={() => handleDeleteRack(rack)}
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

        {rackFormError && !showAddForm && <Banner tone="err">{rackFormError}</Banner>}

        {showAddForm && (
          <Panel
            title={isEditing ? "Edit Rack" : "Add Rack"}
            desc={isEditing ? `Editing ${editingRackId}` : undefined}
          >
            <form onSubmit={handleSubmitRack} className="stack-3" style={{ maxWidth: 480 }}>
              <div>
                <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                  Location <span style={{ color: "var(--st-err-tx)" }}>*</span>
                </label>
                <select
                  className="ri-input"
                  style={{ width: "100%", background: "var(--bg-surface)" }}
                  value={rackForm.locationId}
                  onChange={(e) => setRackForm((f) => ({ ...f, locationId: e.target.value }))}
                >
                  <option value="">— select location —</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {(
                [
                  ["Code", "code", "e.g. rack-a01", true],
                  ["Name", "name", "e.g. Rack A01", true],
                  ["Height (U)", "heightU", "e.g. 42", true],
                  ["Row", "row", "optional"],
                  ["Description", "description", "optional"],
                  ["Tags", "tags", "comma-separated"],
                ] as [string, string, string, boolean?][]
              ).map(([label, key, placeholder, req]) => (
                <div key={key}>
                  <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                    {label}{req && <span style={{ color: "var(--st-err-tx)" }}> *</span>}
                  </label>
                  <input
                    className="ri-input"
                    style={{ width: "100%" }}
                    value={rackForm[key as keyof typeof rackForm]}
                    placeholder={placeholder}
                    onChange={(e) => setRackForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}

              {rackFormError && <Banner tone="err">{rackFormError}</Banner>}
              {rackFormSuccess && <Banner tone="ok">{rackFormSuccess}</Banner>}

              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={rackFormSubmitting}>
                  {rackFormSubmitting
                    ? isEditing ? "Saving…" : "Adding…"
                    : isEditing ? "Save changes" : "Add rack"}
                </button>
                <button type="button" className="btn" onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          </Panel>
        )}
      </div>
    </>
  );
}
