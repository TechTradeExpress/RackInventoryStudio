import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import { parseTags } from "../../lib/tags";
import {
  addRack,
  listLocations,
  listRacks,
  type LocationDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { RackDetailPanel } from "./RackDetailPanel";
import { parsePositiveInt } from "./positiveInt";

interface Props {
  repoPath: string;
  selectedRackId: string | null;
  onSelectRack: (rack: RackSummaryDto | null) => void;
  mutationToken: number;
  onRepositoryMutated: () => void;
}

interface PendingNavigation {
  placementId: string;
  message: string;
}

export function RacksPanel({ repoPath, selectedRackId, onSelectRack, mutationToken, onRepositoryMutated }: Props) {
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

  // Locations list — for the Add Rack location selector
  const [locations, setLocations] = useState<LocationDto[]>([]);

  // Add Rack form
  const [rackForm, setRackForm] = useState({
    locationId: "",
    code: "",
    name: "",
    heightU: "",
    row: "",
    description: "",
    tags: "",
  });
  const [rackFormError, setRackFormError] = useState<string | null>(null);
  const [rackFormSuccess, setRackFormSuccess] = useState<string | null>(null);
  const [rackFormSubmitting, setRackFormSubmitting] = useState(false);

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setRacks([]);
      setError(null);
      setRecentlyNavigatedRackId(null);
      setPendingNavigation(null);
    }
    setLoading(true);
    listRacks()
      .then(setRacks)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, racksReloadToken]);

  // Reload locations list whenever the repo changes (used by Add Rack selector).
  useEffect(() => {
    if (!repoPath) return;
    listLocations()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [repoPath]);

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

  async function handleAddRack(e: FormEvent) {
    e.preventDefault();
    setRackFormError(null);
    setRackFormSuccess(null);

    if (!rackForm.locationId) {
      setRackFormError("Location is required.");
      return;
    }
    const code = rackForm.code.trim();
    const name = rackForm.name.trim();
    if (!code) {
      setRackFormError("Code is required.");
      return;
    }
    if (!name) {
      setRackFormError("Name is required.");
      return;
    }
    const heightU = parsePositiveInt(rackForm.heightU);
    if (heightU === null) {
      setRackFormError("Height (U) must be a positive integer.");
      return;
    }

    setRackFormSubmitting(true);
    try {
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
      // Keep location selected for convenience when adding multiple racks
      setRackForm((f) => ({
        locationId: f.locationId,
        code: "",
        name: "",
        heightU: "",
        row: "",
        description: "",
        tags: "",
      }));
      handleRepositoryMutated();
    } catch (e) {
      setRackFormError(String(e));
    } finally {
      setRackFormSubmitting(false);
    }
  }

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
                  "Code",
                  "Name",
                  "Location",
                  "Height (U)",
                  "Row",
                  "Front",
                  "Rear",
                  "Total",
                ].map((h) => (
                  <th key={h} style={common.th}>
                    {h}
                  </th>
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
                    <td style={{ ...common.td, fontFamily: "monospace" }}>
                      {rack.code}
                    </td>
                    <td style={common.td}>{rack.name}</td>
                    <td style={{ ...common.td, fontFamily: "monospace" }}>
                      {rack.location_code}
                    </td>
                    <td style={common.td}>{rack.height_u}</td>
                    <td style={common.td}>{rack.row ?? ""}</td>
                    <td style={common.td}>{rack.front_placement_count}</td>
                    <td style={common.td}>{rack.rear_placement_count}</td>
                    <td style={common.td}>{rack.placement_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section style={rackFormStyles.formSection}>
        <h3 style={common.h3}>Add Rack</h3>
        <form onSubmit={handleAddRack} style={rackFormStyles.form}>
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

          <button
            type="submit"
            style={common.btn}
            disabled={rackFormSubmitting}
          >
            {rackFormSubmitting ? "Adding…" : "Add rack"}
          </button>
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
};
