import type { PlacementDto } from "../../api/tauriClient";

// ── XML safety ────────────────────────────────────────────────────────────────

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Filename safety ───────────────────────────────────────────────────────────

export function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/_{2,}/g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return clean || "rack";
}

// ── SVG layout constants ──────────────────────────────────────────────────────

const SVG_W = 900;
const LEFT_M = 20;
const RIGHT_M = 20;
const TOP_M = 16;
const HEADER_H = 64;
const COL_HEADER_H = 22;
const UNIT_H = 24;
const FOOTER_H = 32;
const BOTTOM_M = 16;

const GUTTER_X = LEFT_M;
const GUTTER_W = 50;
const COL_X = LEFT_M + GUTTER_W; // 70
const NAME_W = 300;
const MODEL_W = 180;
const SERIAL_W = 160;
const ASSET_X = COL_X + NAME_W + MODEL_W + SERIAL_W; // 710
const ASSET_W = SVG_W - RIGHT_M - ASSET_X; // 170

// ── Input type ────────────────────────────────────────────────────────────────

export interface RackViewExportInput {
  rackName: string;
  rackCode: string;
  heightU: number;
  side: "front" | "rear";
  placements: PlacementDto[];
}

// ── SVG builder ───────────────────────────────────────────────────────────────

export function buildRackViewSvg(input: RackViewExportInput): string {
  const { rackName, rackCode, heightU, side, placements } = input;
  const sideLabel = side === "front" ? "Front" : "Rear";

  const colHeaderY = TOP_M + HEADER_H;
  const rowsY = colHeaderY + COL_HEADER_H;
  const svgH = rowsY + heightU * UNIT_H + FOOTER_H + BOTTOM_M;

  // Sort placements: visual top (highest U) first; break ties by target_name for determinism.
  const sorted = [...placements].sort((a, b) => {
    const aTopU = a.start_u + (a.effective_height_u ?? 1) - 1;
    const bTopU = b.start_u + (b.effective_height_u ?? 1) - 1;
    if (bTopU !== aTopU) return bTopU - aTopU;
    return (a.target_name ?? a.target_code ?? "").localeCompare(
      b.target_name ?? b.target_code ?? "",
    );
  });

  // Map visual-top U → placement (first one wins if there's an overlap)
  const topUMap = new Map<number, PlacementDto>();
  for (const p of sorted) {
    const h = p.effective_height_u ?? 1;
    const topU = p.start_u + h - 1;
    if (!topUMap.has(topU)) topUMap.set(topU, p);
  }

  // Which U cells are occupied (continuation rows — skip content area)
  const occupiedUs = new Set<number>();
  for (const p of sorted) {
    const h = p.effective_height_u ?? 1;
    for (let u = p.start_u; u < p.start_u + h; u++) occupiedUs.add(u);
  }

  // Clip paths prevent text from overflowing column boundaries
  const clipH = svgH - colHeaderY;
  const clips = [
    `<clipPath id="clip-gutter"><rect x="${GUTTER_X}" y="${colHeaderY}" width="${GUTTER_W - 1}" height="${clipH}"/></clipPath>`,
    `<clipPath id="clip-name"><rect x="${COL_X + 2}" y="${colHeaderY}" width="${NAME_W - 4}" height="${clipH}"/></clipPath>`,
    `<clipPath id="clip-model"><rect x="${COL_X + NAME_W + 2}" y="${colHeaderY}" width="${MODEL_W - 4}" height="${clipH}"/></clipPath>`,
    `<clipPath id="clip-serial"><rect x="${COL_X + NAME_W + MODEL_W + 2}" y="${colHeaderY}" width="${SERIAL_W - 4}" height="${clipH}"/></clipPath>`,
    `<clipPath id="clip-asset"><rect x="${ASSET_X + 2}" y="${colHeaderY}" width="${ASSET_W - 4}" height="${clipH}"/></clipPath>`,
  ].join("\n    ");

  const contentRight = SVG_W - RIGHT_M;
  const contentW = contentRight - COL_X;
  const rows: string[] = [];

  for (let u = heightU; u >= 1; u--) {
    const rowY = rowsY + (heightU - u) * UNIT_H;
    const midY = rowY + UNIT_H / 2 + 4;

    // U gutter (always rendered)
    rows.push(
      `<rect x="${GUTTER_X}" y="${rowY}" width="${GUTTER_W}" height="${UNIT_H}" fill="#f0f0f0" stroke="#cccccc" stroke-width="0.5"/>`,
      `<text x="${GUTTER_X + GUTTER_W / 2}" y="${midY}" text-anchor="middle" clip-path="url(#clip-gutter)" fill="#888888" font-size="10" font-family="monospace">U${u}</text>`,
    );

    if (topUMap.has(u)) {
      const p = topUMap.get(u)!;
      const h = p.effective_height_u ?? 1;
      const cellH = h * UNIT_H;
      const textY = rowY + cellH / 2 + 4;

      const name = escapeXml(
        p.target_name?.trim() ||
          (p.target_kind === "device" ? "Unnamed device" : "Unnamed object"),
      );
      const model = escapeXml(p.model_name?.trim() || "—");
      const serial = escapeXml(p.target_serial ?? "—");
      const asset = escapeXml(p.target_asset_tag ?? "—");

      const endU = p.start_u + h - 1;
      const uRange =
        endU !== p.start_u ? `U${p.start_u}–U${endU}` : `U${p.start_u}`;

      rows.push(
        `<rect x="${COL_X}" y="${rowY}" width="${contentW}" height="${cellH}" fill="#357abd" stroke="#2a6099" stroke-width="0.5"/>`,
        `<text x="${COL_X + 4}" y="${textY}" clip-path="url(#clip-name)" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">${name}</text>`,
        `<text x="${COL_X + NAME_W + 4}" y="${textY}" clip-path="url(#clip-model)" fill="white" font-size="10" font-family="sans-serif">${model}</text>`,
        `<text x="${COL_X + NAME_W + MODEL_W + 4}" y="${textY}" clip-path="url(#clip-serial)" fill="white" font-size="10" font-family="sans-serif">${serial}</text>`,
        `<text x="${ASSET_X + 4}" y="${textY}" clip-path="url(#clip-asset)" fill="white" font-size="10" font-family="sans-serif">${asset}</text>`,
        `<text x="${contentRight - 4}" y="${textY}" text-anchor="end" fill="rgba(255,255,255,0.7)" font-size="9" font-family="monospace">${escapeXml(uRange)}</text>`,
      );
    } else if (!occupiedUs.has(u)) {
      rows.push(
        `<rect x="${COL_X}" y="${rowY}" width="${contentW}" height="${UNIT_H}" fill="#f8f8f8" stroke="#e0e0e0" stroke-width="0.5"/>`,
      );
    }
    // continuation rows: placement rect already covers this area — nothing to add
  }

  const headerContent = [
    `<rect x="${LEFT_M}" y="${TOP_M}" width="${SVG_W - LEFT_M - RIGHT_M}" height="${HEADER_H}" fill="#e8e8e8" rx="3"/>`,
    `<text x="${LEFT_M + 16}" y="${TOP_M + 26}" fill="#222222" font-size="18" font-weight="bold" font-family="sans-serif">${escapeXml(rackName)}</text>`,
    `<text x="${LEFT_M + 16}" y="${TOP_M + 46}" fill="#555555" font-size="12" font-family="sans-serif">${escapeXml(rackCode)} · ${escapeXml(sideLabel)} side · ${heightU}U</text>`,
  ].join("\n  ");

  const colHeaderContent = [
    `<rect x="${LEFT_M}" y="${colHeaderY}" width="${SVG_W - LEFT_M - RIGHT_M}" height="${COL_HEADER_H}" fill="#d8d8d8"/>`,
    `<text x="${GUTTER_X + GUTTER_W / 2}" y="${colHeaderY + 15}" text-anchor="middle" fill="#444444" font-size="10" font-weight="bold" font-family="sans-serif">U</text>`,
    `<text x="${COL_X + 4}" y="${colHeaderY + 15}" fill="#444444" font-size="10" font-weight="bold" font-family="sans-serif">Name</text>`,
    `<text x="${COL_X + NAME_W + 4}" y="${colHeaderY + 15}" fill="#444444" font-size="10" font-weight="bold" font-family="sans-serif">Model</text>`,
    `<text x="${COL_X + NAME_W + MODEL_W + 4}" y="${colHeaderY + 15}" fill="#444444" font-size="10" font-weight="bold" font-family="sans-serif">Serial</text>`,
    `<text x="${ASSET_X + 4}" y="${colHeaderY + 15}" fill="#444444" font-size="10" font-weight="bold" font-family="sans-serif">Asset Tag</text>`,
  ].join("\n  ");

  const footerY = rowsY + heightU * UNIT_H + 10;
  const footerContent = `<text x="${SVG_W / 2}" y="${footerY + 14}" text-anchor="middle" fill="#aaaaaa" font-size="10" font-family="sans-serif">Generated by Rack Inventory Studio</text>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${svgH}" viewBox="0 0 ${SVG_W} ${svgH}">`,
    `  <defs>`,
    `    ${clips}`,
    `  </defs>`,
    `  ${headerContent}`,
    `  ${colHeaderContent}`,
    `  ${rows.join("\n  ")}`,
    `  ${footerContent}`,
    `</svg>`,
  ].join("\n");
}
