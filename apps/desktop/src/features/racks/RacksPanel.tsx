import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
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
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [recentlyNavigatedRackId, setRecentlyNavigatedRackId] = useState<
    string | null
  >(null);
  const [racksReloadToken, setRacksReloadToken] = useState(0);
  const prevRepoPathRef = useRef<string>("");

  const [locations, setLocations] = useState<LocationDto[]>([]);

  const [rackForm, setRackForm] = useState(EMPTY_RACK_FORM);
  const [rackFormError, setRackFormError] = useState<string | null>(null);
  const [rackFormSuccess, setRackFormSuccess] = useState<string | null>(null);
  const [rackFormSubmitting, setRackFormSubmitting] = useState(false);

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
      if (pendingRackNavTarget.placementId) {
        setPendingNavigation({
          placementId: pendingRackNavTarget.placementId,
          message: "Navigated from validation issue.",
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
        setRackForm((f) => ({
          ...EMPTY_RACK_FORM,
          locationId: f.locationId,
        }));
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
  }

  function handleCancelEdit() {
    setEditingRackId(null);
    setRackForm(EMPTY_RACK_FORM);
    setRackFormError(null);
    setRackFormSuccess(null);
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
      }
      if (selectedRackId === rack.id) {
        onSelectRack(null);
      }
      handleRepositoryMutated();
    } catch (e) {
      setRackFormError(String(e));
    }
  }

  const isEditing = editingRackId !== null;

  return (
    <>
      <section style={common.section}>
        <h2 style={common.h2}>Racks</h2>
        <p style={common.hint}>Click a row to view rack detail.</p>

        {loading && <p style={common.working}>Loading…</p>}
        {error && <div style={common.errorBox}>{error}</div>}

        {!loading && !error && racks.length === 0 && (
          <p style={common.hint}>No racks found.</p>
        )}

        {racks.length > 0 && (
          <table style={common.table}>
            <thead>
              <tr>
                {[
                  "Code", "Name", "Location", "Height (U)",
                  "Row", "Front", "Rear", "Total", "Actions",
                ].map((h) => (
                  <th key={h} style={common.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {racks.map((rack) => {
                const isSelected = rack.id === selectedRackId;
                const isRecentNav = rack.id === recentlyNavigatedRackId;
                return (
                  <tr
                    key={rack.id}
                    onClick={() => handleRowClick(rack)}
                    style={{
                      cursor: "pointer",
                      background:
                        isSelected && isRecentNav
                          ? "#d5ebd5"
                          : isSelected
                            ? "#e8f0fe"
                            : "inherit",
                    }}
                  >
                    <td style={{ ...common.td, fontFamily: "monospace" }}>{rack.code}</td>
                    <td style={common.td}>{rack.name}</td>
                    <td style={{ ...common.td, fontFamily: "monospace" }}>{rack.location_code}</td>
                    <td style={common.td}>{rack.height_u}</td>
                    <td style={common.td}>{rack.row ?? ""}</td>
                    <td style={common.td}>{rack.front_placement_count}</td>
                    <td style={common.td}>{rack.rear_placement_count}</td>
                    <td style={common.td}>{rack.placement_count}</td>
                    <td
                      style={{ ...common.td, whiteSpace: "nowrap" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        style={rackFormStyles.actionBtn}
                        onClick={() => handleEditRack(rack)}
                      >
                        Edit
                      </button>
                      <button
                        style={{ ...rackFormStyles.actionBtn, ...rackFormStyles.deleteBtn }}
                        onClick={() => handleDeleteRack(rack)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={rackFormStyles.formSection}>
        <h3 style={common.h3}>{isEditing ? "Edit Rack" : "Add Rack"}</h3>
        <form onSubmit={handleSubmitRack} style={rackFormStyles.form}>
          <div style={rackFormStyles.fieldRow}>
            <label style={rackFormStyles.label}>
              Location <span style={rackFormStyles.required}>*</span>
            </label>
            <select
              style={{ ...common.input, background: "#fff" }}
              value={rackForm.locationId}
              onChange={(e) =>
                setRackForm((f) => ({ ...f, locationId: e.target.value }))
              }
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
              ["Tags", "tags", "comma-separated, e.g. production, core"],
            ] as [string, string, string, boolean?][]
          ).map(([label, key, placeholder, req]) => (
            <div key={key} style={rackFormStyles.fieldRow}>
              <label style={rackFormStyles.label}>
                {label}
                {req && <span style={rackFormStyles.required}> *</span>}
              </label>
              <input
                style={common.input}
                value={rackForm[key as keyof typeof rackForm]}
                placeholder={placeholder}
                onChange={(e) =>
                  setRackForm((f) => ({ ...f, [key]: e.target.value }))
                }
              />
            </div>
          ))}

          {rackFormError && (
            <div style={common.errorBox}>{rackFormError}</div>
          )}
          {rackFormSuccess && (
            <div style={rackFormStyles.successBox}>{rackFormSuccess}</div>
          )}

          <div style={rackFormStyles.btnRow}>
            <button
              type="submit"
              style={common.btn}
              disabled={rackFormSubmitting}
            >
              {rackFormSubmitting
                ? isEditing ? "Saving…" : "Adding…"
                : isEditing ? "Save changes" : "Add rack"}
            </button>
            {isEditing && (
              <button
                type="button"
                style={{ ...common.btn, ...rackFormStyles.cancelBtn }}
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {selectedRack && (
        <RackDetailPanel
          rack={selectedRack}
          mutationToken={mutationToken}
          onRepositoryMutated={handleRepositoryMutated}
          onNavigateToRackPlacement={handleNavigateToRackPlacement}
          initialNavigation={pendingNavigation}
          onNavigationConsumed={() => setPendingNavigation(null)}
        />
      )}
    </>
  );
}

const rackFormStyles = {
  formSection: {
    marginTop: "1.25rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid #eee",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    maxWidth: "480px",
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
