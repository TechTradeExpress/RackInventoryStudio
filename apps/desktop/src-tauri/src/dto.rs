use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositorySummaryDto {
    pub repo_path: String,
    pub repository_code: String,
    pub repository_name: String,
    pub locations_count: usize,
    pub racks_count: usize,
    pub device_models_count: usize,
    pub devices_count: usize,
    pub placement_files_count: usize,
    pub placements_count: usize,
    pub unplaced_devices_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationSummaryDto {
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidationIssueDto {
    pub code: String,
    pub level: String,
    pub message: String,
    pub object_type: Option<String>,
    pub object_id: Option<String>,
    pub object_code: Option<String>,
    pub file_path: Option<String>,
    pub rack_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveSummaryDto {
    pub created: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenRepositoryResultDto {
    pub summary: RepositorySummaryDto,
    pub validation_summary: ValidationSummaryDto,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LocationDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
    pub rack_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RackSummaryDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub location_id: String,
    pub location_code: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub front_placement_count: usize,
    pub rear_placement_count: usize,
    pub placement_count: usize,
    /// Sum of effective_height_u for all front placements (U slots occupied on the front).
    pub front_used_u: u32,
    /// Sum of effective_height_u for all rear placements (U slots occupied on the rear).
    pub rear_used_u: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceDto {
    pub id: String,
    pub code: String,
    pub device_type: String,
    pub name: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: String,
    pub device_model_code: Option<String>,
    pub device_model_id: Option<String>,
    pub is_placed: bool,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceModelDto {
    pub id: String,
    pub code: String,
    pub device_type: String,
    pub name: String,
    pub vendor: Option<String>,
    pub model_number: Option<String>,
    pub default_height_u: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlacementDto {
    pub id: String,
    pub code: String,
    pub target_kind: String,
    pub target_id: String,
    pub target_code: Option<String>,
    pub target_name: Option<String>,
    pub device_type: Option<String>,
    pub start_u: u32,
    pub height_u: Option<u32>,
    pub effective_height_u: Option<u32>,
    pub end_u: Option<u32>,
    pub note: Option<String>,
    pub tags: Vec<String>,
    /// Device model name (device placements only; null for rack-object placements)
    pub model_name: Option<String>,
    /// Device model code (device placements only; null for rack-object placements)
    pub model_code: Option<String>,
    /// Device serial number (device placements only)
    pub target_serial: Option<String>,
    /// Device asset tag (device placements only)
    pub target_asset_tag: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MovePlacementInputDto {
    pub placement_id: String,
    /// Destination rack ID. Missing/null = keep current rack.
    pub new_rack_id: Option<String>,
    /// Destination side ("front" | "rear"). Missing/null = keep current side.
    pub new_side: Option<String>,
    pub new_start_u: u32,
    pub new_height_u: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaceDeviceInputDto {
    pub rack_id: String,
    pub device_id: String,
    /// "front" or "rear"
    pub side: String,
    pub start_u: u32,
    pub height_u: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaceRackObjectInputDto {
    pub rack_id: String,
    pub device_model_id: String,
    /// "front" or "rear"
    pub side: String,
    pub start_u: u32,
    pub height_u: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RemovePlacementInputDto {
    pub placement_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddLocationInputDto {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddRackInputDto {
    pub location_id: Option<String>,
    pub location_code: Option<String>,
    pub code: String,
    pub name: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddDeviceModelInputDto {
    pub device_type: String,
    pub code: String,
    pub name: String,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddDeviceInputDto {
    pub device_type: String,
    pub code: String,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportIssueDto {
    pub code: String,
    pub level: String,
    pub message: String,
    pub details: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportSummaryDto {
    pub total_rows: usize,
    pub valid_rows: usize,
    pub error_rows: usize,
    pub warning_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportPreviewRowDto {
    pub row_number: usize,
    pub code: Option<String>,
    pub device_type: Option<String>,
    pub name: Option<String>,
    pub device_model_code: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub status: Option<String>,
    pub action: String,
    pub issues: Vec<CsvImportIssueDto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportPreviewDto {
    pub summary: CsvImportSummaryDto,
    pub file_issues: Vec<CsvImportIssueDto>,
    pub rows: Vec<CsvImportPreviewRowDto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CsvImportResultDto {
    pub created_count: usize,
    pub warning_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateLocationInputDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateRackInputDto {
    pub id: String,
    pub location_id: String,
    pub code: String,
    pub name: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateDeviceModelInputDto {
    pub id: String,
    pub device_type: String,
    pub code: String,
    pub name: String,
    pub vendor: Option<String>,
    pub model: Option<String>,
    pub default_height_u: u32,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateDeviceInputDto {
    pub id: String,
    pub device_type: String,
    pub code: String,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: String,
    pub description: Option<String>,
    pub tags: Vec<String>,
}

// ── Create repository ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRepositoryInputDto {
    pub path: String,
    pub code: String,
    pub name: String,
}

// ── Search DTOs ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchNavigationDto {
    pub location_id: Option<String>,
    pub rack_id: Option<String>,
    pub device_id: Option<String>,
    pub device_model_id: Option<String>,
    pub placement_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResultDto {
    pub kind: String,
    pub id: String,
    pub code: String,
    pub label: String,
    pub detail: Option<String>,
    pub score: u8,
    pub navigation: SearchNavigationDto,
}

// ── Git DTOs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatusDto {
    pub is_repository: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub is_clean: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommitDto {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitRemoteDto {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RackDetailDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub location_id: String,
    pub location_code: String,
    pub height_u: u32,
    pub row: Option<String>,
    pub front: Vec<PlacementDto>,
    pub rear: Vec<PlacementDto>,
}
