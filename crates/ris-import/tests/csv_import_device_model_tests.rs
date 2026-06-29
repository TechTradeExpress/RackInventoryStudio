use ris_core::{DeviceModel, DeviceType, RepositoryMetadata, ValidationLevel};
use ris_import::{CsvImportContext, CsvRowAction};
use ris_repository::{RepositoryData, RepositoryIndex, RepositoryLayout};

// ── helpers ───────────────────────────────────────────────────────────────────

fn make_metadata() -> RepositoryMetadata {
    RepositoryMetadata {
        id: "00000000-0000-0000-0000-000000000001".to_string(),
        code: "test-repo".to_string(),
        name: "Test".to_string(),
        format: "rack-inventory-studio".to_string(),
        version: "0.1".to_string(),
    }
}

fn make_model(id: &str, code: &str, device_type: DeviceType) -> DeviceModel {
    DeviceModel {
        id: id.to_string(),
        code: code.to_string(),
        device_type,
        name: code.to_string(),
        vendor: None,
        model: None,
        default_height_u: 1,
        description: None,
        tags: vec![],
    }
}

fn empty_context() -> CsvImportContext {
    CsvImportContext::empty()
}

fn context_with_models(models: Vec<DeviceModel>) -> CsvImportContext {
    let data = RepositoryData {
        metadata: make_metadata(),
        locations: vec![],
        racks: vec![],
        device_models: models,
        devices: vec![],
        placement_files: vec![],
        layout: RepositoryLayout::default(),
    };
    let index = RepositoryIndex::build(&data);
    CsvImportContext::from_index(&index)
}

fn has_code(issues: &[ris_core::ValidationIssue], code: &str) -> bool {
    issues.iter().any(|i| i.code == code)
}

fn has_code_level(
    issues: &[ris_core::ValidationIssue],
    code: &str,
    level: ValidationLevel,
) -> bool {
    issues.iter().any(|i| i.code == code && i.level == level)
}

fn all_issues(preview: &ris_import::CsvDeviceModelImportPreview) -> Vec<ris_core::ValidationIssue> {
    preview
        .issues
        .iter()
        .chain(preview.rows.iter().flat_map(|r| r.issues.iter()))
        .cloned()
        .collect()
}

// ── header validation ─────────────────────────────────────────────────────────

#[test]
fn dm_valid_minimal_headers_pass() {
    let csv = "device_type,name\nserver,My Server Model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(preview.issues.is_empty(), "no file-level issues expected");
    assert_eq!(preview.rows.len(), 1);
}

#[test]
fn dm_missing_required_header_device_type_reports_val_dm_001() {
    let csv = "name\nMy Server Model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(has_code(&preview.issues, "VAL-DM-001"));
    assert_eq!(preview.rows.len(), 0);
}

#[test]
fn dm_missing_required_header_name_reports_val_dm_001() {
    let csv = "device_type\nserver\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(has_code(&preview.issues, "VAL-DM-001"));
    assert_eq!(preview.rows.len(), 0);
}

#[test]
fn dm_unknown_column_reports_val_dm_002_warning() {
    let csv = "device_type,name,unknown_col\nserver,My Model,extra\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(has_code_level(
        &preview.issues,
        "VAL-DM-002",
        ValidationLevel::Warning
    ));
    assert_eq!(preview.rows.len(), 1);
}

#[test]
fn dm_unknown_column_does_not_block_import() {
    let csv = "device_type,name,unknown_col\nserver,My Model,extra\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

// ── name validation ───────────────────────────────────────────────────────────

#[test]
fn dm_missing_name_reports_val_dm_005() {
    let csv = "device_type,name\nserver,\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-005"));
}

#[test]
fn dm_name_present_passes() {
    let csv = "device_type,name\nserver,My Server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
    assert_eq!(preview.rows[0].name.as_deref(), Some("My Server"));
}

// ── device_type validation ────────────────────────────────────────────────────

#[test]
fn dm_missing_device_type_reports_val_dm_006() {
    let csv = "device_type,name\n,My Server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-006"));
}

#[test]
fn dm_invalid_device_type_reports_val_dm_007() {
    let csv = "device_type,name\nturbojet,My Model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-007"));
}

