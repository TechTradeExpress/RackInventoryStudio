import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";
import { listRacks, movePlacement, removePlacement } from "../../api/tauriClient";
import { common } from "../../lib/styles";
import { parsePositiveInt } from "./positiveInt";

interface Props {
  placement: PlacementDto | null;
  side: "Front" | "Rear" | null;
  currentRack: RackSummaryDto;
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

export function PlacementInspectorPanel({
  placement,
  side,
  currentRack,
  onMoveSuccess,
  onRemoveSuccess,
}: Props) {
  const [newRackId, setNewRackId] = useState(currentRack.id);
  const [newSide, setNewSide] = useState<"front" | "rear">("front");
  const [newStartU, setNewStartU] = useState("");
  const [newHeightU, setNewHeightU] = useState("");
  const [working, setWorking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSuccessMsg, setMoveSuccessMsg] = useState<string | null>(null);
  const [removeWorking, setRemoveWorking] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [racks, setRacks] = useState<RackSummaryDto[]>([]);
  const [racksLoading, setRacksLoading] = useState(false);
  const [racksError, setRacksError] = useState<string | null>(null);

  // Load rack list once when the component mounts.
  useEffect(() => {
    setRacksLoading(true);
    setRacksError(null);
    listRacks()
      .then(setRacks)
      .catch((e) => setRacksError(String(e)))
      .finally(() => setRacksLoading(false));
  }, []);

  // Reset move form when the selected placement changes.
  useEffect(() => {
    if (placement) {
      setNewStartU(String(placement.start_u));
      setNewHeightU(
        placement.height_u !== null ? String(placement.height_u) : "",
      );
      setNewRackId(currentRack.id);
      setNewSide((side?.toLowerCase() as "front" | "rear") ?? "front");
    } else {
      setNewStartU("");
      setNewHeightU("");
    }
    setMoveError(null);
    setMoveSuccessMsg(null);
    setRemoveError(null);
  }, [placement?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!newRackId) {
      return "Destination rack is required.";
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
    setMoveSuccessMsg(null);
    try {
      await movePlacement({
        placement_id: placement.id,
        new_rack_id: newRackId,
        new_side: newSide,
        new_start_u: startU,
        new_height_u: heightU,
      });
      const crossRack = newRackId !== currentRack.id;
      setMoveSuccessMsg(
        crossRack
          ? "Moved to another rack in memory. Use Save to persist changes."
          : "Moved in memory. Use Save to persist changes.",
      );
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

  const moveDisabled = working || racksLoading;

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
          Move placement
        </p>
        {racksError && (
          <div
            style={{
              marginBottom: "0.4rem",
              padding: "0.25rem 0.5rem",
              background: "#fff0f0",
              border: "1px solid #f88",
              color: "#b00",
              borderRadius: 3,
              fontSize: "0.78rem",
            }}
          >
            Failed to load racks: {racksError}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div
            style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1, minWidth: "160px" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>Rack</span>
              <select
                value={newRackId}
                onChange={(e) => {
                  setNewRackId(e.target.value);
                  setMoveError(null);
                  setMoveSuccessMsg(null);
                }}
                disabled={moveDisabled}
                style={{ ...common.input, width: "100%" }}
              >
                {racksLoading && <option value="">Loading…</option>}
                {racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}{r.name ? ` — ${r.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>Side</span>
              <select
                value={newSide}
                onChange={(e) => {
                  setNewSide(e.target.value as "front" | "rear");
                  setMoveError(null);
                  setMoveSuccessMsg(null);
                }}
                disabled={moveDisabled}
                style={{ ...common.input, width: "80px" }}
              >
                <option value="front">Front</option>
                <option value="rear">Rear</option>
              </select>
            </label>
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
                  setMoveSuccessMsg(null);
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
                  setMoveSuccessMsg(null);
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
              disabled={moveDisabled}
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
        {moveSuccessMsg && (
          <p
            style={{
              marginTop: "0.4rem",
              fontSize: "0.78rem",
              color: "#2a7a2a",
            }}
          >
            {moveSuccessMsg}
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
