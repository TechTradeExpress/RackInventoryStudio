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
    pub placement_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceDto {
    pub id: String,
    pub code: String,
    pub device_type: String,
    pub name: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub status: String,
    pub device_model_code: Option<String>,
    pub is_placed: bool,
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
