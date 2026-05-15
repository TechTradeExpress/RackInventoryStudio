use ris_core::{
    Device, DeviceModel, DeviceStatus, DeviceType, RepositoryMetadata, ValidationLevel,
};
use ris_import::{CsvImportContext, CsvRowAction};
use ris_repository::{RepositoryData, RepositoryIndex, RepositoryLayout};

// ── test helpers ──────────────────────────────────────────────────────────────

fn empty_context() -> CsvImportContext {
    CsvImportContext::empty()
}

fn make_metadata() -> RepositoryMetadata {
    RepositoryMetadata {
        id: "00000000-0000-0000-0000-000000000001".to_string(),
        code: "test-repo".to_string(),
        name: "Test".to_string(),
        format: "rack-inventory-studio".to_string(),
        version: "0.1".to_string(),
    }
}

fn make_device(
    id: &str,
    code: &str,
    device_type: DeviceType,
    serial_number: Option<&str>,
    asset_tag: Option<&str>,
) -> Device {
    Device {
        id: id.to_string(),
        code: code.to_string(),
        device_type,
        name: Some(code.to_string()),
        device_model_id: None,
        serial_number: serial_number.map(str::to_string),
        asset_tag: asset_tag.map(str::to_string),
        external_ref: None,
        status: DeviceStatus::InStock,
        description: None,
        tags: vec![],
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

fn context_with_devices(devices: Vec<Device>) -> CsvImportContext {
    let data = RepositoryData {
        metadata: make_metadata(),
        locations: vec![],
        racks: vec![],
        device_models: vec![],
        devices,
        placement_files: vec![],
        layout: RepositoryLayout::default(),
    };
    let index = RepositoryIndex::build(&data);
    CsvImportContext::from_index(&index)
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

fn context_with(devices: Vec<Device>, models: Vec<DeviceModel>) -> CsvImportContext {
    let data = RepositoryData {
        metadata: make_metadata(),
        locations: vec![],
        racks: vec![],
        device_models: models,
        devices,
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

fn all_issues(preview: &ris_import::CsvDeviceImportPreview) -> Vec<ris_core::ValidationIssue> {
    preview
        .issues
        .iter()
        .chain(preview.rows.iter().flat_map(|r| r.issues.iter()))
        .cloned()
        .collect()
}

// ── header validation ─────────────────────────────────────────────────────────

#[test]
fn valid_csv_headers_pass() {
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert!(
        !has_code(&preview.issues, "VAL-CSV-001"),
        "unexpected VAL-CSV-001 with valid headers"
    );
}

#[test]
fn missing_required_header_code_reports_val_csv_001() {
    let csv = "device_type,status,name\nserver,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert!(
        has_code(&preview.issues, "VAL-CSV-001"),
        "expected VAL-CSV-001 for missing 'code' header"
    );
    assert!(
        preview.rows.is_empty(),
        "rows should be empty on header error"
    );
}

#[test]
fn missing_required_header_status_reports_val_csv_001() {
    let csv = "code,device_type,name\nsrv-01,server,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert!(has_code(&preview.issues, "VAL-CSV-001"));
}

#[test]
fn unknown_column_reports_val_csv_002_warning() {
    let csv = "code,device_type,status,name,extra_col\nsrv-01,server,in_stock,Server One,extra\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert!(
        has_code_level(&preview.issues, "VAL-CSV-002", ValidationLevel::Warning),
        "expected VAL-CSV-002 Warning for unknown column"
    );
    // Unknown column must not block preview
    assert_eq!(preview.rows.len(), 1);
}

// ── code validation ───────────────────────────────────────────────────────────

#[test]
fn missing_code_reports_val_csv_003() {
    let csv = "code,device_type,status,name\n,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-003"), "expected VAL-CSV-003");
}

#[test]
fn invalid_code_format_reports_val_csv_004() {
    let csv = "code,device_type,status,name\nBad Code!,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-004"), "expected VAL-CSV-004");
}

