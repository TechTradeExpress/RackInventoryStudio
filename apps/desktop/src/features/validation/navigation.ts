import type { ValidationIssueDto } from "../../api/tauriClient";

export type ValidationNavigationTarget =
  | { tab: "locations"; locationId?: string }
  | { tab: "racks"; rackId?: string; placementId?: string }
  | { tab: "devices"; deviceId?: string }
  | { tab: "device_models"; deviceModelId?: string };

export function issueToNavigationTarget(
  issue: ValidationIssueDto,
): ValidationNavigationTarget | null {
  switch (issue.object_type) {
    case "location":
      return { tab: "locations", locationId: issue.object_id ?? undefined };
    case "rack":
      return { tab: "racks", rackId: issue.object_id ?? undefined };
    case "placement":
      return {
        tab: "racks",
        rackId: issue.rack_id ?? undefined,
        placementId: issue.object_id ?? undefined,
      };
    case "device":
      return { tab: "devices", deviceId: issue.object_id ?? undefined };
    case "device_model":
      return {
        tab: "device_models",
        deviceModelId: issue.object_id ?? undefined,
      };
    default:
      return null;
  }
}

export function navigationTargetLabel(
  target: ValidationNavigationTarget,
): string {
  switch (target.tab) {
    case "locations":
      return "Open Location";
    case "racks":
      return target.rackId ? "Open Rack" : "Open Racks";
    case "devices":
      return "Open Device";
    case "device_models":
      return "Open Device Model";
  }
}
