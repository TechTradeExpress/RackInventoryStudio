/// Tolerant raw data model for validation.
///
/// All fields are `Option` or loosely-typed so the loader never fails on
/// invalid enum values or missing required fields — those are reported as
/// `ValidationIssue`s instead.

#[derive(Debug)]
pub struct RawRepositoryData {
    pub repo_file: RawRepoFile,
    pub locations_file: Option<RawLocationsFile>,
    pub rack_files: Vec<RawRackFile>,
    pub device_model_files: Vec<RawDeviceModelFile>,
    pub device_files: Vec<RawDeviceFile>,
    pub placement_files: Vec<RawPlacementFile>,
    /// (file_path, error_message) for files that could not be parsed at all.
    pub parse_errors: Vec<(String, String)>,
}

#[derive(Debug, Default)]
pub struct RawRepoFile {
    pub file_path: String,
    pub format: Option<String>,
    pub version: Option<String>,
    // flattened from repository:
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug)]
pub struct RawLocationsFile {
    pub file_path: String,
    /// `false` when the `locations:` root key was absent (VAL-LOC-002).
    pub locations_key_present: bool,
    pub locations: Vec<RawLocation>,
}

#[derive(Debug, Clone, Default)]
pub struct RawLocation {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub tags: Vec<String>,
    /// `true` when `tags` was present in YAML but not a list of strings (VAL-GEN-008).
    pub tags_malformed: bool,
}

#[derive(Debug)]
pub struct RawRackFile {
    pub file_path: String,
    pub location_id: Option<String>,
    /// `false` when the `racks:` root key was absent (VAL-RACK-003).
    pub racks_key_present: bool,
    pub racks: Vec<RawRack>,
}

#[derive(Debug, Clone, Default)]
pub struct RawRack {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub height_u: Option<u32>,
    /// `true` when `height_u` was present but not a valid non-negative integer (VAL-RACK-005).
    pub height_u_bad: bool,
    pub tags: Vec<String>,
    /// `true` when `tags` was present but not a list of strings (VAL-GEN-008).
    pub tags_malformed: bool,
}

#[derive(Debug)]
pub struct RawDeviceModelFile {
    pub file_path: String,
    pub device_type: Option<String>,
    /// `false` when the `models:` root key was absent (VAL-MODEL-003).
    pub models_key_present: bool,
    pub models: Vec<RawDeviceModel>,
}

#[derive(Debug, Clone, Default)]
pub struct RawDeviceModel {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub default_height_u: Option<u32>,
    /// `true` when `default_height_u` was present but not a valid non-negative integer (VAL-MODEL-005).
    pub default_height_u_bad: bool,
    pub tags: Vec<String>,
    /// `true` when `tags` was present but not a list of strings (VAL-GEN-008).
    pub tags_malformed: bool,
}

#[derive(Debug)]
pub struct RawDeviceFile {
    pub file_path: String,
    pub device_type: Option<String>,
    /// `false` when the `devices:` root key was absent (VAL-DEV-003).
    pub devices_key_present: bool,
    pub devices: Vec<RawDevice>,
}

#[derive(Debug, Clone, Default)]
pub struct RawDevice {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
    pub device_model_id: Option<String>,
    pub serial_number: Option<String>,
    pub asset_tag: Option<String>,
    pub status: Option<String>,
    pub tags: Vec<String>,
    /// `true` when `tags` was present but not a list of strings (VAL-GEN-008).
    pub tags_malformed: bool,
}

#[derive(Debug)]
pub struct RawPlacementFile {
    pub file_path: String,
    pub rack_id: Option<String>,
    /// `false` when the `placements:` root key was absent (VAL-PLC-003).
    pub placements_key_present: bool,
    pub front_key_present: bool,
    pub rear_key_present: bool,
    pub front: Vec<RawPlacement>,
    pub rear: Vec<RawPlacement>,
}

#[derive(Debug, Clone, Default)]
pub struct RawPlacement {
    pub id: Option<String>,
    pub code: Option<String>,
    pub target_kind: Option<String>,
    pub target_id: Option<String>,
    pub start_u: Option<u32>,
    /// `true` when `start_u` was present but not a valid non-negative integer (VAL-PLC-009).
    pub start_u_bad: bool,
    pub height_u: Option<u32>,
    /// `true` when `height_u` was present but not a valid non-negative integer (VAL-PLC-010).
    pub height_u_bad: bool,
    pub tags: Vec<String>,
    /// `true` when `tags` was present but not a list of strings (VAL-GEN-008).
    pub tags_malformed: bool,
}
