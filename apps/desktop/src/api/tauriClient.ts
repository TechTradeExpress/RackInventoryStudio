import { invoke } from "@tauri-apps/api/core";

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
