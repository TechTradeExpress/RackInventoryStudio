import { useEffect, useState } from "react";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";
import { listRacks, movePlacement, removePlacement } from "../../api/tauriClient";
import { parsePositiveInt } from "./positiveInt";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { IcServer } from "../../components/ui/Icon";

interface Props {
  placement: PlacementDto | null;
  side: "Front" | "Rear" | null;
  currentRack: RackSummaryDto;
  onMoveSuccess: (
    placementId: string,
    options?: { movedToAnotherRack?: boolean; destRackId?: string },
  ) => void;
  onRemoveSuccess: () => void;
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
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

  // Change side confirmation dialog
  const [changeSideOpen, setChangeSideOpen] = useState(false);
  const [changeSideWorking, setChangeSideWorking] = useState(false);
  const [changeSideError, setChangeSideError] = useState<string | null>(null);

  // Remove confirmation dialog
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  useEffect(() => {
    setRacksLoading(true);
    setRacksError(null);
    listRacks()
      .then(setRacks)
      .catch((e) => setRacksError(String(e)))
      .finally(() => setRacksLoading(false));
  }, []);

  useEffect(() => {
    if (placement) {
      setNewStartU(String(placement.start_u));
      setNewHeightU(placement.height_u !== null ? String(placement.height_u) : "");
      setNewRackId(currentRack.id);
    } else {
      setNewStartU("");
      setNewHeightU("");
    }
    setMoveError(null);
    setMoveSuccessMsg(null);
    setRemoveError(null);
    setChangeSideError(null);
    setChangeSideOpen(false);
    setRemoveConfirmOpen(false);
  }, [placement?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!placement) {
    return (
      <EmptyState
        icon={<IcServer size={24} />}
        title="No placement selected"
        body="Click a unit in the diagram or a row in the placement table."
      />
    );
  }

  const currentSide = (side?.toLowerCase() ?? "front") as "front" | "rear";
  const otherSide = currentSide === "front" ? "rear" : "front";
  const otherSideLabel = otherSide === "front" ? "Front" : "Rear";

  const rows: [string, string | number | null | undefined, boolean?][] = [
    ["Code",            placement.code,                  true],
    ["Side",            side,                            false],
    ["Target kind",     placement.target_kind,           false],
    ["Target code",     placement.target_code,           true],
    ["Target name",     placement.target_name,           false],
    ["Device type",     placement.device_type,           false],
    ["Start U",         placement.start_u,               true],
    ["End U",           placement.end_u,                 true],
    ["Height U",        placement.height_u,              true],
    ["Eff. height U",   placement.effective_height_u,    true],
    ["Note",            placement.note,                  false],
    ["Tags",            placement.tags.length > 0 ? placement.tags.join(", ") : null, false],
  ];

  function validateForm(): string | null {
    if (parsePositiveInt(newStartU) === null) return "New start U must be a positive integer.";
    if (newHeightU.trim() !== "" && parsePositiveInt(newHeightU) === null) {
      return "Height U override must be a positive integer if provided.";
    }
    if (!newRackId) return "Destination rack is required.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!placement) return;
    const err = validateForm();
    if (err) { setMoveError(err); return; }
    const startU = parsePositiveInt(newStartU)!;
    const heightU = newHeightU.trim() !== "" ? parsePositiveInt(newHeightU) : null;

    setWorking(true);
    setMoveError(null);
    setMoveSuccessMsg(null);
    try {
      await movePlacement({
        placement_id: placement.id,
        new_rack_id: newRackId,
        new_side: currentSide,
        new_start_u: startU,
        new_height_u: heightU,
      });
      const crossRack = newRackId !== currentRack.id;
      if (!crossRack) setMoveSuccessMsg("Moved in memory. Use Save to persist changes.");
      onMoveSuccess(placement.id, {
        movedToAnotherRack: crossRack,
        destRackId: crossRack ? newRackId : undefined,
      });
    } catch (e) {
      setMoveError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleChangeSideConfirm() {
    if (!placement) return;
    setChangeSideWorking(true);
    setChangeSideError(null);
    try {
      await movePlacement({
        placement_id: placement.id,
        new_rack_id: currentRack.id,
        new_side: otherSide,
        new_start_u: placement.start_u,
        new_height_u: placement.height_u,
      });
      setChangeSideOpen(false);
      onMoveSuccess(placement.id);
    } catch (e) {
      setChangeSideError(String(e));
    } finally {
      setChangeSideWorking(false);
    }
  }

  async function executeRemove() {
    if (!placement) return;
    setRemoveConfirmOpen(false);
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
    <>
      <ConfirmDialog
        open={removeConfirmOpen}
        title="Remove placement?"
        body={
          <p style={{ margin: 0, fontSize: 13 }}>
            Remove <strong>{placement.code}</strong> from this rack?
            This is an in-memory change until Save is used.
          </p>
        }
        confirmLabel="Remove placement"
        tone="danger"
        onConfirm={executeRemove}
        onCancel={() => setRemoveConfirmOpen(false)}
      />

      <ConfirmDialog
        open={changeSideOpen}
        title={`Move to ${otherSideLabel}?`}
        body={
          <p style={{ margin: 0, fontSize: 13 }}>
            Move <strong>{placement.code}</strong> from <strong>{side}</strong> to{" "}
            <strong>{otherSideLabel}</strong>? It will keep its current U position (U{placement.start_u}).
            This is an in-memory change until Save is used.
            {changeSideError && (
              <span style={{ display: "block", marginTop: 8, color: "var(--st-err-tx)" }}>
                {changeSideError}
              </span>
            )}
          </p>
        }
        confirmLabel={changeSideWorking ? "Moving…" : `Move to ${otherSideLabel}`}
        onConfirm={handleChangeSideConfirm}
        onCancel={() => { setChangeSideOpen(false); setChangeSideError(null); }}
      />

      <div className="stack-3">
        {/* Detail KV list */}
        <dl className="kv">
          {rows.map(([label, value, mono]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd className={mono ? "mono" : undefined}>{display(value)}</dd>
            </div>
          ))}
        </dl>

        <div className="hr" style={{ margin: 0 }} />

        {/* Move within same side */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Move placement <span style={{ color: "var(--tx-3)", fontWeight: 400 }}>(same side)</span>
          </div>
          {racksError && <Banner tone="err">Failed to load racks: {racksError}</Banner>}
          <form onSubmit={handleSubmit} className="stack-3">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
                <span style={{ fontSize: 11, color: "var(--tx-3)" }}>Rack</span>
                <select
                  className="ri-input"
                  value={newRackId}
                  onChange={(e) => { setNewRackId(e.target.value); setMoveError(null); setMoveSuccessMsg(null); }}
                  disabled={moveDisabled}
                >
                  {racksLoading && <option value="">Loading…</option>}
                  {racks.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code}{r.name ? ` — ${r.name}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--tx-3)" }}>Start U</span>
                <input
                  className="ri-input"
                  type="number" min={1} step={1}
                  style={{ width: 72 }}
                  value={newStartU}
                  onChange={(e) => { setNewStartU(e.target.value); setMoveError(null); setMoveSuccessMsg(null); }}
                  disabled={working}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--tx-3)" }}>Height U <span style={{ color: "var(--tx-4)" }}>(opt)</span></span>
                <input
                  className="ri-input"
                  type="number" min={1} step={1} placeholder="—"
                  style={{ width: 72 }}
                  value={newHeightU}
                  onChange={(e) => { setNewHeightU(e.target.value); setMoveError(null); setMoveSuccessMsg(null); }}
                  disabled={working}
                />
              </label>
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary btn-sm" disabled={moveDisabled}>
                {working ? "Moving…" : "Save move"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => { setMoveError(null); setMoveSuccessMsg(null); }}>
                Reset
              </button>
            </div>
            {moveError && <Banner tone="err">{moveError}</Banner>}
            {moveSuccessMsg && <Banner tone="ok">{moveSuccessMsg}</Banner>}
          </form>
        </div>

        <div className="hr" style={{ margin: 0 }} />

        {/* Change side */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Change side</div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setChangeSideError(null); setChangeSideOpen(true); }}
            disabled={working || changeSideWorking}
          >
            Move to {otherSideLabel}…
          </button>
        </div>

        <div className="hr" style={{ margin: 0 }} />

        {/* Remove */}
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Remove placement</div>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setRemoveConfirmOpen(true)}
            disabled={removeWorking}
          >
            {removeWorking ? "Removing…" : "Remove placement"}
          </button>
          {removeError && (
            <div style={{ marginTop: 6 }}>
              <Banner tone="err">{removeError}</Banner>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
