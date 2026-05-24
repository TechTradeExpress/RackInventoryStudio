import { useState } from "react";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";
import { movePlacement, removePlacement } from "../../api/tauriClient";
import { useBusy } from "../../lib/appBusy";
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
  /** Called when the user clicks "Edit in modal" — opens EditPlacementModal. */
  onOpenEditModal?: () => void;
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
  onOpenEditModal,
}: Props) {
  const { runBusy } = useBusy();

  // Change side confirmation dialog
  const [changeSideOpen, setChangeSideOpen] = useState(false);
  const [changeSideError, setChangeSideError] = useState<string | null>(null);

  // Remove confirmation dialog
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

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

  async function handleChangeSideConfirm() {
    if (!placement) return;
    setChangeSideError(null);
    try {
      await runBusy(`Moving to ${otherSideLabel}…`, () =>
        movePlacement({
          placement_id: placement.id,
          new_rack_id: currentRack.id,
          new_side: otherSide,
          new_start_u: placement.start_u,
          new_height_u: placement.height_u,
        }),
      );
      setChangeSideOpen(false);
      onMoveSuccess(placement.id);
    } catch (e) {
      setChangeSideError(String(e));
    }
  }

  async function executeRemove() {
    if (!placement) return;
    setRemoveConfirmOpen(false);
    setRemoveError(null);
    try {
      await runBusy("Removing placement…", () =>
        removePlacement({ placement_id: placement.id }),
      );
      onRemoveSuccess();
    } catch (e) {
      setRemoveError(String(e));
    }
  }

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
        confirmLabel={`Move to ${otherSideLabel}`}
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

        {/* Action buttons */}
        <div className="stack-3">
          {onOpenEditModal && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Edit / move</div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={onOpenEditModal}
                data-testid="open-edit-modal-btn"
              >
                Edit placement…
              </button>
            </div>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Change side</div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setChangeSideError(null); setChangeSideOpen(true); }}
            >
              Move to {otherSideLabel}…
            </button>
          </div>

          <div className="hr" style={{ margin: 0 }} />

          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Remove placement</div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setRemoveConfirmOpen(true)}
            >
              Remove placement…
            </button>
            {removeError && (
              <div style={{ marginTop: 6 }}>
                <Banner tone="err">{removeError}</Banner>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
