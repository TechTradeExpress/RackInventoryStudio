import { describe, it, expect } from "vitest";
import { issueToNavigationTarget, navigationTargetLabel } from "./navigation";
import type { ValidationIssueDto } from "../../api/tauriClient";

function makeIssue(
  object_type: string | null,
  object_id: string | null = null,
  rack_id: string | null = null,
): ValidationIssueDto {
  return {
    code: "VAL-TEST-001",
    level: "error",
    message: "test issue",
    object_type,
    object_id,
    object_code: null,
    file_path: null,
    rack_id,
  };
}

describe("issueToNavigationTarget", () => {
  it("maps rack issue to racks tab with rack id", () => {
    const result = issueToNavigationTarget(makeIssue("rack", "rack-uuid-1"));
    expect(result).toEqual({ tab: "racks", rackId: "rack-uuid-1" });
  });

  it("maps device issue to devices tab with device id", () => {
    const result = issueToNavigationTarget(makeIssue("device", "dev-uuid-1"));
    expect(result).toEqual({ tab: "devices", deviceId: "dev-uuid-1" });
  });

  it("maps device_model issue to device_models tab with model id", () => {
    const result = issueToNavigationTarget(
      makeIssue("device_model", "model-uuid-1"),
    );
    expect(result).toEqual({
      tab: "device_models",
      deviceModelId: "model-uuid-1",
    });
  });

  it("maps location issue to locations tab with location id", () => {
    const result = issueToNavigationTarget(
      makeIssue("location", "loc-uuid-1"),
    );
    expect(result).toEqual({ tab: "locations", locationId: "loc-uuid-1" });
  });

  it("maps placement issue to racks tab with placement id and rack id", () => {
    const result = issueToNavigationTarget(
      makeIssue("placement", "plc-uuid-1", "rack-uuid-2"),
    );
    expect(result).toEqual({
      tab: "racks",
      rackId: "rack-uuid-2",
      placementId: "plc-uuid-1",
    });
  });

  it("maps placement issue without rack_id to racks tab with only placement id", () => {
    const result = issueToNavigationTarget(
      makeIssue("placement", "plc-uuid-1", null),
    );
    expect(result).toEqual({
      tab: "racks",
      rackId: undefined,
      placementId: "plc-uuid-1",
    });
  });

  it("returns null for unknown object_type", () => {
    const result = issueToNavigationTarget(makeIssue("csv_file"));
    expect(result).toBeNull();
  });

  it("returns null when object_type is null", () => {
    const result = issueToNavigationTarget(makeIssue(null));
    expect(result).toBeNull();
  });

  it("returns rack target without rackId when object_id is null", () => {
    const result = issueToNavigationTarget(makeIssue("rack", null));
    expect(result).toEqual({ tab: "racks", rackId: undefined });
  });
});

describe("navigationTargetLabel", () => {
  it("returns Open Location for locations tab", () => {
    expect(navigationTargetLabel({ tab: "locations" })).toBe("Open Location");
  });

  it("returns Open Rack when rackId is present", () => {
    expect(navigationTargetLabel({ tab: "racks", rackId: "r1" })).toBe(
      "Open Rack",
    );
  });

  it("returns Open Racks when rackId is absent", () => {
    expect(navigationTargetLabel({ tab: "racks" })).toBe("Open Racks");
  });

  it("returns Open Device for devices tab", () => {
    expect(navigationTargetLabel({ tab: "devices" })).toBe("Open Device");
  });

  it("returns Open Device Model for device_models tab", () => {
    expect(navigationTargetLabel({ tab: "device_models" })).toBe(
      "Open Device Model",
    );
  });
});
