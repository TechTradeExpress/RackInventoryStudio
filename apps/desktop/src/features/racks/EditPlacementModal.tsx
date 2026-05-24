import { useState, useEffect } from "react";
import {
  movePlacement,
  removePlacement,
  type PlacementDto,
  type RackSummaryDto,
} from "../../api/tauriClient";
import { useBusy } from "../../lib/appBusy";
import { Modal } from "../../components/ui/Modal";
import { Field } from "../../components/ui/Field";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { parsePositiveInt } from "./positiveInt";

export interface EditPlacementModalProps {
  open: boolean;
  placement: PlacementDto;
  rack: RackSummaryDto;
  side: "front" | "rear";
  onClose: () => void;
  onUpdated: (placementId: string) => void;
  onRemoved: () => void;
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function EditPlacementModal({
  open,
  placement,
  rack,
  side,
  onClose,
  onUpdated,
  onRemoved,
}: EditPlacementModalProps) {
  const { runBusy } = useBusy();

  const [startUStr, setStartUStr] = useState(String(placement.start_u));
  const [heightUStr, setHeightUStr] = useState(
    placement.height_u != null ? String(placement.height_u) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  // Reset form when the modal opens or placement changes
  useEffect(() => {
    if (open) {
      setStartUStr(String(placement.start_u));
      setHeightUStr(placement.height_u != null ? String(placement.height_u) : "");
      setError(null);
      setRemoveConfirmOpen(false);
    }
  }, [open, placement.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    const su = parsePositiveInt(startUStr);
    if (su === null) {
      setError("Start U must be a positive integer.");
      return;
    }
    // Validate height U override
    let newHeightU: number | null = null;
    if (heightUStr.trim() !== "") {
      const hu = parsePositiveInt(heightUStr);
      if (hu === null) {
        setError("Height U override must be a positive integer if provided.");
        return;
      }
      newHeightU = hu;
    }
    setError(null);
    try {
      await runBusy("Updating placement…", () =>
        movePlacement({
          placement_id: placement.id,
          new_rack_id: rack.id,
          new_side: side,
          new_start_u: su,
          new_height_u: newHeightU,
        }),
      );
      onUpdated(placement.id);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemove() {
    setRemoveConfirmOpen(false);
    try {
      await runBusy("Removing placement…", () =>
        removePlacement({ placement_id: placement.id }),
      );
      onRemoved();
      onClose();
    } catch (e) {
      setError(String(e));
    }
  }

  const typeLabel =
    placement.target_kind === "device"
      ? (placement.device_type ?? "Device")
      : placement.target_kind === "device_model"
        ? "Rack object"
        : "—";

  return (
    <>
      <ConfirmDialog
        open={removeConfirmOpen}
        title="Remove placement?"
        body={
          <p style={{ margin: 0, fontSize: 13 }}>
            Remove <strong>{placement.code}</strong> from rack{" "}
            <strong>{rack.code}</strong>? This is an in-memory change until Save
            is used.
          </p>
        }
        confirmLabel="Remove placement"
        tone="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveConfirmOpen(false)}
      />

      <Modal
        open={open}
        title="Edit placement"
        subtitle={placement.code}
        onClose={onClose}
        size="md"
        footerMessage={error ?? undefined}
        footerMessageTone={error ? "err" : undefined}
        footer={
          <>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setRemoveConfirmOpen(true)}
              style={{ marginRight: "auto" }}
              data-testid="remove-btn"
            >
              Remove placement…
            </button>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              data-testid="save-btn"
            >
              Save move
            </button>
          </>
        }
      >
        <div className="form-grid">
          {/* Read-only details */}
          <div style={{ gridColumn: "span 12" }}>
            <dl className="kv" style={{ marginBottom: 16 }}>
              <div style={{ display: "contents" }}>
                <dt>Rack</dt>
                <dd className="mono">{rack.code}</dd>
              </div>
              <div style={{ display: "contents" }}>
                <dt>Side</dt>
                <dd>{side === "front" ? "Front" : "Rear"}</dd>
              </div>
              <div style={{ display: "contents" }}>
                <dt>Target</dt>
                <dd>{display(placement.target_name ?? placement.target_code)}</dd>
              </div>
              <div style={{ display: "contents" }}>
                <dt>Type</dt>
                <dd>{typeLabel}</dd>
              </div>
              {placement.model_name && (
                <div style={{ display: "contents" }}>
                  <dt>Model</dt>
                  <dd className="mono">{placement.model_name}</dd>
                </div>
              )}
              <div style={{ display: "contents" }}>
                <dt>Eff. height</dt>
                <dd className="mono">
                  {placement.effective_height_u !== null
                    ? `${placement.effective_height_u}U`
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Editable start U */}
          <Field
            label="Start U"
            required
            help="Move the placement to a different U position on the same side."
            className="col-6"
          >
            <input
              className="ri-input"
              type="number"
              min={1}
              step={1}
              value={startUStr}
              onChange={(e) => {
                setStartUStr(e.target.value);
                setError(null);
              }}
              data-testid="start-u-input"
            />
          </Field>

          {/* Height U override */}
          <Field
            label="Height U override"
            help={
              placement.effective_height_u != null
                ? `Effective: ${placement.effective_height_u}U. Leave empty to use the default/effective height.`
                : "Leave empty to use the default/effective height."
            }
            className="col-6"
          >
            <input
              className="ri-input"
              type="number"
              min={1}
              step={1}
              placeholder="—"
              value={heightUStr}
              onChange={(e) => {
                setHeightUStr(e.target.value);
                setError(null);
              }}
              data-testid="height-u-input"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
