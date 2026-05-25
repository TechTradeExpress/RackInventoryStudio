import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { EditPlacementModal } from "./EditPlacementModal";
import type { PlacementDto, RackSummaryDto } from "../../api/tauriClient";

// Mock busy context — runBusy just calls the fn directly
vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

vi.mock("../../api/tauriClient", () => ({
  movePlacement: vi.fn(),
  removePlacement: vi.fn(),
}));

import { movePlacement, removePlacement } from "../../api/tauriClient";
const mockMovePlacement = vi.mocked(movePlacement);
const mockRemovePlacement = vi.mocked(removePlacement);

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

const FIXTURE_PLACEMENT: PlacementDto = {
  id: "plc-1",
  code: "plc-srv-01",
  target_kind: "device",
  target_id: "dev-1",
  target_code: "srv-01",
  target_name: "Server 01",
  device_type: "server",
  start_u: 10,
  height_u: null,
  effective_height_u: 1,
  end_u: 10,
  note: null,
  tags: [],
  model_name: "Server Model",
  model_code: "srv-model",
  target_serial: "SRV001",
  target_asset_tag: null,
};

const BASE_PROPS = {
  open: true,
  placement: FIXTURE_PLACEMENT,
  rack: FIXTURE_RACK,
  side: "front" as const,
  onClose: vi.fn(),
  onUpdated: vi.fn(),
  onRemoved: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockMovePlacement.mockResolvedValue(undefined);
  mockRemovePlacement.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditPlacementModal — closed", () => {
  it("does not render when open=false", () => {
    render(<EditPlacementModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("EditPlacementModal — open", () => {
  it("renders existing placement data", () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    expect(screen.getByText("Edit placement")).toBeTruthy();
    expect(screen.getByText("plc-srv-01")).toBeTruthy();
    expect(screen.getByText("Server 01")).toBeTruthy();
    expect(screen.getByText("server")).toBeTruthy();
  });

  it("pre-fills start U with current placement value", () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("10");
  });

  it("calls movePlacement with updated start U on Save", async () => {
    const onUpdated = vi.fn();
    const onClose = vi.fn();
    render(<EditPlacementModal {...BASE_PROPS} onUpdated={onUpdated} onClose={onClose} />);

    fireEvent.change(screen.getByTestId("start-u-input"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(mockMovePlacement).toHaveBeenCalledWith({
        placement_id: "plc-1",
        new_rack_id: "rack-1",
        new_side: "front",
        new_start_u: 15,
        new_height_u: null,
      });
      expect(onUpdated).toHaveBeenCalledWith("plc-1");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows validation error when start U is invalid", async () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("start-u-input"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Start U must be a positive integer/)).toBeTruthy();
    });
    expect(mockMovePlacement).not.toHaveBeenCalled();
  });

  it("shows error in footer when backend rejects movePlacement", async () => {
    mockMovePlacement.mockRejectedValueOnce(new Error("Slot conflict at U15"));
    render(<EditPlacementModal {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("start-u-input"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));
    await waitFor(() => {
      expect(screen.getByText(/Slot conflict at U15/)).toBeTruthy();
    });
  });

  it("Remove button opens ConfirmDialog", () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId("remove-btn"));
    // ConfirmDialog should appear
    expect(screen.getByRole("dialog", { name: /Remove placement\?/i })).toBeTruthy();
  });

  it("Cancel in ConfirmDialog does not call removePlacement", async () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId("remove-btn"));
    // click Cancel inside the confirm dialog
    const cancelBtns = screen.getAllByText("Cancel");
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    await waitFor(() => {
      expect(mockRemovePlacement).not.toHaveBeenCalled();
    });
  });

  it("calls removePlacement and onRemoved after confirm", async () => {
    const onRemoved = vi.fn();
    const onClose = vi.fn();
    render(<EditPlacementModal {...BASE_PROPS} onRemoved={onRemoved} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("remove-btn"));
    // Confirm
    fireEvent.click(screen.getByText("Remove placement"));
    await waitFor(() => {
      expect(mockRemovePlacement).toHaveBeenCalledWith({ placement_id: "plc-1" });
      expect(onRemoved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<EditPlacementModal {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("resets form when reopened with a different placement", () => {
    const otherPlacement: PlacementDto = {
      ...FIXTURE_PLACEMENT,
      id: "plc-2",
      code: "plc-srv-02",
      start_u: 20,
    };
    const { rerender } = render(<EditPlacementModal {...BASE_PROPS} />);
    rerender(<EditPlacementModal {...BASE_PROPS} placement={otherPlacement} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("20");
  });
});

describe("EditPlacementModal — Height U override", () => {
  it("renders empty Height U override when placement.height_u is null", () => {
    render(<EditPlacementModal {...BASE_PROPS} />);
    const input = screen.getByTestId("height-u-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("renders existing override value when placement.height_u is set to 3", () => {
    const placementWithHeight: PlacementDto = { ...FIXTURE_PLACEMENT, height_u: 3 };
    render(<EditPlacementModal {...BASE_PROPS} placement={placementWithHeight} />);
    const input = screen.getByTestId("height-u-input") as HTMLInputElement;
    expect(input.value).toBe("3");
  });

  it("calls movePlacement with new_height_u: 2 when override is set to '2'", async () => {
    const onUpdated = vi.fn();
    render(<EditPlacementModal {...BASE_PROPS} onUpdated={onUpdated} />);

    fireEvent.change(screen.getByTestId("height-u-input"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(mockMovePlacement).toHaveBeenCalledWith(
        expect.objectContaining({
          new_height_u: 2,
        }),
      );
    });
  });

  it("calls movePlacement with new_height_u: null when override is cleared", async () => {
    const placementWithHeight: PlacementDto = { ...FIXTURE_PLACEMENT, height_u: 3 };
    const onUpdated = vi.fn();
    render(
      <EditPlacementModal {...BASE_PROPS} placement={placementWithHeight} onUpdated={onUpdated} />,
    );

    // Clear the existing override
    fireEvent.change(screen.getByTestId("height-u-input"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(mockMovePlacement).toHaveBeenCalledWith(
        expect.objectContaining({
          new_height_u: null,
        }),
      );
    });
  });

  it("shows validation error and does not call movePlacement when override is '-1' (negative)", async () => {
    render(<EditPlacementModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("height-u-input"), {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Height U override must be a positive integer/)).toBeTruthy();
    });
    expect(mockMovePlacement).not.toHaveBeenCalled();
  });

  it("shows validation error and does not call movePlacement when override is '0'", async () => {
    render(<EditPlacementModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("height-u-input"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Height U override must be a positive integer/)).toBeTruthy();
    });
    expect(mockMovePlacement).not.toHaveBeenCalled();
  });
});
