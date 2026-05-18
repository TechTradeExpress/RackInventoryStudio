import { describe, it, expect } from "vitest";
import { buildOccupancy } from "./rackOccupancy";
import type { PlacementDto } from "../../api/tauriClient";

function makePlacement({ code, ...rest }: Partial<PlacementDto> & { code: string }): PlacementDto {
  return {
    id: code,
    code,
    target_kind: "device",
    target_id: "t1",
    target_code: code,
    target_name: null,
    device_type: null,
    start_u: 1,
    height_u: null,
    effective_height_u: 1,
    end_u: 1,
    note: null,
    tags: [],
    ...rest,
  };
}

describe("buildOccupancy", () => {
  it("empty rack returns all units as empty", () => {
    const { units, warnings } = buildOccupancy(4, []);
    expect(units).toHaveLength(4);
    expect(units.every((u) => u.kind === "empty")).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("1U placement marks exactly one unit as occupied", () => {
    const p = makePlacement({ code: "A", start_u: 2, end_u: 2, effective_height_u: 1 });
    const { units, warnings } = buildOccupancy(4, [p]);
    expect(units[0].kind).toBe("empty");
    expect(units[1].kind).toBe("occupied");
    expect(units[2].kind).toBe("empty");
    expect(units[3].kind).toBe("empty");
    expect(warnings).toHaveLength(0);
  });

  it("multi-U placement marks all occupied units and sets isTop on the highest U", () => {
    // 3U placement at U1-U3 in a 4U rack
    const p = makePlacement({ code: "B", start_u: 1, end_u: 3, effective_height_u: 3 });
    const { units, warnings } = buildOccupancy(4, [p]);
    // units[0]=U1, units[1]=U2, units[2]=U3 occupied; units[3]=U4 empty
    expect(units[0].kind).toBe("occupied");
    expect(units[1].kind).toBe("occupied");
    expect(units[2].kind).toBe("occupied");
    expect(units[3].kind).toBe("empty");
    // isTop = true only at U3 (index 2), the highest occupied U
    expect((units[0] as Extract<typeof units[0], { kind: "occupied" }>).isTop).toBe(false);
    expect((units[1] as Extract<typeof units[1], { kind: "occupied" }>).isTop).toBe(false);
    expect((units[2] as Extract<typeof units[2], { kind: "occupied" }>).isTop).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it("end_u null with effective_height_u computes correct end", () => {
    const p = makePlacement({ code: "C", start_u: 2, end_u: null, effective_height_u: 2 });
    const { units, warnings } = buildOccupancy(5, [p]);
    // should occupy U2 and U3
    expect(units[1].kind).toBe("occupied");
    expect(units[2].kind).toBe("occupied");
    expect(units[0].kind).toBe("empty");
    expect(units[3].kind).toBe("empty");
    expect(warnings).toHaveLength(0);
  });

  it("end_u null and effective_height_u null marks start_u as incomplete with warning", () => {
    const p = makePlacement({ code: "D", start_u: 2, end_u: null, effective_height_u: null });
    const { units, warnings } = buildOccupancy(4, [p]);
    expect(units[1].kind).toBe("incomplete");
    expect(units[0].kind).toBe("empty");
    expect(warnings.some((w) => w.placementCode === "D" && w.reason.includes("height unknown"))).toBe(true);
  });

  it("start_u less than 1 returns a warning and does not crash", () => {
    const p = makePlacement({ code: "E", start_u: 0 });
    const { units, warnings } = buildOccupancy(4, [p]);
    expect(units.every((u) => u.kind === "empty")).toBe(true);
    expect(warnings.some((w) => w.placementCode === "E" && w.reason.includes("start_u < 1"))).toBe(true);
  });

  it("start_u greater than rack height returns a warning and does not crash", () => {
    const p = makePlacement({ code: "F", start_u: 10, end_u: 10, effective_height_u: 1 });
    const { units, warnings } = buildOccupancy(4, [p]);
    expect(units.every((u) => u.kind === "empty")).toBe(true);
    expect(warnings.some((w) => w.placementCode === "F" && w.reason.includes("exceeds rack height"))).toBe(true);
  });

  it("placement extending above rack height is clamped and returns a warning", () => {
    const p = makePlacement({ code: "G", start_u: 3, end_u: 6, effective_height_u: 4 });
    const { units, warnings } = buildOccupancy(4, [p]);
    // U3 and U4 occupied, U5 and U6 clamped
    expect(units[2].kind).toBe("occupied");
    expect(units[3].kind).toBe("occupied");
    expect(warnings.some((w) => w.placementCode === "G" && w.reason.includes("clamped"))).toBe(true);
  });

  it("overlapping placements return a warning", () => {
    const p1 = makePlacement({ code: "H1", start_u: 1, end_u: 3, effective_height_u: 3 });
    const p2 = makePlacement({ code: "H2", start_u: 2, end_u: 4, effective_height_u: 3 });
    const { warnings } = buildOccupancy(6, [p1, p2]);
    expect(warnings.some((w) => w.placementCode === "H2" && w.reason.includes("overlap"))).toBe(true);
    expect(warnings.some((w) => w.reason.includes("H1"))).toBe(true);
  });
});
