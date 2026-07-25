// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlacementInspectorPanel } from "./PlacementInspectorPanel";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";

const mockRemovePlacement = vi.hoisted(() => vi.fn());

vi.mock("../../api/tauriClient", () => ({
  removePlacement: mockRemovePlacement,
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

const FIXTURE_RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "datacenter-a",
  height_u: 42,
  row: "A",
  description: null,
  tags: [],
  front_placement_count: 1,
  rear_placement_count: 0,
  placement_count: 1,
  front_used_u: 2,
  rear_used_u: 0,
};

function makePlacement(overrides: Partial<PlacementDto> = {}): PlacementDto {
  return {
    id: "plc-1",
    code: "plc-test-001",
    target_kind: "device",
    target_id: "device-1",
    target_code: "srv-01",
    target_name: "Production Server",
    device_type: "server",
    start_u: 3,
    height_u: 2,
    effective_height_u: 2,
    end_u: 4,
    note: null,
    tags: [],
    model_name: "Dell R750",
    model_code: "dell-r750",
    target_serial: null,
    target_asset_tag: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Empty state ────────────────────────────────────────────────────────────────

describe("PlacementInspectorPanel — no selection", () => {
  it("shows empty state when no placement is selected", () => {
    render(
      <PlacementInspectorPanel
        placement={null}
        side={null}
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText(/No placement selected/)).toBeTruthy();
  });
});

// ── Remove from rack action ────────────────────────────────────────────────────

describe("PlacementInspectorPanel — Remove from rack", () => {
  it("renders Remove from rack button when placement is selected", () => {
    render(
      <PlacementInspectorPanel
        placement={makePlacement()}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    expect(screen.getByTestId("remove-from-rack-btn")).toBeTruthy();
    expect(screen.getByTestId("remove-from-rack-btn").textContent).toContain(
      "Remove from rack",
    );
  });

  it("Remove from rack button is not btn-danger (non-destructive styling)", () => {
    render(
      <PlacementInspectorPanel
        placement={makePlacement()}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    const btn = screen.getByTestId("remove-from-rack-btn");
    expect(btn.className).not.toContain("btn-danger");
  });

  it("clicking Remove from rack opens a confirm dialog", () => {
    render(
      <PlacementInspectorPanel
        placement={makePlacement()}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));
    // Confirm dialog body should clarify device is not deleted
    expect(screen.getByText(/returns to the unplaced list/)).toBeTruthy();
  });

  it("confirming calls removePlacement and onRemoveSuccess with the placement id", async () => {
    mockRemovePlacement.mockResolvedValue(undefined);
    const onRemoveSuccess = vi.fn();

    render(
      <PlacementInspectorPanel
        placement={makePlacement()}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={onRemoveSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));

    // Click the confirm button in the dialog (btn-danger distinguishes it from the trigger)
    const allBtns = await screen.findAllByRole("button", { name: "Remove from rack" });
    const confirmBtn = allBtns.find((b) => b.className.includes("btn-danger"))!;
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockRemovePlacement).toHaveBeenCalledWith({ placement_id: "plc-1" });
      // Must pass placement id so parent can update recency state
      expect(onRemoveSuccess).toHaveBeenCalledWith("plc-1");
      expect(onRemoveSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("cancelling does not call removePlacement", () => {
    render(
      <PlacementInspectorPanel
        placement={makePlacement()}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockRemovePlacement).not.toHaveBeenCalled();
  });
});

// ── Edit-target navigation buttons ──────────────────────────────────────────────
//
// Regression for a target_kind mismatch: PlacementDto.target_kind is only ever
// "device" or "device_model" (see PlacementTargetKind in crates/ris-core/src/
// placement.rs — there is no "rack_object" variant). Rack-object placements
// (placed straight from a Device Model with device_type "rack_object", with no
// separate Device record) get target_kind "device_model", the same value
// EditPlacementModal.tsx already checks for. edit-target-model-btn previously
// checked for target_kind === "rack_object", which never matches any real
// placement, so the button could never render.

describe("PlacementInspectorPanel — edit-target navigation buttons", () => {
  it("renders edit-target-device-btn for a device placement when onEditTargetDevice is provided", () => {
    const p = makePlacement({ target_kind: "device" });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
        onOpenEditModal={vi.fn()}
        onEditTargetDevice={vi.fn()}
        onEditTargetModel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("edit-target-device-btn")).toBeTruthy();
    expect(screen.queryByTestId("edit-target-model-btn")).toBeNull();
  });

  it("renders edit-target-model-btn for a device_model (rack-object) placement when onEditTargetModel is provided", () => {
    const p = makePlacement({
      target_kind: "device_model",
      target_id: "model-1",
      target_code: "model-pdu-01",
      target_name: "PDU 8-port",
      device_type: null,
    });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
        onOpenEditModal={vi.fn()}
        onEditTargetDevice={vi.fn()}
        onEditTargetModel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("edit-target-model-btn")).toBeTruthy();
    expect(screen.queryByTestId("edit-target-device-btn")).toBeNull();
  });

  it("invokes onEditTargetModel with the placement's target_id when edit-target-model-btn is clicked", () => {
    const onEditTargetModel = vi.fn();
    const p = makePlacement({ target_kind: "device_model", target_id: "model-42" });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
        onOpenEditModal={vi.fn()}
        onEditTargetModel={onEditTargetModel}
      />,
    );
    fireEvent.click(screen.getByTestId("edit-target-model-btn"));
    expect(onEditTargetModel).toHaveBeenCalledWith("model-42");
  });

  it("renders neither edit-target button when the corresponding callback prop is omitted", () => {
    const p = makePlacement({ target_kind: "device_model", target_id: "model-1" });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
        onOpenEditModal={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("edit-target-model-btn")).toBeNull();
    expect(screen.queryByTestId("edit-target-device-btn")).toBeNull();
  });
});

// ── Code-leakage regression ────────────────────────────────────────────────────

describe("PlacementInspectorPanel — code leakage regression", () => {
  it("does not render target_code or placement code in the confirm dialog", () => {
    const p = makePlacement({
      code: "plc-secret-code-xyz",
      target_code: "device-secret-code-123",
      target_name: "Known Server",
    });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));
    const dialog = document.body;
    expect(dialog.textContent).not.toContain("plc-secret-code-xyz");
    expect(dialog.textContent).not.toContain("device-secret-code-123");
    expect(dialog.textContent).toContain("Known Server");
  });

  it("shows 'Unnamed device' fallback in confirm dialog when device has no name", () => {
    const p = makePlacement({
      code: "plc-secret-code-xyz",
      target_code: "device-secret-code-123",
      target_name: null,
      target_kind: "device",
    });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));
    const dialog = document.body;
    expect(dialog.textContent).toContain("Unnamed device");
    expect(dialog.textContent).not.toContain("plc-secret-code-xyz");
    expect(dialog.textContent).not.toContain("device-secret-code-123");
  });

  it("shows 'Unnamed object' fallback for non-device placement with no name", () => {
    const p = makePlacement({
      code: "plc-secret-code-xyz",
      target_code: "model-secret-code-456",
      target_name: null,
      target_kind: "device_model",
    });
    render(
      <PlacementInspectorPanel
        placement={p}
        side="Front"
        currentRack={FIXTURE_RACK}
        onMoveSuccess={vi.fn()}
        onRemoveSuccess={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("remove-from-rack-btn"));
    const dialog = document.body;
    expect(dialog.textContent).toContain("Unnamed object");
    expect(dialog.textContent).not.toContain("model-secret-code-456");
  });
});