#[test]
fn duplicate_code_in_csv_reports_val_csv_005() {
    let csv =
        "code,device_type,status,name\nsrv-01,server,in_stock,Srv A\nsrv-01,server,in_stock,Srv B\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-005"), "expected VAL-CSV-005");
    // Both rows with the duplicate should be flagged
    let dup_rows = preview
        .rows
        .iter()
        .filter(|r| has_code(&r.issues, "VAL-CSV-005"))
        .count();
    assert_eq!(dup_rows, 2, "both duplicate rows should have VAL-CSV-005");
}

#[test]
fn code_exists_in_repo_reports_val_csv_006() {
    let ctx = context_with_devices(vec![make_device(
        "aaaa0001-0000-0000-0000-000000000001",
        "srv-01",
        DeviceType::Server,
        None,
        None,
    )]);
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-006"), "expected VAL-CSV-006");
}

// ── name/sn/asset_tag validation ──────────────────────────────────────────────

#[test]
fn missing_name_sn_asset_tag_reports_val_csv_007() {
    let csv = "code,device_type,status\nsrv-01,server,in_stock\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-007"), "expected VAL-CSV-007");
}

#[test]
fn name_alone_satisfies_val_csv_007() {
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(!has_code(&issues, "VAL-CSV-007"), "unexpected VAL-CSV-007");
}

// ── status validation ─────────────────────────────────────────────────────────

#[test]
fn missing_status_reports_val_csv_008() {
    let csv = "code,device_type,status,name\nsrv-01,server,,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-008"), "expected VAL-CSV-008");
}

#[test]
fn invalid_status_reports_val_csv_009() {
    let csv = "code,device_type,status,name\nsrv-01,server,broken,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-009"), "expected VAL-CSV-009");
}

#[test]
fn all_valid_statuses_pass() {
    let statuses = [
        "planned",
        "in_stock",
        "installed",
        "to_remove",
        "removed",
        "disposed",
        "unknown",
    ];
    for status in &statuses {
        let csv = format!("code,device_type,status,name\nsrv-01,server,{status},Server One\n");
        let preview = ris_import::preview_csv_import(&csv, &empty_context());
        let issues = all_issues(&preview);
        assert!(
            !has_code(&issues, "VAL-CSV-009"),
            "status '{}' should be valid",
            status
        );
    }
}

// ── device_type validation ────────────────────────────────────────────────────

#[test]
fn missing_device_type_reports_val_csv_010() {
    let csv = "code,device_type,status,name\nsrv-01,,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-010"), "expected VAL-CSV-010");
}

#[test]
fn invalid_device_type_reports_val_csv_011() {
    let csv = "code,device_type,status,name\nsrv-01,turbojet,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-011"), "expected VAL-CSV-011");
}

#[test]
fn rack_object_device_type_reports_val_csv_011() {
    let csv = "code,device_type,status,name\npanel-01,rack_object,in_stock,Panel\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(
        has_code(&issues, "VAL-CSV-011"),
        "expected VAL-CSV-011 for rack_object device_type"
    );
}

// ── device model validation ───────────────────────────────────────────────────

#[test]
fn unknown_device_model_code_reports_val_csv_012() {
    let csv =
        "code,device_type,status,name,device_model_code\nsrv-01,server,in_stock,Srv,ghost-model\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-012"), "expected VAL-CSV-012");
}

#[test]
fn rack_object_device_model_code_reports_val_csv_013() {
    let ctx = context_with_models(vec![make_model(
        "cccc0001-0000-0000-0000-000000000001",
        "blank-1u",
        DeviceType::RackObject,
    )]);
    let csv =
        "code,device_type,status,name,device_model_code\nsrv-01,server,in_stock,Srv,blank-1u\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-013"), "expected VAL-CSV-013");
}

#[test]
fn device_type_mismatch_with_model_reports_val_csv_014() {
    let ctx = context_with_models(vec![make_model(
        "cccc0001-0000-0000-0000-000000000001",
        "cisco-sw",
        DeviceType::Network,
    )]);
    let csv =
        "code,device_type,status,name,device_model_code\nsrv-01,server,in_stock,Srv,cisco-sw\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-014"), "expected VAL-CSV-014");
}

