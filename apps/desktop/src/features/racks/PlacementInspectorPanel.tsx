import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { PlacementDto } from "../../api/tauriClient";
import { movePlacement, removePlacement } from "../../api/tauriClient";
import { common } from "../../lib/styles";

interface Props {
  placement: PlacementDto | null;
  side: "Front" | "Rear" | null;
  onMoveSuccess: (placementId: string) => void;
  onRemoveSuccess: () => void;
}

const NULL_DISPLAY = "—";

const tdLabel: CSSProperties = {
  padding: "0.2rem 0.5rem",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #e0e8f0",
  width: "45%",
  verticalAlign: "top",
};

const tdValue: CSSProperties = {
  padding: "0.2rem 0.5rem",
  fontFamily: "monospace",
  borderBottom: "1px solid #e0e8f0",
  wordBreak: "break-all",
};

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NULL_DISPLAY;
  return String(value);
}

function parsePositiveInt(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (isNaN(n) || n < 1 || String(n) !== trimmed) return null;
  return n;
}

export function PlacementInspectorPanel({ placement, side, onMoveSuccess, onRemoveSuccess }: Props) {
  const [newStartU, setNewStartU] = useState("");
  const [newHeightU, setNewHeightU] = useState("");
  const [working, setWorking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSuccess, setMoveSuccess] = useState(false);
  const [removeWorking, setRemoveWorking] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Reset form when the selected placement changes
  useEffect(() => {
    if (placement) {
      setNewStartU(String(placement.start_u));
      setNewHeightU(
        placement.height_u !== null ? String(placement.height_u) : "",
      );
    } else {
      setNewStartU("");
      setNewHeightU("");
    }
    setMoveError(null);
    setMoveSuccess(false);
    setRemoveError(null);
  }, [placement?.id]);

  if (!placement) {
    return (
      <div
        style={{
          padding: "0.6rem 0.75rem",
          background: "#f8f8f8",
          border: "1px solid #e0e0e0",
          borderRadius: 3,
          fontSize: "0.82rem",
          color: "#888",
        }}
      >
        No placement selected. Click a cell in the diagram or a row in the
        tables below.
      </div>
    );
  }

  const rows: [string, string | number | null | undefined][] = [
    ["Code", placement.code],
    ["Side", side],
    ["Target kind", placement.target_kind],
    ["Target code", placement.target_code],
    ["Target name", placement.target_name],
    ["Target ID", placement.target_id],
    ["Device type", placement.device_type],
    ["Start U", placement.start_u],
    ["End U", placement.end_u],
    ["Height U (explicit)", placement.height_u],
    ["Height U (effective)", placement.effective_height_u],
    ["Note", placement.note],
    [
      "Tags",
      placement.tags.length > 0 ? placement.tags.join(", ") : null,
    ],
  ];

  function validateForm(): string | null {
    const startU = parsePositiveInt(newStartU);
    if (startU === null) {
      return "New start U must be a positive integer.";
    }
    if (newHeightU.trim() !== "" && parsePositiveInt(newHeightU) === null) {
      return "Height U override must be a positive integer if provided.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placement) return;
    const err = validateForm();
    if (err) {
      setMoveError(err);
      return;
    }
    const startU = parsePositiveInt(newStartU)!;
    const heightU =
      newHeightU.trim() !== "" ? parsePositiveInt(newHeightU) : null;

    setWorking(true);
    setMoveError(null);
    setMoveSuccess(false);
    try {
      await movePlacement({
        placement_id: placement.id,
        new_start_u: startU,
        new_height_u: heightU,
      });
      setMoveSuccess(true);
      onMoveSuccess(placement.id);
    } catch (e) {
      setMoveError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleRemove() {
    if (!placement) return;
    const confirmed = window.confirm(
      `Remove placement ${placement.code} from this rack? This change is in memory until Save is used.`,
    );
    if (!confirmed) return;
    setRemoveWorking(true);
    setRemoveError(null);
    try {
      await removePlacement({ placement_id: placement.id });
      onRemoveSuccess();
    } catch (e) {
      setRemoveError(String(e));
    } finally {
      setRemoveWorking(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #c5d5e8",
        borderRadius: 3,
        background: "#f0f5fb",
        fontSize: "0.82rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.35rem 0.6rem",
          background: "#d8e6f5",
          borderBottom: "1px solid #c5d5e8",
          fontWeight: "bold",
          fontSize: "0.8rem",
        }}
      >
        Placement Inspector —{" "}
        <span style={{ fontFamily: "monospace" }}>{placement.code}</span>
      </div>

      {/* Detail table */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={tdLabel}>{label}</td>
              <td style={tdValue}>{display(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Move form */}
      <div
        style={{
          padding: "0.6rem 0.75rem",
          borderTop: "1px solid #c5d5e8",
          background: "#e8f0fb",
        }}
      >
        <p
          style={{
            margin: "0 0 0.4rem",
            fontWeight: "bold",
            fontSize: "0.8rem",
          }}
        >
          Move placement (same side)
        </p>
        <form onSubmit={handleSubmit}>
          <div
            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>
                New start U
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={newStartU}
                onChange={(e) => {
                  setNewStartU(e.target.value);
                  setMoveError(null);
                  setMoveSuccess(false);
                }}
                disabled={working}
                style={{
                  ...common.input,
                  width: "90px",
                  flex: "none",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>
                Height U override{" "}
                <span style={{ color: "#888" }}>(optional)</span>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="—"
                value={newHeightU}
                onChange={(e) => {
                  setNewHeightU(e.target.value);
                  setMoveError(null);
                  setMoveSuccess(false);
                }}
                disabled={working}
                style={{
                  ...common.input,
                  width: "90px",
                  flex: "none",
                }}
              />
            </label>
            <button
              type="submit"
              disabled={working}
              style={{ ...common.btn, alignSelf: "flex-end" }}
            >
              {working ? "Moving…" : "Move"}
            </button>
          </div>
        </form>

        {moveError && (
          <div
            style={{
              marginTop: "0.4rem",
              padding: "0.3rem 0.5rem",
              background: "#fff0f0",
              border: "1px solid #f88",
              color: "#b00",
              borderRadius: 3,
              fontSize: "0.78rem",
            }}
          >
            {moveError}
          </div>
        )}
        {moveSuccess && (
          <p
            style={{
              marginTop: "0.4rem",
              fontSize: "0.78rem",
              color: "#2a7a2a",
            }}
          >
            Moved in memory. Use Save to persist changes.
          </p>
        )}
      </div>

      {/* Remove section */}
      <div
        style={{
          padding: "0.6rem 0.75rem",
          borderTop: "1px solid #c5d5e8",
          background: "#fdf0f0",
        }}
      >
        <p
          style={{
            margin: "0 0 0.4rem",
            fontWeight: "bold",
            fontSize: "0.8rem",
          }}
        >
          Remove placement
        </p>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removeWorking}
          style={{
            ...common.btn,
            background: "#c0392b",
            color: "#fff",
            border: "1px solid #a93226",
          }}
        >
          {removeWorking ? "Removing…" : "Remove placement"}
        </button>
        {removeError && (
          <div
            style={{
              marginTop: "0.4rem",
              padding: "0.3rem 0.5rem",
              background: "#fff0f0",
              border: "1px solid #f88",
              color: "#b00",
              borderRadius: 3,
              fontSize: "0.78rem",
            }}
          >
            {removeError}
          </div>
        )}
      </div>
    </div>
  );
}
