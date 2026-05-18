import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

// ── Repository summary ────────────────────────────────────────────────────────

export interface RepositorySummaryDto {
  repo_path: string;
  repository_code: string;
  repository_name: string;
  locations_count: number;
  racks_count: number;
  device_models_count: number;
  devices_count: number;
  placement_files_count: number;
  placements_count: number;
  unplaced_devices_count: number;
}

export interface ValidationSummaryDto {
  errors: number;
  warnings: number;
  infos: number;
  total: number;
}

export interface ValidationIssueDto {
  code: string;
  level: string;
  message: string;
  object_type: string | null;
  object_id: string | null;
  object_code: string | null;
  file_path: string | null;
}

export interface SaveSummaryDto {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
}

export interface OpenRepositoryResultDto {
  summary: RepositorySummaryDto;
  validation_summary: ValidationSummaryDto;
}

// ── Entity list DTOs ──────────────────────────────────────────────────────────

export interface LocationDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  tags: string[];
  rack_count: number;
}

export interface RackSummaryDto {
  id: string;
  code: string;
  name: string;
  location_id: string;
  location_code: string;
  height_u: number;
  row: string | null;
  placement_count: number;
}

export interface DeviceDto {
  id: string;
  code: string;
  device_type: string;
  name: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  status: string;
  device_model_code: string | null;
  is_placed: boolean;
}

export interface DeviceModelDto {
  id: string;
  code: string;
  device_type: string;
  name: string;
  vendor: string | null;
  model_number: string | null;
  default_height_u: number;
}

// ── Session commands ──────────────────────────────────────────────────────────

export function openRepository(path: string): Promise<OpenRepositoryResultDto> {
  return invoke("open_repository_cmd", { path });
}

export function getRepositorySummary(): Promise<RepositorySummaryDto> {
  return invoke("get_repository_summary");
}

export function validateCurrentRepository(): Promise<ValidationIssueDto[]> {
  return invoke("validate_current_repository");
}

export function saveCurrentRepository(): Promise<SaveSummaryDto> {
  return invoke("save_current_repository");
}

export function closeRepository(): Promise<void> {
  return invoke("close_repository");
}

// ── Read-only entity queries ──────────────────────────────────────────────────

export function listLocations(): Promise<LocationDto[]> {
  return invoke("list_locations");
}

export function listRacks(): Promise<RackSummaryDto[]> {
  return invoke("list_racks");
}

export function listDevices(): Promise<DeviceDto[]> {
  return invoke("list_devices");
}

export function listDeviceModels(): Promise<DeviceModelDto[]> {
  return invoke("list_device_models");
}

// ── Native dialog ─────────────────────────────────────────────────────────────

export async function selectRepositoryFolder(): Promise<string | null> {
  const result = await open({
    directory: true,
    multiple: false,
    title: "Select Repository Folder",
  });
  if (result === null || result === undefined) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}