#[test]
fn dm_rack_object_device_type_is_valid_for_models() {
    let csv = "device_type,name\nrack_object,Blank Panel 1U\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(
        !has_code(&issues, "VAL-DM-007"),
        "rack_object must be valid for device model import"
    );
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
    assert_eq!(preview.rows[0].device_type.as_deref(), Some("rack_object"));
}

#[test]
fn dm_all_valid_device_types_pass() {
    let types = [
        "server",
        "network",
        "storage",
        "ups",
        "appliance",
        "rack_object",
        "other",
    ];
    for dt in &types {
        let csv = format!("device_type,name\n{dt},Test Model\n");
        let preview = ris_import::preview_device_model_csv_import(&csv, &empty_context());
        let issues = all_issues(&preview);
        assert!(
            !has_code(&issues, "VAL-DM-007"),
            "device_type '{}' should be valid",
            dt
        );
    }
}

// ── height_u validation ───────────────────────────────────────────────────────

#[test]
fn dm_valid_height_u_parses_correctly() {
    let csv = "device_type,name,height_u\nserver,My Server,2\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].height_u, Some(2));
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

#[test]
fn dm_height_u_absent_is_none() {
    let csv = "device_type,name\nserver,My Server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].height_u, None);
}

#[test]
fn dm_height_u_zero_reports_val_dm_008() {
    let csv = "device_type,name,height_u\nserver,My Server,0\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-008"));
}

#[test]
fn dm_height_u_invalid_string_reports_val_dm_008() {
    let csv = "device_type,name,height_u\nserver,My Server,two\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-008"));
}

// ── code uniqueness ───────────────────────────────────────────────────────────

#[test]
fn dm_duplicate_code_in_csv_reports_val_dm_003() {
    let csv = "device_type,name,code\nserver,Srv A,my-code\nserver,Srv B,my-code\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-003"));
    let dup_rows = preview
        .rows
        .iter()
        .filter(|r| has_code(&r.issues, "VAL-DM-003"))
        .count();
    assert_eq!(dup_rows, 2, "both duplicate code rows should be flagged");
}

#[test]
fn dm_duplicate_code_case_insensitive_reports_val_dm_003() {
    let csv = "device_type,name,code\nserver,Srv A,MY-CODE\nserver,Srv B,my-code\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-003"));
}

#[test]
fn dm_code_conflict_with_existing_model_reports_val_dm_004() {
    let ctx = context_with_models(vec![make_model(
        "cccc0001-0000-0000-0000-000000000001",
        "existing-model",
        DeviceType::Server,
    )]);
    let csv = "device_type,name,code\nserver,New Model,existing-model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-004"));
}

#[test]
fn dm_code_conflict_case_insensitive_reports_val_dm_004() {
    let ctx = context_with_models(vec![make_model(
        "cccc0001-0000-0000-0000-000000000001",
        "existing-model",
        DeviceType::Server,
    )]);
    let csv = "device_type,name,code\nserver,New Model,EXISTING-MODEL\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-DM-004"));
}

#[test]
fn dm_no_code_column_is_valid() {
    let csv = "device_type,name\nserver,My Server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
    assert_eq!(preview.rows[0].code, None);
}

#[test]
fn dm_blank_code_is_treated_as_absent() {
    let csv = "device_type,name,code\nserver,My Server,\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
    assert_eq!(preview.rows[0].code, None);
}

// ── tags validation ───────────────────────────────────────────────────────────

#[test]
fn dm_tags_split_by_semicolon() {
    let csv = "device_type,name,tags\nserver,My Server,access;switch\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].tags, vec!["access", "switch"]);
}

#[test]
fn dm_empty_tags_ok() {
    let csv = "device_type,name,tags\nserver,My Server,\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(preview.rows[0].tags.is_empty());
}

#[test]
fn dm_malformed_tags_reports_val_dm_009() {
    let csv = "device_type,name,tags\nserver,My Server,tag1;;tag2\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code_level(
        &issues,
        "VAL-DM-009",
        ValidationLevel::Warning
    ));
    assert_eq!(preview.rows[0].tags, vec!["tag1", "tag2"]);
}

