import { FormEvent, useEffect, useRef, useState } from "react";
import { parseTags, joinTags } from "../../lib/tags";
import {
  addLocation,
  deleteLocation,
  listLocations,
  updateLocation,
  type LocationDto,
} from "../../api/tauriClient";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { IcPlus, IcEdit, IcTrash, IcMapPin } from "../../components/ui/Icon";

interface Props {
  repoPath: string;
  highlightedLocationId?: string | null;
  onRepositoryMutated: () => void;
}

interface FormState {
  code: string;
  name: string;
  description: string;
  address: string;
  tags: string;
}

const EMPTY_FORM: FormState = { code: "", name: "", description: "", address: "", tags: "" };

function locationToForm(loc: LocationDto): FormState {
  return {
    code: loc.code,
    name: loc.name,
    description: loc.description ?? "",
    address: loc.address ?? "",
    tags: joinTags(loc.tags),
  };
}

export function LocationsPanel({
  repoPath,
  highlightedLocationId,
  onRepositoryMutated,
}: Props) {
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
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
      setLocations([]); setError(null); setForm(EMPTY_FORM);
      setFormError(null); setFormSuccess(null); setEditingId(null); setShowForm(false);
    }
    setLoading(true);
    listLocations()
      .then(setLocations)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null); setFormSuccess(null);
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) { setFormError("Code is required."); return; }
    if (!name) { setFormError("Name is required."); return; }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateLocation({
          id: editingId,
          code, name,
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Location "${code}" updated.`);
        setEditingId(null); setForm(EMPTY_FORM); setShowForm(false);
      } else {
        await addLocation({
          code, name,
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Location "${code}" added.`);
        setForm(EMPTY_FORM);
      }
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(loc: LocationDto) {
    setEditingId(loc.id); setForm(locationToForm(loc));
    setFormError(null); setFormSuccess(null); setShowForm(true);
  }

  function handleCancelEdit() {
    setEditingId(null); setForm(EMPTY_FORM);
    setFormError(null); setFormSuccess(null); setShowForm(false);
  }

  async function handleDelete(loc: LocationDto) {
    if (!confirm(`Delete location "${loc.name}"? This cannot be undone.`)) return;
    setFormError(null); setFormSuccess(null);
    try {
      await deleteLocation(loc.id);
      if (editingId === loc.id) { setEditingId(null); setForm(EMPTY_FORM); setShowForm(false); }
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  useEffect(() => {
    if (!highlightedLocationId || locations.length === 0) return;
    const el = document.querySelector(`[data-loc-id="${CSS.escape(highlightedLocationId)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedLocationId, locations]);

  const isEditing = editingId !== null;

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Physical sites that contain racks."
        actions={
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingId(null); setForm(EMPTY_FORM);
              setFormError(null); setFormSuccess(null); setShowForm(true);
            }}
          >
            <IcPlus size={12} /> Add location
          </button>
        }
      />
      <div className="page-content stack-4">
        {loading && <p style={{ fontSize: 12, color: "var(--tx-3)", fontStyle: "italic" }}>Loading…</p>}
        {error && <Banner tone="err">{error}</Banner>}

        {!loading && !error && locations.length === 0 && (
          <EmptyState
            icon={<IcMapPin size={32} />}
            title="No locations yet"
            body="Add a physical location to start building your inventory."
          />
        )}

        {locations.length > 0 && (
          <Panel flush title={`${locations.length} location${locations.length !== 1 ? "s" : ""}`}>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="tbl-mono">Code</th>
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
                    className={loc.id === highlightedLocationId ? "tbl-selected" : undefined}
                  >
                    <td className="tbl-mono"><strong>{loc.code}</strong></td>
                    <td>{loc.name}</td>
                    <td>{loc.address ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                    <td style={{ color: "var(--tx-3)" }}>{loc.description ?? "—"}</td>
                    <td className="tbl-num tbl-mono">{loc.rack_count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {loc.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                      </div>
                    </td>
                    <td className="tbl-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" title="Edit" onClick={() => handleEdit(loc)}>
                        <IcEdit size={12} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Delete"
                        onClick={() => handleDelete(loc)}
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

        {showForm && (
          <Panel title={isEditing ? "Edit Location" : "Add Location"}>
            <form onSubmit={handleSubmit} className="stack-3" style={{ maxWidth: 480 }}>
              {([
                ["Code", "code", "e.g. warsaw-serverroom-a", true],
                ["Name", "name", "e.g. Warsaw — Server Room A", true],
                ["Description", "description", "optional"],
                ["Address", "address", "optional"],
                ["Tags (comma-separated)", "tags", "e.g. production, warsaw"],
              ] as [string, keyof FormState, string, boolean?][]).map(([label, key, placeholder, req]) => (
                <div key={key}>
                  <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>
                    {label}{req && <span style={{ color: "var(--st-err-tx)" }}> *</span>}
                  </label>
                  <input
                    className="ri-input"
                    style={{ width: "100%" }}
                    value={form[key]}
                    placeholder={placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
              ))}

              {formError && <Banner tone="err">{formError}</Banner>}
              {formSuccess && <Banner tone="ok">{formSuccess}</Banner>}

              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? isEditing ? "Saving…" : "Adding…"
                    : isEditing ? "Save changes" : "Add location"}
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