#[test]
fn valid_device_model_code_resolves_to_device_model_id() {
    let model_id = "cccc0001-0000-0000-0000-000000000001";
    let ctx = context_with_models(vec![make_model(model_id, "dell-r650", DeviceType::Server)]);
    let csv =
        "code,device_type,status,name,device_model_code\nsrv-01,server,in_stock,Srv,dell-r650\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(
        preview.rows[0].resolved_device_model_id,
        Some(model_id.to_string()),
        "resolved_device_model_id should be set"
    );
}

// ── serial_number / asset_tag validation ──────────────────────────────────────

#[test]
fn duplicate_serial_number_in_csv_reports_val_csv_015() {
    let csv = "code,device_type,status,serial_number\nsrv-01,server,in_stock,SN001\nsrv-02,server,in_stock,SN001\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-015"), "expected VAL-CSV-015");
    let dup_rows = preview
        .rows
        .iter()
        .filter(|r| has_code(&r.issues, "VAL-CSV-015"))
        .count();
    assert_eq!(dup_rows, 2, "both duplicate serial rows should be flagged");
}

#[test]
fn serial_number_exists_in_repo_reports_val_csv_016() {
    let ctx = context_with_devices(vec![make_device(
        "aaaa0001-0000-0000-0000-000000000001",
        "srv-existing",
        DeviceType::Server,
        Some("EXISTING-SN"),
        None,
    )]);
    let csv = "code,device_type,status,serial_number\nsrv-01,server,in_stock,EXISTING-SN\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-016"), "expected VAL-CSV-016");
}

#[test]
fn duplicate_asset_tag_in_csv_reports_val_csv_017() {
    let csv = "code,device_type,status,asset_tag\nsrv-01,server,in_stock,TAG001\nsrv-02,server,in_stock,TAG001\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-017"), "expected VAL-CSV-017");
}

#[test]
fn asset_tag_exists_in_repo_reports_val_csv_018() {
    let ctx = context_with_devices(vec![make_device(
        "aaaa0001-0000-0000-0000-000000000001",
        "srv-existing",
        DeviceType::Server,
        None,
        Some("EXISTING-AT"),
    )]);
    let csv = "code,device_type,status,asset_tag\nsrv-01,server,in_stock,EXISTING-AT\n";
    let preview = ris_import::preview_csv_import(csv, &ctx);
    let issues = all_issues(&preview);
    assert!(has_code(&issues, "VAL-CSV-018"), "expected VAL-CSV-018");
}

// ── tags validation ───────────────────────────────────────────────────────────

#[test]
fn tags_are_split_by_semicolon() {
    let csv = "code,device_type,status,name,tags\nsrv-01,server,in_stock,Srv,access;switch\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].tags, vec!["access", "switch"]);
}

#[test]
fn empty_tags_are_ok() {
    let csv = "code,device_type,status,name,tags\nsrv-01,server,in_stock,Srv,\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(
        !has_code(&issues, "VAL-CSV-019"),
        "empty tags should not produce VAL-CSV-019"
    );
    assert!(preview.rows[0].tags.is_empty());
}

#[test]
fn malformed_tags_with_empty_segment_report_val_csv_019() {
    // "tag1;;tag2" has an empty segment between the semicolons
    let csv = "code,device_type,status,name,tags\nsrv-01,server,in_stock,Srv,tag1;;tag2\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let issues = all_issues(&preview);
    assert!(
        has_code_level(&issues, "VAL-CSV-019", ValidationLevel::Warning),
        "expected VAL-CSV-019 Warning for empty tag segment"
    );
    // Non-empty tags should still be present
    assert_eq!(preview.rows[0].tags, vec!["tag1", "tag2"]);
}

#[test]
fn single_tag_works() {
    let csv = "code,device_type,status,name,tags\nsrv-01,server,in_stock,Srv,production\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.rows[0].tags, vec!["production"]);
}

// ── preview action ────────────────────────────────────────────────────────────

