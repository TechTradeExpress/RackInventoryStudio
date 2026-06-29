use ris_core::ValidationIssue;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CsvRowAction {
    /// Row is valid and will be created on import.
    Create,
    /// Row has at least one ERROR issue and will be skipped.
    SkipDueToError,
}

#[derive(Debug, Clone)]
pub struct CsvImportSummary {
    pub total_rows: usize,
    pub valid_rows: usize,
    pub error_rows: usize,
    /// Number of data rows that have at least one WARNING issue (includes rows that also have errors).
    /// File-level/header warnings are not counted here.
    pub warning_rows: usize,
}

#[derive(Debug, Clone)]
pub struct CsvDeviceImportPreviewRow {
    pub row_number: usize,
    pub device_type: Option<String>,
    pub name: Option<String>,
    pub device_model_code: Option<String>,
    /// Set when `device_model_code` resolves to a known model in the repository.
    pub resolved_device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub external_ref: Option<String>,
    pub status: Option<String>,
    pub tags: Vec<String>,
    pub action: CsvRowAction,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone)]
pub struct CsvDeviceImportPreview {
    pub rows: Vec<CsvDeviceImportPreviewRow>,
    /// File-level issues (header validation, parse errors).
    pub issues: Vec<ValidationIssue>,
    pub summary: CsvImportSummary,
}

// ── Device model import preview ───────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CsvDeviceModelImportPreviewRow {
    pub row_number: usize,
    pub device_type: Option<String>,
    pub name: Option<String>,
    pub code: Option<String>,
    pub vendor: Option<String>,
    pub model_number: Option<String>,
    pub height_u: Option<u32>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub action: CsvRowAction,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone)]
pub struct CsvDeviceModelImportPreview {
    pub rows: Vec<CsvDeviceModelImportPreviewRow>,
    pub issues: Vec<ValidationIssue>,
    pub summary: CsvImportSummary,
}
