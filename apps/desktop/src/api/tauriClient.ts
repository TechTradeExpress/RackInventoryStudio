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
  rack_id: string | null;
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
  description: string | null;
  tags: string[];
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
  external_ref: string | null;
  status: string;
  device_model_code: string | null;
  device_model_id: string | null;
  is_placed: boolean;
  description: string | null;
  tags: string[];
}

export interface DeviceModelDto {
  id: string;
  code: string;
  device_type: string;
  name: string;
  vendor: string | null;
  model_number: string | null;
  default_height_u: number;
  description: string | null;
  tags: string[];
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

export interface AddDeviceInput {
  device_type: string;
  code: string;
  name?: string;
  device_model_id?: string;
  serial_number?: string;
  asset_tag?: string;
  external_ref?: string;
  status: string;
  description?: string;
  tags: string[];
}

export function addDevice(input: AddDeviceInput): Promise<string> {
  return invoke("add_device_cmd", { input });
}

export interface UpdateLocationInput {
  id: string;
  code: string;
  name: string;
  description?: string;
  address?: string;
  tags: string[];
}

export function updateLocation(input: UpdateLocationInput): Promise<void> {
  return invoke("update_location_cmd", { input });
}

export function deleteLocation(id: string): Promise<void> {
  return invoke("delete_location_cmd", { id });
}

export interface UpdateRackInput {
  id: string;
  location_id: string;
  code: string;
  name: string;
  height_u: number;
  row?: string;
  description?: string;
  tags: string[];
}

export function updateRack(input: UpdateRackInput): Promise<void> {
  return invoke("update_rack_cmd", { input });
}

export function deleteRack(id: string): Promise<void> {
  return invoke("delete_rack_cmd", { id });
}

export interface UpdateDeviceModelInput {
  id: string;
  device_type: string;
  code: string;
  name: string;
  vendor?: string;
  model?: string;
  default_height_u: number;
  description?: string;
  tags: string[];
}

export function updateDeviceModel(input: UpdateDeviceModelInput): Promise<void> {
  return invoke("update_device_model_cmd", { input });
}

export function deleteDeviceModel(id: string): Promise<void> {
  return invoke("delete_device_model_cmd", { id });
}

export interface UpdateDeviceInput {
  id: string;
  device_type: string;
  code: string;
  name?: string;
  device_model_id?: string;
  serial_number?: string;
  asset_tag?: string;
  external_ref?: string;
  status: string;
  description?: string;
  tags: string[];
}

export function updateDevice(input: UpdateDeviceInput): Promise<void> {
  return invoke("update_device_cmd", { input });
}

export function deleteDevice(id: string): Promise<void> {
  return invoke("delete_device_cmd", { id });
}

// ── CSV import ────────────────────────────────────────────────────────────────

export interface CsvImportIssueDto {
  code: string;
  level: string;
  message: string;
  details: string | null;
}

export interface CsvImportSummaryDto {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  warning_count: number;
}

export interface CsvImportPreviewRowDto {
  row_number: number;
  code: string | null;
  device_type: string | null;
  name: string | null;
  device_model_code: string | null;
  serial_number: string | null;
  asset_tag: string | null;
  status: string | null;
  action: "create" | "skip_due_to_error";
  issues: CsvImportIssueDto[];
}

export interface CsvImportPreviewDto {
  summary: CsvImportSummaryDto;
  file_issues: CsvImportIssueDto[];
  rows: CsvImportPreviewRowDto[];
}

export interface CsvImportResultDto {
  created_count: number;
  warning_count: number;
}

export function previewDeviceCsvImport(
  csvContent: string,
): Promise<CsvImportPreviewDto> {
  return invoke("preview_device_csv_import_cmd", { csvContent });
}

export function importDeviceCsv(
  csvContent: string,
): Promise<CsvImportResultDto> {
  return invoke("import_device_csv_cmd", { csvContent });
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SearchNavigationDto {
  location_id: string | null;
  rack_id: string | null;
  device_id: string | null;
  device_model_id: string | null;
  placement_id: string | null;
}

export interface SearchResultDto {
  kind: "location" | "rack" | "device" | "device_model" | "placement";
  id: string;
  code: string;
  label: string;
  detail: string | null;
  score: number;
  navigation: SearchNavigationDto;
}

export function searchRepository(query: string): Promise<SearchResultDto[]> {
  return invoke("search_repository_cmd", { query });
}

// ── Git ───────────────────────────────────────────────────────────────────────

export interface GitStatusDto {
  is_repository: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  is_clean: boolean;
  staged_count: number;
  unstaged_count: number;
  untracked_count: number;
  message: string | null;
}

export interface GitCommitDto {
  hash: string;
  short_hash: string;
  subject: string;
  author: string | null;
  date: string | null;
}

export interface GitRemoteDto {
  name: string;
  url: string;
}

export function getGitStatus(): Promise<GitStatusDto> {
  return invoke("get_git_status");
}

export function initGitRepository(): Promise<void> {
  return invoke("init_git_repository");
}

export function getGitLog(limit?: number): Promise<GitCommitDto[]> {
  return invoke("get_git_log", { limit });
}

export function commitRepositoryChanges(message: string): Promise<GitCommitDto> {
  return invoke("commit_repository_changes", { message });
}

export function listGitRemotes(): Promise<GitRemoteDto[]> {
  return invoke("list_git_remotes");
}

export function addGitRemote(name: string, url: string): Promise<void> {
  return invoke("add_git_remote", { name, url });
}

export function pushGitCurrentBranch(remote: string): Promise<void> {
  return invoke("push_git_current_branch", { remote });
}

export function pullGitFfOnly(remote: string): Promise<RepositorySummaryDto> {
  return invoke("pull_git_ff_only", { remote });
}

// ── Create repository ─────────────────────────────────────────────────────────

export interface CreateRepositoryInput {
  path: string;
  code: string;
  name: string;
  initialize_git: boolean;
}

export function createRepository(
  input: CreateRepositoryInput,
): Promise<OpenRepositoryResultDto> {
  return invoke("create_repository_cmd", { input });
}

// ── CSV file I/O ──────────────────────────────────────────────────────────────

export function readCsvFile(path: string): Promise<string> {
  return invoke("read_csv_file", { path });
}

// ── Native dialog ─────────────────────────────────────────────────────────────

export async function selectCsvFile(): Promise<string | null> {
  const result = await open({
    directory: false,
    multiple: false,
    title: "Select CSV File",
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result === null || result === undefined) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}

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
