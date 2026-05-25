import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RackUnitDiagram } from "./RackUnitDiagram";
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
    const nameHeader = screen.getByTestId("diagram-col-name");
    expect(nameHeader.textContent?.trim()).toBe("Name");
  });

  it('has "Model" and "Code / SN" column headers', () => {
    render(<RackUnitDiagram {...BASE_PROPS} />);
    expect(screen.getByTestId("diagram-col-model").textContent?.trim()).toBe("Model");
    expect(screen.getByTestId("diagram-col-code").textContent?.includes("Code")).toBe(true);
  });

  it('does not render "Type", "U range", or "St." as column headers', () => {
    const { container } = render(<RackUnitDiagram {...BASE_PROPS} />);
    const headerEl = container.querySelector('[aria-label="Rack diagram header"]')!;
    const columnTexts = Array.from(headerEl.children).map((c) => c.textContent?.trim());
    expect(columnTexts).not.toContain("Type");
    expect(columnTexts).not.toContain("U range");
    expect(columnTexts).not.toContain("St.");
    expect(columnTexts.some((t) => t === "St.")).toBe(false);
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

// ── U column range ─────────────────────────────────────────────────────────────

describe("RackUnitDiagram — U column range", () => {
  it("shows single U value for 1U placement (e.g. U10)", () => {
    const p = makePlacement({ id: "p1", start_u: 10, end_u: 10, effective_height_u: 1, height_u: 1 });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} heightU={42} />);
    const nameCell = screen.getByTestId("placed-front-p1");
    const row = nameCell.parentElement!;
    const uCell = row.firstChild as HTMLElement;
    expect(uCell.textContent).toContain("U10");
  });

  it("shows full U range for multi-U placement (e.g. U5–U7)", () => {
    const p = makePlacement({ id: "p2", start_u: 5, end_u: 7, effective_height_u: 3, height_u: 3 });
    render(<RackUnitDiagram {...BASE_PROPS} front={[p]} heightU={42} />);
    const nameCell = screen.getByTestId("placed-front-p2");
    const row = nameCell.parentElement!;
    const uCell = row.firstChild as HTMLElement;
    expect(uCell.textContent).toContain("U5–U7");
  });

  it("empty row U cell shows U-prefixed number", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    const dropCell = screen.getByTestId("drop-cell-front-3");
    const uCell = dropCell.firstChild as HTMLElement;
    expect(uCell.textContent).toContain("U3");
  });
});

// ── Occupied row ───────────────────────────────────────────────────────────────

describe("RackUnitDiagram — occupied row", () => {
  const PLACEMENT = makePlacement({ id: "placement-1", start_u: 3 });

  it("renders placed item with its name in the Name cell", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const nameCell = screen.getByTestId("placed-front-placement-1");
    expect(nameCell.textContent).toContain("Production Server");
  });

  it("renders model_name in the diagram", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    expect(screen.getByText("Dell R750")).toBeTruthy();
  });

  it("clicking anywhere in the row calls onSelectPlacement", () => {
    const onSelect = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onSelectPlacement={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("placed-front-placement-1"));
    expect(onSelect).toHaveBeenCalledWith(PLACEMENT);
  });

  it("Name cell is draggable when onMovePlacement is provided", () => {
    const onMove = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />);
    const nameCell = screen.getByTestId("placed-front-placement-1");
    expect(nameCell.getAttribute("draggable")).toBe("true");
  });

  it("Name cell is not draggable when onMovePlacement is omitted", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const nameCell = screen.getByTestId("placed-front-placement-1");
    expect(nameCell.getAttribute("draggable")).toBe("false");
  });

  it("U cell is not the drag source (not draggable)", () => {
    const onMove = vi.fn();
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />);
    const nameCell = screen.getByTestId("placed-front-placement-1");
    const row = nameCell.parentElement!;
    const uCell = row.firstChild as HTMLElement;
    expect(uCell.getAttribute("draggable")).not.toBe("true");
  });

  it("U cell does not carry the same testid as the draggable Name cell", () => {
    const onMove = vi.fn();
    const { container } = render(
      <RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />,
    );
    const nameCell = screen.getByTestId("placed-front-placement-1");
    const row = nameCell.parentElement!;
    const uCell = row.firstChild as HTMLElement;
    expect(uCell).not.toBe(nameCell);
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
