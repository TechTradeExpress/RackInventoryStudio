import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RackUnitDiagram } from "./RackUnitDiagram";
import { setActiveDragPayload } from "./dndHelpers";
import type { PlacementDto } from "../../api/tauriClient";

function makePlacement(overrides: Partial<PlacementDto> & { id: string }): PlacementDto {
  return {
    code: "plc-test",
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
    target_serial: "SN-12345",
    target_asset_tag: null,
    ...overrides,
  };
}

const BASE_PROPS = {
  heightU: 10,
  front: [] as PlacementDto[],
  rear: [] as PlacementDto[],
  side: "front" as const,
  selectedPlacementId: null,
  onSelectPlacement: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Column layout ──────────────────────────────────────────────────────────────

describe("RackUnitDiagram — column layout", () => {
  it('has a "Name" column header', () => {
    render(<RackUnitDiagram {...BASE_PROPS} />);
    expect(screen.getByTestId("diagram-col-name").textContent?.trim()).toBe("Name");
  });

  it('has "Model" and "Serial" column headers', () => {
    render(<RackUnitDiagram {...BASE_PROPS} />);
    expect(screen.getByTestId("diagram-col-model").textContent?.trim()).toBe("Model");
    expect(screen.getByTestId("diagram-col-code").textContent?.trim()).toBe("Serial");
  });

  it('has an "Asset tag" column header', () => {
    render(<RackUnitDiagram {...BASE_PROPS} />);
    expect(screen.getByTestId("diagram-col-asset").textContent?.trim()).toBe("Asset tag");
  });

  it('does not render "Type", "U range", or "St." as column headers', () => {
    const { container } = render(<RackUnitDiagram {...BASE_PROPS} />);
    const headerEl = container.querySelector('[aria-label="Rack diagram header"]')!;
    const columnTexts = Array.from(headerEl.children).map((c) => c.textContent?.trim());
    expect(columnTexts).not.toContain("Type");
    expect(columnTexts).not.toContain("U range");
    expect(columnTexts).not.toContain("St.");
  });

  it('does not have "Front" or "Rear" as a data-column header', () => {
    const { container } = render(<RackUnitDiagram {...BASE_PROPS} />);
    const headerEl = container.querySelector('[aria-label="Rack diagram header"]')!;
    const columnTexts = Array.from(headerEl.children).map((c) => c.textContent?.trim());
    expect(columnTexts).not.toContain("Front");
    expect(columnTexts).not.toContain("Rear");
  });

  it("shows side context in hint text, not as column header", () => {
    render(<RackUnitDiagram {...BASE_PROPS} side="front" />);
    expect(screen.getByText(/Front side/)).toBeTruthy();
  });
});

// ── U gutter (rack-unit numbering) ─────────────────────────────────────────────
// The U column is rack structure — each rack unit gets its own independent cell.
// It does not carry selection styling or drag handles.

describe("RackUnitDiagram — U gutter (rack unit numbering)", () => {
  it("shows a U gutter cell for each rack unit position", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    for (let u = 1; u <= 5; u++) {
      expect(screen.getByTestId(`u-cell-front-${u}`).textContent).toContain(`U${u}`);
    }
  });

  it("shows separate individual U gutter cells for a multi-U placement, not a merged range", () => {
    const p = makePlacement({ id: "p2", start_u: 5, end_u: 7, effective_height_u: 3, height_u: 3 });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} heightU={42} />);
    // Each rack unit has its own gutter cell
    expect(screen.getByTestId("u-cell-front-7").textContent).toContain("U7");
    expect(screen.getByTestId("u-cell-front-6").textContent).toContain("U6");
    expect(screen.getByTestId("u-cell-front-5").textContent).toContain("U5");
    // No merged range notation in any U gutter cell
    for (const u of [5, 6, 7]) {
      expect(screen.getByTestId(`u-cell-front-${u}`).textContent).not.toContain("–");
    }
  });

  it("U gutter shows correct label for an occupied unit", () => {
    const p = makePlacement({ id: "p1", start_u: 10, end_u: 10, effective_height_u: 1, height_u: 1 });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} heightU={42} />);
    expect(screen.getByTestId("u-cell-front-10").textContent).toContain("U10");
  });

  it("U gutter shows correct label for an empty unit", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    expect(screen.getByTestId("u-cell-front-3").textContent).toContain("U3");
  });
});

// ── Occupied placement card ────────────────────────────────────────────────────