// ── optional fields ───────────────────────────────────────────────────────────

#[test]
fn dm_optional_fields_captured() {
    let csv = "device_type,name,vendor,model_number,height_u,description\nserver,My Server,Acme,ACM-SRV-1,2,A demo server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].vendor.as_deref(), Some("Acme"));
    assert_eq!(preview.rows[0].model_number.as_deref(), Some("ACM-SRV-1"));
    assert_eq!(preview.rows[0].height_u, Some(2));
    assert_eq!(
        preview.rows[0].description.as_deref(),
        Some("A demo server")
    );
}

// ── actions ───────────────────────────────────────────────────────────────────

#[test]
fn dm_valid_row_has_action_create() {
    let csv = "device_type,name\nserver,My Server\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

#[test]
fn dm_row_with_error_has_action_skip_due_to_error() {
    let csv = "device_type,name\nturbojet,My Model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::SkipDueToError);
}

#[test]
fn dm_row_with_only_warning_has_action_create() {
    let csv = "device_type,name,tags\nserver,My Server,tag1;;tag2\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

// ── summary ───────────────────────────────────────────────────────────────────

#[test]
fn dm_summary_counts_correct() {
    let csv = "device_type,name\nserver,Good Model\nturbojet,Bad Model\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.summary.total_rows, 2);
    assert_eq!(preview.summary.valid_rows, 1);
    assert_eq!(preview.summary.error_rows, 1);
    assert_eq!(preview.summary.warning_rows, 0);
}

#[test]
fn dm_summary_warning_row_counted() {
    let csv = "device_type,name,tags\nserver,My Server,tag1;;tag2\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert_eq!(preview.summary.warning_rows, 1);
    assert_eq!(preview.summary.error_rows, 0);
    assert_eq!(preview.summary.valid_rows, 1);
}

#[test]
fn dm_summary_file_level_warning_does_not_inflate_warning_rows() {
    let csv = "device_type,name,UNKNOWN_COL\nserver,Srv A,ignored\n";
    let preview = ris_import::preview_device_model_csv_import(csv, &empty_context());
    assert!(
        preview.issues.iter().any(|i| i.code == "VAL-DM-002"),
        "expected VAL-DM-002 file-level warning"
    );
    assert_eq!(preview.summary.warning_rows, 0);
    assert_eq!(preview.summary.error_rows, 0);
    assert_eq!(preview.summary.valid_rows, 1);
}

// ── preview is idempotent ────────────────────────────────────────────────────

#[test]
fn dm_preview_does_not_mutate_context() {
    let ctx = empty_context();
    let csv = "device_type,name,code\nserver,My Server,my-code\n";
    let p1 = ris_import::preview_device_model_csv_import(csv, &ctx);
    let p2 = ris_import::preview_device_model_csv_import(csv, &ctx);
    assert_eq!(p1.rows.len(), p2.rows.len());
    assert_eq!(p1.rows[0].action, p2.rows[0].action);
}

// ── sample CSV matches schema ─────────────────────────────────────────────────

#[test]
fn dm_sample_csv_parses_without_errors() {
    // Keep in sync with DEVICE_MODEL_IMPORT_SAMPLE_CSV in commands/repository.rs
    let sample = "\
device_type,name,code,vendor,model_number,height_u,description,tags\n\
server,Demo 1U Server,,Acme,ACM-SRV-1,1,A one-unit server,demo\n\
network,Demo 24-port Switch,,Acme,ACM-SW-24,1,,access;switch\n\
storage,Demo Storage Array,,Acme,ACM-STR-4,4,,\n\
rack_object,Demo 1U Blank Panel,,Acme,ACM-BLANK-1,1,,\n\
";
    let preview = ris_import::preview_device_model_csv_import(sample, &empty_context());
    let errors: Vec<_> = all_issues(&preview)
        .into_iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "sample CSV should have no errors, got: {:#?}",
        errors.iter().map(|i| &i.message).collect::<Vec<_>>()
    );
    assert_eq!(preview.summary.total_rows, 4);
    assert_eq!(preview.summary.valid_rows, 4);
}
