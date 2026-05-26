import { useState } from "react";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";
import { removePlacement } from "../../api/tauriClient";
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
  /** Called when the user requests to edit the target device. */
  onEditTargetDevice?: (deviceId: string) => void;
  /** Called when the user requests to edit the target rack object model. */
  onEditTargetModel?: (modelId: string) => void;
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
  onEditTargetDevice,
  onEditTargetModel,
}: Props) {
  const { runBusy } = useBusy();

  // Remove confirmation dialog
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (!placement) {
    return (
      <EmptyState
        icon={<IcServer size={24} />}
        title="No placement selected"
        body="Click an occupied slot in the diagram to inspect it."
      />
    );
  }

  const rows: [string, string | number | null | undefined, boolean?][] = [
    ["Code",            placement.code,                  true],
    ["Side",            side,                            false],
    ["Target type",     placement.target_kind,           false],
    ["Target code",     placement.target_code,           true],
    ["Target name",     placement.target_name,           false],
    ["Device type",     placement.device_type,           false],
    ["Start U",         placement.start_u,               true],
    ["End U",           placement.end_u,                 true],
    ["Height",          placement.height_u,              true],
    ["Effective height", placement.effective_height_u,  true],
    ["Note",            placement.note,                  false],
    ["Tags",            placement.tags.length > 0 ? placement.tags.join(", ") : null, false],
  ];

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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={onOpenEditModal}
                  data-testid="open-edit-modal-btn"
                >
                  Edit placement…
                </button>
                {placement.target_kind === "device" && onEditTargetDevice && placement.target_id && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onEditTargetDevice(placement.target_id!)}
                    data-testid="edit-target-device-btn"
                  >
                    Edit device…
                  </button>
                )}
                {placement.target_kind === "rack_object" && onEditTargetModel && placement.target_id && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onEditTargetModel(placement.target_id!)}
                    data-testid="edit-target-model-btn"
                  >
                    Edit rack object…
                  </button>
                )}
              </div>
            </div>
          )}

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
