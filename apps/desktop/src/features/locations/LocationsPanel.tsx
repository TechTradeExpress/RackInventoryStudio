import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import { parseTags, joinTags } from "../../lib/tags";
import {
  addLocation,
  deleteLocation,
  listLocations,
  updateLocation,
  type LocationDto,
} from "../../api/tauriClient";

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

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  description: "",
  address: "",
  tags: "",
};

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // null = add mode; string = edit mode (the id being edited)
  const [editingId, setEditingId] = useState<string | null>(null);

  const prevRepoPathRef = useRef<string>("");

  useEffect(() => {
    if (!repoPath) return;
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setLocations([]);
      setError(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      setFormSuccess(null);
      setEditingId(null);
    }
    setLoading(true);
    listLocations()
      .then(setLocations)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) { setFormError("Code is required."); return; }
    if (!name) { setFormError("Name is required."); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateLocation({
          id: editingId,
          code,
          name,
          description: form.description.trim() || undefined,
          address: form.address.trim() || undefined,
          tags: parseTags(form.tags),
        });
        setFormSuccess(`Location "${code}" updated.`);
        setEditingId(null);
        setForm(EMPTY_FORM);
      } else {
        await addLocation({
          code,
          name,
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
    setEditingId(loc.id);
    setForm(locationToForm(loc));
    setFormError(null);
    setFormSuccess(null);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormSuccess(null);
  }

  async function handleDelete(loc: LocationDto) {
    if (!confirm(`Delete location "${loc.name}"? This cannot be undone.`)) return;
    setFormError(null);
    setFormSuccess(null);
    try {
      await deleteLocation(loc.id);
      if (editingId === loc.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    }
  }

  function field(
    label: string,
    key: keyof FormState,
    placeholder?: string,
    required?: boolean,
  ) {
    return (
      <div style={styles.fieldRow}>
        <label style={styles.label}>
          {label}
          {required && <span style={styles.required}> *</span>}
        </label>
        <input
          style={common.input}
          value={form[key]}
          placeholder={placeholder}
          onChange={(e) =>
            setForm((f) => ({ ...f, [key]: e.target.value }))
          }
        />
      </div>
    );
  }

  useEffect(() => {
    if (!highlightedLocationId || locations.length === 0) return;
    const el = document.querySelector(`[data-loc-id="${highlightedLocationId}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [highlightedLocationId, locations]);

  const isEditing = editingId !== null;

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Locations</h2>

      {loading && <p style={common.working}>Loading…</p>}
      {error && <div style={common.errorBox}>{error}</div>}

      {!loading && !error && locations.length === 0 && (
        <p style={common.hint}>No locations found.</p>
      )}

      {locations.length > 0 && (
        <table style={common.table}>
          <thead>
            <tr>
              {["Code", "Name", "Racks", "Address", "Description", "Actions"].map((h) => (
                <th key={h} style={common.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr
                key={loc.id}
                data-loc-id={loc.id}
                style={
                  loc.id === highlightedLocationId
                    ? { background: "#fff8c5" }
                    : undefined
                }
              >
                <td style={{ ...common.td, fontFamily: "monospace" }}>{loc.code}</td>
                <td style={common.td}>{loc.name}</td>
                <td style={common.td}>{loc.rack_count}</td>
                <td style={common.td}>{loc.address ?? ""}</td>
                <td style={common.td}>{loc.description ?? ""}</td>
                <td style={{ ...common.td, whiteSpace: "nowrap" }}>
                  <button
                    style={styles.actionBtn}
                    onClick={() => handleEdit(loc)}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    onClick={() => handleDelete(loc)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={styles.formSection}>
        <h3 style={common.h3}>{isEditing ? "Edit Location" : "Add Location"}</h3>
        <form onSubmit={handleSubmit} style={styles.form}>
          {field("Code", "code", "e.g. warsaw-serverroom-a", true)}
          {field("Name", "name", "e.g. Warsaw - Server Room A", true)}
          {field("Description", "description", "optional")}
          {field("Address", "address", "optional")}
          {field("Tags", "tags", "comma-separated, e.g. production, warsaw")}

          {formError && <div style={common.errorBox}>{formError}</div>}
          {formSuccess && <div style={styles.successBox}>{formSuccess}</div>}

          <div style={styles.btnRow}>
            <button type="submit" style={common.btn} disabled={submitting}>
              {submitting
                ? isEditing ? "Saving…" : "Adding…"
                : isEditing ? "Save changes" : "Add location"}
            </button>
            {isEditing && (
              <button
                type="button"
                style={{ ...common.btn, ...styles.cancelBtn }}
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </section>
  );
}

const styles = {
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
