import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import { parseTags } from "../../lib/tags";
import {
  addLocation,
  listLocations,
  type LocationDto,
} from "../../api/tauriClient";

interface Props {
  repoPath: string;
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

export function LocationsPanel({ repoPath, onRepositoryMutated }: Props) {
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!code) {
      setFormError("Code is required.");
      return;
    }
    if (!name) {
      setFormError("Name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await addLocation({
        code,
        name,
        description: form.description.trim() || undefined,
        address: form.address.trim() || undefined,
        tags: parseTags(form.tags),
      });
      setFormSuccess(`Location "${code}" added.`);
      setForm(EMPTY_FORM);
      const updated = await listLocations();
      setLocations(updated);
      onRepositoryMutated();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSubmitting(false);
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
              {["Code", "Name", "Racks", "Address", "Description"].map((h) => (
                <th key={h} style={common.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => (
              <tr key={loc.id}>
                <td style={{ ...common.td, fontFamily: "monospace" }}>
                  {loc.code}
                </td>
                <td style={common.td}>{loc.name}</td>
                <td style={common.td}>{loc.rack_count}</td>
                <td style={common.td}>{loc.address ?? ""}</td>
                <td style={common.td}>{loc.description ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section style={styles.formSection}>
        <h3 style={common.h3}>Add Location</h3>
        <form onSubmit={handleSubmit} style={styles.form}>
          {field("Code", "code", "e.g. warsaw-serverroom-a", true)}
          {field("Name", "name", "e.g. Warsaw - Server Room A", true)}
          {field("Description", "description", "optional")}
          {field("Address", "address", "optional")}
          {field("Tags", "tags", "comma-separated, e.g. production, warsaw")}

          {formError && <div style={common.errorBox}>{formError}</div>}
          {formSuccess && <div style={styles.successBox}>{formSuccess}</div>}

          <button
            type="submit"
            style={common.btn}
            disabled={submitting}
          >
            {submitting ? "Adding…" : "Add location"}
          </button>
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
};
