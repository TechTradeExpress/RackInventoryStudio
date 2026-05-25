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

describe("RackUnitDiagram — column layout", () => {
  it('has a "Name" column header', () => {
    render(<RackUnitDiagram {...BASE_PROPS} />);
    const nameHeader = screen.getByTestId("diagram-col-name");
    expect(nameHeader.textContent?.trim()).toBe("Name");
  });

  it('does not have "Front" or "Rear" as a data-column header', () => {
    const { container } = render(<RackUnitDiagram {...BASE_PROPS} />);
    const headerEl = container.querySelector('[aria-label="Rack diagram header"]');
    expect(headerEl).not.toBeNull();
    const columnTexts = Array.from(headerEl!.children).map((c) => c.textContent?.trim());
    expect(columnTexts).not.toContain("Front");
    expect(columnTexts).not.toContain("Rear");
  });

  it("renders additional metadata column headers beyond U and Name", () => {
    const { container } = render(<RackUnitDiagram {...BASE_PROPS} />);
    const headerEl = container.querySelector('[aria-label="Rack diagram header"]')!;
    const texts = Array.from(headerEl.children).map((c) => c.textContent?.trim());
    expect(texts).toContain("Type");
    expect(texts).toContain("Model");
    expect(texts.some((t) => t?.includes("Code"))).toBe(true);
    expect(texts.some((t) => t?.includes("range"))).toBe(true);
  });

  it("shows side context in hint text, not as column header", () => {
    render(<RackUnitDiagram {...BASE_PROPS} side="front" />);
    expect(screen.getByText(/Front side/)).toBeTruthy();
  });
});

describe("RackUnitDiagram — occupied row", () => {
  const PLACEMENT = makePlacement({ id: "placement-1", start_u: 3 });

  it("renders placed item with its name in the Name column", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const block = screen.getByTestId("placed-front-placement-1");
    expect(block.textContent).toContain("Production Server");
  });

  it("renders device_type in the block", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const block = screen.getByTestId("placed-front-placement-1");
    expect(block.textContent).toContain("server");
  });

  it("renders model_name in the block", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const block = screen.getByTestId("placed-front-placement-1");
    expect(block.textContent).toContain("Dell R750");
  });

  it("clicking placed block calls onSelectPlacement with that placement", () => {
    const onSelect = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onSelectPlacement={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("placed-front-placement-1"));
    expect(onSelect).toHaveBeenCalledWith(PLACEMENT);
  });

  it("placed block is draggable when onMovePlacement is provided", () => {
    const onMove = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} onMovePlacement={onMove} />,
    );
    const block = screen.getByTestId("placed-front-placement-1");
    expect(block.getAttribute("draggable")).toBe("true");
  });

  it("placed block is not draggable when onMovePlacement is omitted", () => {
    render(<RackUnitDiagram {...BASE_PROPS} front={[PLACEMENT]} />);
    const block = screen.getByTestId("placed-front-placement-1");
    expect(block.getAttribute("draggable")).toBe("false");
  });
});

describe("RackUnitDiagram — empty row (click-to-place)", () => {
  it("renders a drop-cell testid for each empty U position", () => {
    render(<RackUnitDiagram {...BASE_PROPS} heightU={5} />);
    for (let u = 1; u <= 5; u++) {
      expect(screen.getByTestId(`drop-cell-front-${u}`)).toBeTruthy();
    }
  });

  it("clicking an empty row calls onEmptySlotClick with the U number", () => {
    const onEmpty = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} heightU={5} onEmptySlotClick={onEmpty} />,
    );
    fireEvent.click(screen.getByTestId("drop-cell-front-3"));
    expect(onEmpty).toHaveBeenCalledWith(3);
  });

  it("clicking an empty row clears selection", () => {
    const onSelect = vi.fn();
    render(
      <RackUnitDiagram {...BASE_PROPS} heightU={5} onSelectPlacement={onSelect} />,
    );
    fireEvent.click(screen.getByTestId("drop-cell-front-2"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

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
