import { describe, it, expect } from "vitest";
import { derivePlacementLabel } from "./rackPlacementLabel";
import type { PlacementDto } from "../../api/tauriClient";

function make(overrides: Partial<PlacementDto> & { code: string }): PlacementDto {
  const { code } = overrides;
  return {
    id: code,
    target_kind: "device",
    target_id: "t1",
    target_code: null,
    target_name: null,
    device_type: "server",
    start_u: 1,
    height_u: 1,
    effective_height_u: 1,
    end_u: 1,
    note: null,
    tags: [],
    model_name: null,
    model_code: null,
    target_serial: null,
    target_asset_tag: null,
    ...overrides,
  };
}

describe("derivePlacementLabel", () => {
  it("1U device: primary=name, model filled, serial/asset null", () => {
    const label = derivePlacementLabel(make({
      code: "plc-01",
      target_name: "Production Web Server",
      model_name: "Dell R750",
      effective_height_u: 1,
      start_u: 10,
      end_u: 10,
    }));
    expect(label.primary).toBe("Production Web Server");
    expect(label.model).toBe("Dell R750");
    expect(label.serial).toBeNull();
    expect(label.asset).toBeNull();
    expect(label.effectiveHeightU).toBe(1);
    expect(label.uRange).toBe("U10");
  });

  it("2U device: primary=name, model+serial in secondary", () => {
    const label = derivePlacementLabel(make({
      code: "plc-02",
      target_name: "Database Server",
      model_name: "Dell R750",
      target_serial: "SN123456",
      effective_height_u: 2,
      start_u: 5,
      end_u: 6,
    }));
    expect(label.primary).toBe("Database Server");
    expect(label.model).toBe("Dell R750");
    expect(label.serial).toBe("SN: SN123456");
    expect(label.asset).toBeNull();
    expect(label.effectiveHeightU).toBe(2);
    expect(label.uRange).toBe("U5–U6");
  });

  it("3U+ device: all four label lines populated", () => {
    const label = derivePlacementLabel(make({
      code: "plc-03",
      target_name: "Storage Array",
      model_name: "NetApp AFF A400",
      target_serial: "NAT001",
      target_asset_tag: "AT-999",
      effective_height_u: 4,
      start_u: 20,
      end_u: 23,
    }));
    expect(label.primary).toBe("Storage Array");
    expect(label.model).toBe("NetApp AFF A400");
    expect(label.serial).toBe("SN: NAT001");
    expect(label.asset).toBe("Asset: AT-999");
    expect(label.effectiveHeightU).toBe(4);
    expect(label.uRange).toBe("U20–U23");
  });

  it("fallback when target_name is null: uses model_name as primary, model is null (no duplication)", () => {
    const label = derivePlacementLabel(make({
      code: "plc-04",
      target_name: null,
      model_name: "PowerEdge R640",
      effective_height_u: 1,
      start_u: 3,
      end_u: 3,
    }));
    expect(label.primary).toBe("PowerEdge R640");
    expect(label.model).toBeNull();
    expect(label.title).not.toMatch(/PowerEdge R640.*PowerEdge R640/);
  });

  it("no model duplication: device without name, model_name becomes primary; model field suppressed", () => {
    const label = derivePlacementLabel(make({
      code: "plc-noname",
      target_name: null,
      model_name: "PowerEdge R640",
      model_code: "R640",
      effective_height_u: 1,
      start_u: 5,
      end_u: 5,
    }));
    expect(label.primary).toBe("PowerEdge R640");
    expect(label.model).toBeNull();
    // title must not contain the model string twice
    const occurrences = (label.title.match(/PowerEdge R640/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("fallback to target_code when name and model missing", () => {
    const label = derivePlacementLabel(make({
      code: "plc-05",
      target_code: "srv-007",
      target_name: null,
      model_name: null,
      effective_height_u: 1,
      start_u: 1,
      end_u: 1,
    }));
    expect(label.primary).toBe("srv-007");
  });

  it("fallback to placement code when all target fields are null", () => {
    const label = derivePlacementLabel(make({
      code: "plc-bare",
      target_code: null,
      target_name: null,
      model_name: null,
      model_code: null,
    }));
    expect(label.primary).toBe("plc-bare");
  });

  it("title contains primary, model, serial, asset, and uRange", () => {
    const label = derivePlacementLabel(make({
      code: "plc-06",
      target_name: "App Server",
      model_name: "HP DL380",
      target_serial: "HP001",
      target_asset_tag: "AT-100",
      effective_height_u: 2,
      start_u: 8,
      end_u: 9,
    }));
    expect(label.title).toContain("App Server");
    expect(label.title).toContain("HP DL380");
    expect(label.title).toContain("SN: HP001");
    expect(label.title).toContain("Asset: AT-100");
    expect(label.title).toContain("U8–U9");
  });

  it("serial and asset not shown when values are null", () => {
    const label = derivePlacementLabel(make({
      code: "plc-07",
      target_name: "Monitor",
      target_serial: null,
      target_asset_tag: null,
    }));
    expect(label.serial).toBeNull();
    expect(label.asset).toBeNull();
    expect(label.title).not.toContain("SN:");
    expect(label.title).not.toContain("Asset:");
  });

  it("rack-object placement: model=null since target_name already carries model name", () => {
    const label = derivePlacementLabel(make({
      code: "plc-ro",
      target_kind: "device_model",
      target_name: "Blank 1U",
      model_name: null,
      model_code: null,
      target_serial: null,
      target_asset_tag: null,
      effective_height_u: 1,
      start_u: 1,
      end_u: 1,
    }));
    expect(label.primary).toBe("Blank 1U");
    expect(label.model).toBeNull();
    expect(label.serial).toBeNull();
    expect(label.asset).toBeNull();
  });

  it("uRange is single U when start_u equals end_u", () => {
    const label = derivePlacementLabel(make({
      code: "plc-08",
      start_u: 5,
      end_u: 5,
      effective_height_u: 1,
    }));
    expect(label.uRange).toBe("U5");
  });

  it("title excludes model when it equals primary (rack-object case)", () => {
    const label = derivePlacementLabel(make({
      code: "plc-09",
      target_name: "Blank 2U",
      model_name: null,
      effective_height_u: 2,
      start_u: 1,
      end_u: 2,
    }));
    // model is null so title should only have primary + uRange
    expect(label.title).toBe("Blank 2U · U1–U2");
  });
});
