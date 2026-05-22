import type { PlacementDto } from "../../api/tauriClient";

export interface PlacementLabelData {
  /** Primary text: device/object name, or best code fallback */
  primary: string;
  /** Device model name/code (device placements only; null for rack-object placements) */
  model: string | null;
  /** "SN: <value>" when serial is known, otherwise null */
  serial: string | null;
  /** "Asset: <value>" when asset tag is known, otherwise null */
  asset: string | null;
  /** Human-readable U range, e.g. "U10" or "U10–U12" */
  uRange: string;
  /** Full tooltip string combining all known fields */
  title: string;
  /** Resolved effective height in U (≥ 1) */
  effectiveHeightU: number;
}

export function derivePlacementLabel(p: PlacementDto): PlacementLabelData {
  const primary =
    p.target_name ??
    p.model_name ??
    p.target_code ??
    p.model_code ??
    p.code;

  // model only for device placements; rack-object placements carry model name in target_name
  const model = p.model_name ?? p.model_code ?? null;

  const serial = p.target_serial ? `SN: ${p.target_serial}` : null;
  const asset  = p.target_asset_tag ? `Asset: ${p.target_asset_tag}` : null;

  const effectiveHeightU = p.effective_height_u ?? 1;

  const end = p.end_u;
  const uRange =
    end !== null && end !== p.start_u
      ? `U${p.start_u}–U${end}`
      : `U${p.start_u}`;

  const titleParts: string[] = [primary];
  if (model && model !== primary) titleParts.push(model);
  if (p.target_serial)    titleParts.push(`SN: ${p.target_serial}`);
  if (p.target_asset_tag) titleParts.push(`Asset: ${p.target_asset_tag}`);
  titleParts.push(uRange);

  return { primary, model, serial, asset, uRange, title: titleParts.join(" · "), effectiveHeightU };
}
