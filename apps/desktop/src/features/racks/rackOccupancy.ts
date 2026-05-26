import type { PlacementDto } from "../../api/tauriClient";

export type UnitState =
  | { kind: "empty" }
  | { kind: "occupied"; placement: PlacementDto; isTop: boolean }
  | { kind: "incomplete"; placement: PlacementDto };

export interface OccupancyWarning {
  placementCode: string;
  reason: string;
}

export interface RackOccupancy {
  // Index 0 = U1, index (heightU - 1) = top unit. Rendered top-to-bottom so reversed in display.
  units: UnitState[];
  warnings: OccupancyWarning[];
}

export function buildOccupancy(
  heightU: number,
  placements: PlacementDto[],
): RackOccupancy {
  const units: UnitState[] = Array.from({ length: heightU }, () => ({
    kind: "empty",
  }));
  const warnings: OccupancyWarning[] = [];

  for (const p of placements) {
    if (p.start_u < 1) {
      warnings.push({ placementCode: p.code, reason: "Start U is less than 1" });
      continue;
    }

    // Resolve end_u
    let endU = p.end_u;
    if (endU === null) {
      if (p.effective_height_u !== null && p.effective_height_u > 0) {
        endU = p.start_u + p.effective_height_u - 1;
      }
    }

    if (endU === null) {
      // Mark only start_u as incomplete
      const idx = p.start_u - 1;
      if (idx >= heightU) {
        warnings.push({
          placementCode: p.code,
          reason: `Start U (${p.start_u}) exceeds rack height ${heightU}`,
        });
      } else {
        const existing = units[idx];
        if (existing.kind !== "empty") {
          const prevCode =
            existing.kind === "occupied" || existing.kind === "incomplete"
              ? existing.placement.code
              : "unknown";
          warnings.push({
            placementCode: p.code,
            reason: `Overlaps U${p.start_u} already occupied by ${prevCode}`,
          });
        }
        units[idx] = { kind: "incomplete", placement: p };
      }
      warnings.push({
        placementCode: p.code,
        reason: "Height unknown — shown at start U only",
      });
      continue;
    }

    if (p.start_u > heightU) {
      warnings.push({
        placementCode: p.code,
        reason: `Start U (${p.start_u}) exceeds rack height ${heightU}`,
      });
      continue;
    }

    const clampedEnd = Math.min(endU, heightU);
    if (endU > heightU) {
      warnings.push({
        placementCode: p.code,
        reason: `End U (${endU}) exceeds rack height ${heightU} — clamped`,
      });
    }

    for (let u = p.start_u; u <= clampedEnd; u++) {
      const idx = u - 1;
      const existing = units[idx];
      if (existing.kind !== "empty") {
        const prevCode =
          existing.kind === "occupied" || existing.kind === "incomplete"
            ? existing.placement.code
            : "unknown";
        warnings.push({
          placementCode: p.code,
          reason: `overlaps U${u} already occupied by ${prevCode}`,
        });
      }
      units[idx] = { kind: "occupied", placement: p, isTop: u === clampedEnd };
    }
  }

  return { units, warnings };
}
