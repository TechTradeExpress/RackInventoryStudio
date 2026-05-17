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
