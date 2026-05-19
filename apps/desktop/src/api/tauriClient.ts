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
  front_placement_count: number;
  rear_placement_count: number;
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

export interface PlacementDto {
  id: string;
  code: string;
  target_kind: string;
  target_id: string;
  target_code: string | null;
  target_name: string | null;
  device_type: string | null;
  start_u: number;
  height_u: number | null;
  effective_height_u: number | null;
  end_u: number | null;
  note: string | null;
  tags: string[];
}

export interface RackDetailDto {
  id: string;
  code: string;
  name: string;
  location_id: string;
  location_code: string;
  height_u: number;
  row: string | null;
  front: PlacementDto[];
  rear: PlacementDto[];
}

export function getRackDetail(rackId: string): Promise<RackDetailDto> {
  return invoke("get_rack_detail", { rackId });
}

export interface MovePlacementInput {
  placement_id: string;
  /** Destination rack ID. Omit or null to keep current rack. */
  new_rack_id?: string | null;
  /** Destination side. Omit or null to keep current side. */
  new_side?: "front" | "rear" | null;
  new_start_u: number;
  new_height_u: number | null;
}

export function movePlacement(input: MovePlacementInput): Promise<void> {
  return invoke("move_placement", { input });
}

export interface PlaceDeviceInput {
  rack_id: string;
  device_id: string;
  side: "front" | "rear";
  start_u: number;
  height_u: number | null;
}

export function placeDevice(input: PlaceDeviceInput): Promise<string> {
  return invoke("place_device", { input });
}

export interface PlaceRackObjectInput {
  rack_id: string;
  device_model_id: string;
  side: "front" | "rear";
  start_u: number;
  height_u: number | null;
}

export function placeRackObject(input: PlaceRackObjectInput): Promise<string> {
  return invoke("place_rack_object", { input });
}

export interface RemovePlacementInput {
  placement_id: string;
}

export function removePlacement(input: RemovePlacementInput): Promise<void> {
  return invoke("remove_placement", { input });
}

// ── Mutation commands ─────────────────────────────────────────────────────────

export interface AddLocationInput {
  code: string;
  name: string;
  description?: string;
  address?: string;
  tags: string[];
}

export function addLocation(input: AddLocationInput): Promise<string> {
  return invoke("add_location_cmd", { input });
}

export interface AddRackInput {
  location_id?: string;
  location_code?: string;
  code: string;
  name: string;
  height_u: number;
  row?: string;
  description?: string;
  tags: string[];
}

export function addRack(input: AddRackInput): Promise<string> {
  return invoke("add_rack_cmd", { input });
}

export interface AddDeviceModelInput {
  device_type: string;
  code: string;
  name: string;
  vendor?: string;
  model?: string;
  default_height_u: number;
  description?: string;
  tags: string[];
}

export function addDeviceModel(input: AddDeviceModelInput): Promise<string> {
  return invoke("add_device_model_cmd", { input });
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