describe("RackUnitDiagram — occupied placement card", () => {
  // PLACEMENT occupies U3–U4 (2U); the content card has testid placed-front-placement-1
  const PLACEMENT = makePlacement({ id: "placement-1", start_u: 3, end_u: 4, effective_height_u: 2, height_u: 2 });

  it("renders placed item primary label in the content card", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    expect(screen.getByTestId("placed-front-placement-1").textContent).toContain("Production Server");
  });

  it("renders model_name in the diagram", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    expect(screen.getByText("Dell R750")).toBeTruthy();
  });

  it("clicking the content card calls onSelectPlacement", () => {
    const onSelect = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onSelectPlacement={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("placed-front-placement-1"));
    expect(onSelect).toHaveBeenCalledWith(PLACEMENT);
  });

  it("content card is draggable when onMovePlacement is provided", () => {
    const onMove = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />);
    expect(screen.getByTestId("placed-front-placement-1").getAttribute("draggable")).toBe("true");
  });

  it("content card is not draggable when onMovePlacement is omitted", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    expect(screen.getByTestId("placed-front-placement-1").getAttribute("draggable")).toBe("false");
  });

  it("U gutter cell is not draggable — it is not the drag source", () => {
    const onMove = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />);
    // U4 is the top rendered U of the 2U placement (U3–U4)
    const uCell = screen.getByTestId("u-cell-front-4");
    expect(uCell.getAttribute("draggable")).not.toBe("true");
  });

  it("U gutter cell is a separate element from the content card", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const card = screen.getByTestId("placed-front-placement-1");
    const uCell = screen.getByTestId("u-cell-front-4");
    expect(uCell).not.toBe(card);
  });

  it("selection ring/background applies to content card but not U gutter cell", () => {
    render(
      <RackUnitDiagram
        {...BASE_PROPS}
        front={[PLACEMENT]}
        selectedPlacementId="placement-1"
      />,
    );
    const card = screen.getByTestId("placed-front-placement-1");
    const uCell = screen.getByTestId("u-cell-front-4");
    // Content card gets the gold selection ring
    expect(card.style.boxShadow).toContain("ffd700");
    // U gutter cell has no selection styling
    expect(uCell.style.boxShadow).toBe("");
    expect(uCell.style.background).not.toContain("357abd");
  });

  it("shows target_asset_tag in Asset tag column when present", () => {
    const p = makePlacement({ id: "p-at", target_asset_tag: "AT-999" });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} />);
    expect(screen.getByText("AT-999")).toBeTruthy();
  });

  it("shows — in Asset tag column when target_asset_tag is null", () => {
    const p = makePlacement({ id: "p-no-at", target_asset_tag: null });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} />);
    // The Asset tag column header is visible
    expect(screen.getByTestId("diagram-col-asset").textContent?.trim()).toBe("Asset tag");
    // The content card contains the fallback dash
    const card = screen.getByTestId("placed-front-p-no-at");
    expect(card.textContent).toContain("—");
  });
});

// ── Empty row (click-to-place) ─────────────────────────────────────────────────

describe("RackUnitDiagram — empty row (click-to-place)", () => {
  it("renders a drop-cell testid for each empty U position", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    for (let u = 1; u <= 5; u++) {
      expect(screen.getByTestId(`drop-cell-front-${u}`)).toBeTruthy();
    }
  });

  it("clicking an empty row calls onEmptySlotClick with the U number", () => {
    const onEmpty = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} onEmptySlotClick={onEmpty} />);
    fireEvent.click(screen.getByTestId("drop-cell-front-3"));
    expect(onEmpty).toHaveBeenCalledWith(3);
  });

  it("clicking an empty row clears selection", () => {
    const onSelect = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} onSelectPlacement={onSelect} />);
    fireEvent.click(screen.getByTestId("drop-cell-front-2"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

// ── Side switching ─────────────────────────────────────────────────────────────

describe("RackUnitDiagram — side switching", () => {
  const FRONT_P = makePlacement({ id: "fp-1", start_u: 2 });
  const REAR_P = makePlacement({ id: "rp-1", start_u: 4 });

  it("shows front placements when side=front", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[FRONT_P]} rear={[REAR_P]} side="front" />);
    expect(screen.getByTestId("placed-front-fp-1")).toBeTruthy();
    expect(screen.queryByTestId("placed-rear-rp-1")).toBeNull();
  });

  it("shows rear placements when side=rear", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[FRONT_P]} rear={[REAR_P]} side="rear" />);
    expect(screen.getByTestId("placed-rear-rp-1")).toBeTruthy();
    expect(screen.queryByTestId("placed-front-fp-1")).toBeNull();
  });

  it("shows 'Rear side' hint when side=rear", () => {
    render(<RackUnitDiagram {...BASE_PROPS} side="rear" />);
    expect(screen.getByText(/Rear side/)).toBeTruthy();
  });
});

// ── Drag and drop ──────────────────────────────────────────────────────────────

describe("RackUnitDiagram — drag and drop", () => {
  afterEach(() => setActiveDragPayload(null));

  it("dragover on an empty slot calls preventDefault when onDropAtCell is provided", () => {
    render(
      <RackUnitDiagram {...BASE_PROPS} heightU={5} onDropAtCell={vi.fn()} />,
    );
    const cell = screen.getByTestId("drop-cell-front-3");
    // fireEvent returns false when the event was cancelled (preventDefault called)
    expect(fireEvent.dragOver(cell)).toBe(false);
  });

  it("dragover does not call preventDefault when neither onDropAtCell nor onMovePlacement is provided", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    const cell = screen.getByTestId("drop-cell-front-3");
    expect(fireEvent.dragOver(cell)).toBe(true);
  });
});