#[test]
fn valid_row_has_action_create() {
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

#[test]
fn row_with_error_has_action_skip_due_to_error() {
    // invalid code format triggers VAL-CSV-004 ERROR
    let csv = "code,device_type,status,name\nBad!,server,in_stock,Server One\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].action, CsvRowAction::SkipDueToError);
}

#[test]
fn row_with_only_warning_has_action_create() {
    // tag1;;tag2 produces only a WARNING (VAL-CSV-019)
    let csv = "code,device_type,status,name,tags\nsrv-01,server,in_stock,Srv,tag1;;tag2\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.rows.len(), 1);
    assert_eq!(preview.rows[0].action, CsvRowAction::Create);
}

// ── preview does not mutate repository ───────────────────────────────────────

#[test]
fn preview_does_not_mutate_repository_context() {
    let ctx = context_with_devices(vec![]);
    let csv = "code,device_type,status,name\nsrv-01,server,in_stock,Server One\n";

    // Run preview twice; second result should be identical to first
    let p1 = ris_import::preview_csv_import(csv, &ctx);
    let p2 = ris_import::preview_csv_import(csv, &ctx);

    assert_eq!(p1.rows.len(), p2.rows.len());
    assert_eq!(p1.rows[0].action, p2.rows[0].action);
    // After first preview, code 'srv-01' must still NOT exist in context
    assert!(
        !ctx.has_device_code("srv-01"),
        "context must not be mutated by preview"
    );
}

// ── summary ───────────────────────────────────────────────────────────────────

#[test]
fn summary_counts_are_correct() {
    // Row 1: valid
    // Row 2: invalid (bad code format)
    let csv =
        "code,device_type,status,name\nsrv-01,server,in_stock,Good\nBad!,server,in_stock,Bad\n";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    assert_eq!(preview.summary.total_rows, 2);
    assert_eq!(preview.summary.valid_rows, 1);
    assert_eq!(preview.summary.error_rows, 1);
}

// ── multi-row valid import ────────────────────────────────────────────────────

#[test]
fn valid_multi_row_csv_from_spec_example() {
    let csv = "\
code,device_type,name,device_model_code,serial_number,asset_tag,external_ref,status,tags
srv-new-01,server,srv-new-01,,NEWSRV001,INV-05001,SRV-NEW-01,in_stock,new
srv-new-02,server,srv-new-02,,NEWSRV002,INV-05002,SRV-NEW-02,in_stock,new
sw-access-01,network,sw-access-01,,NEWSW001,INV-06001,SW-ACCESS-01,in_stock,access;switch
unknown-device-01,other,,,UNKNOWN001,INV-99999,,unknown,unidentified
";
    let preview = ris_import::preview_csv_import(csv, &empty_context());
    let errors: Vec<_> = all_issues(&preview)
        .into_iter()
        .filter(|i| i.level == ValidationLevel::Error)
        .collect();
    assert!(
        errors.is_empty(),
        "spec example should have no errors, got: {:#?}",
        errors.iter().map(|i| &i.message).collect::<Vec<_>>()
    );
    assert_eq!(preview.summary.total_rows, 4);
    assert_eq!(preview.summary.valid_rows, 4);
    assert_eq!(preview.rows[2].tags, vec!["access", "switch"]);
}

// ── context construction ──────────────────────────────────────────────────────

#[test]
fn context_from_index_picks_up_existing_data() {
    let ctx = context_with(
        vec![make_device(
            "aaaa0001-0000-0000-0000-000000000001",
            "srv-existing",
            DeviceType::Server,
            Some("SN-EXISTING"),
            Some("AT-EXISTING"),
        )],
        vec![make_model(
            "cccc0001-0000-0000-0000-000000000001",
            "dell-r650",
            DeviceType::Server,
        )],
    );
    assert!(ctx.has_device_code("srv-existing"));
    assert!(ctx.has_serial_number("SN-EXISTING"));
    assert!(ctx.has_asset_tag("AT-EXISTING"));
    assert!(ctx.get_device_model_by_code("dell-r650").is_some());
    assert!(!ctx.has_device_code("does-not-exist"));
}
